/**
 * The compounding creative-research library.
 *
 * Every Foreplay winner we ever see gets STORED (deduped on the source ad id).
 * Re-sightings bump timesSeen and refresh runningDays/live — an ad that keeps
 * showing up week after week is a profitably spending ad, and the library
 * remembers that even after Foreplay's feed moves on.
 *
 * Generations then retrieve the top-ranked rows for the niche that this
 * client has NOT been served recently, so references compound and rotate
 * instead of the same three proven spenders recurring in every batch.
 */
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { creativeIntel, creativeIntelServes } from "../drizzle/schema";
import { getDb } from "./db";
import {
  fetchForeplayAdsRaw,
  fetchForeplayStaticsRaw,
  formatForeplayAds,
  formatForeplayStaticAds,
  type ForeplayAd,
} from "./foreplay";

type IntelRow = typeof creativeIntel.$inferSelect;

/** Library ranking: live + longevity + persistence across sightings. Pure. */
export function scoreIntel(row: Pick<IntelRow, "live" | "runningDays" | "timesSeen">): number {
  return (row.live ? 40 : 0) + Math.min(row.runningDays, 120) + Math.min(row.timesSeen - 1, 10) * 5;
}

/** Map a library row back to the ForeplayAd shape the formatters render. */
export function rowToAd(row: IntelRow): ForeplayAd {
  return {
    id: row.sourceId,
    name: row.advertiser ?? undefined,
    headline: row.headline ?? undefined,
    description: row.copy ?? undefined,
    full_transcription: row.transcript ?? undefined,
    cta_type: row.ctaType ?? undefined,
    display_format: row.displayFormat ?? undefined,
    live: !!row.live,
    running_duration: { days: row.runningDays },
    product_category: row.productCategory ?? undefined,
    image: row.imageUrl ?? undefined,
  };
}

/** Upsert one fetched ad into the library (dedupe on sourceId). */
async function ingestAd(niche: string, ad: ForeplayAd): Promise<void> {
  const db = await getDb();
  if (!db || !ad.id) return;
  const existing = await db
    .select({ id: creativeIntel.id, timesSeen: creativeIntel.timesSeen })
    .from(creativeIntel)
    .where(eq(creativeIntel.sourceId, ad.id))
    .limit(1);
  const days = ad.running_duration?.days ?? 0;
  if (existing[0]) {
    await db
      .update(creativeIntel)
      .set({
        live: ad.live ? 1 : 0,
        runningDays: days,
        timesSeen: existing[0].timesSeen + 1,
        lastSeenAt: new Date(),
        imageUrl: (ad.image || ad.thumbnail || undefined)?.slice(0, 1000),
      })
      .where(eq(creativeIntel.id, existing[0].id));
    return;
  }
  await db.insert(creativeIntel).values({
    source: "foreplay",
    sourceId: ad.id.slice(0, 100),
    niche: niche.slice(0, 300),
    advertiser: ad.name?.slice(0, 200),
    displayFormat: (ad.display_format ?? "").toLowerCase().slice(0, 30) || null,
    headline: ad.headline?.slice(0, 500),
    copy: ad.description ?? null,
    transcript: ad.full_transcription ?? null,
    ctaType: ad.cta_type?.slice(0, 60),
    imageUrl: (ad.image || ad.thumbnail || undefined)?.slice(0, 1000),
    productCategory: ad.product_category?.slice(0, 200),
    live: ad.live ? 1 : 0,
    runningDays: days,
  });
}

/** Fetch fresh winners for a niche and fold them into the library. */
export async function refreshLibrary(niche: string): Promise<number> {
  const [general, statics] = await Promise.all([
    fetchForeplayAdsRaw(niche).catch(() => [] as ForeplayAd[]),
    fetchForeplayStaticsRaw(niche).catch(() => [] as ForeplayAd[]),
  ]);
  const seen = new Set<string>();
  const all = [...general, ...statics].filter((a) => {
    if (!a.id || seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
  for (const ad of all) await ingestAd(niche, ad).catch(() => {});
  return all.length;
}

/**
 * Top-ranked library rows for a niche that this client has NOT been served
 * in the last `cooldownDays`. Marks the returned rows as served.
 */
async function retrieve(
  niche: string,
  clientId: number,
  opts: { staticsOnly: boolean; limit: number; cooldownDays?: number }
): Promise<IntelRow[]> {
  const db = await getDb();
  if (!db) return [];
  const primary = niche.split(",")[0]?.trim() ?? niche;
  const cooldown = new Date(Date.now() - (opts.cooldownDays ?? 14) * 24 * 3600 * 1000);
  const recentlyServed = (
    await db
      .select({ intelId: creativeIntelServes.intelId })
      .from(creativeIntelServes)
      .where(and(eq(creativeIntelServes.clientId, clientId), gt(creativeIntelServes.servedAt, cooldown)))
  ).map((r) => r.intelId);

  const conditions = [eq(creativeIntel.niche, primary.slice(0, 300))];
  if (opts.staticsOnly) conditions.push(eq(creativeIntel.displayFormat, "image"));
  let rows = await db
    .select()
    .from(creativeIntel)
    .where(and(...conditions))
    .orderBy(desc(creativeIntel.lastSeenAt))
    .limit(200);
  const fresh = rows.filter((r) => !recentlyServed.includes(r.id));
  // Prefer unserved rows; pad with served ones only when the library is thin.
  rows = [...fresh, ...rows.filter((r) => recentlyServed.includes(r.id))];
  rows.sort((a, b) => scoreIntel(b) - scoreIntel(a));
  const picked = rows.slice(0, opts.limit);
  if (picked.length) {
    await db.insert(creativeIntelServes).values(picked.map((r) => ({ intelId: r.id, clientId })));
  }
  return picked;
}

/**
 * Rows worth archiving to the Drive swipe folder: PROVEN winners only
 * (20+ days running or currently live) that carry a transcript (the highest-
 * value asset, operator's call) or are genuine IMAGE creatives. Video ads
 * without transcripts never archive — their thumbnail screenshots polluted
 * the static swipe folder.
 */
export async function getUnarchivedIntel(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(creativeIntel)
    .where(
      sql`${creativeIntel.archivedAt} IS NULL AND (${creativeIntel.runningDays} >= 20 OR ${creativeIntel.live} = 1) AND (${creativeIntel.transcript} IS NOT NULL OR (${creativeIntel.displayFormat} = 'image' AND ${creativeIntel.imageUrl} IS NOT NULL))`
    )
    .orderBy(desc(creativeIntel.lastSeenAt))
    .limit(200);
  // Transcripts first (the value is in the words), then by proven-spender score
  rows.sort((a, b) => (b.transcript ? 1 : 0) - (a.transcript ? 1 : 0) || scoreIntel(b) - scoreIntel(a));
  return rows.slice(0, limit);
}

export async function markIntelArchived(ids: number[]): Promise<void> {
  const db = await getDb();
  if (!db || !ids.length) return;
  await db.update(creativeIntel).set({ archivedAt: new Date() }).where(sql`${creativeIntel.id} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
}

/** True when the niche's library was refreshed from Foreplay recently —
 *  serving from the library alone then costs zero API calls. Operator set
 *  the cadence to 24h: fresher than that is paying twice for the same feed. */
export async function recentlyRefreshed(niche: string, maxAgeHours = 24): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const primary = niche.split(",")[0]?.trim() ?? niche;
  const rows = await db
    .select({ last: sql<Date>`MAX(${creativeIntel.lastSeenAt})` })
    .from(creativeIntel)
    .where(eq(creativeIntel.niche, primary.slice(0, 300)));
  const last = rows[0]?.last ? new Date(rows[0].last).getTime() : 0;
  return Date.now() - last < maxAgeHours * 3600 * 1000;
}

/**
 * The claim-time entrypoint: refresh the library from Foreplay (skipped when
 * the niche was refreshed in the last 6h — no double-paying the API), then
 * serve rotated, ranked references. Degrades to "" like the old fetchers.
 */
export async function serveCreativeIntel(
  niche: string,
  clientId: number
): Promise<{ adsBlob: string; staticsBlob: string; libraryCount: number }> {
  if (!(await recentlyRefreshed(niche).catch(() => false))) {
    await refreshLibrary(niche).catch(() => 0);
  }
  const primary = niche.split(",")[0]?.trim() ?? niche;
  const db = await getDb();
  let libraryCount = 0;
  if (db) {
    const c = await db
      .select({ n: sql<number>`count(*)` })
      .from(creativeIntel)
      .where(eq(creativeIntel.niche, primary.slice(0, 300)));
    libraryCount = Number(c[0]?.n ?? 0);
  }
  const [general, statics] = [
    await retrieve(niche, clientId, { staticsOnly: false, limit: 12 }).catch(() => [] as IntelRow[]),
    await retrieve(niche, clientId, { staticsOnly: true, limit: 8 }).catch(() => [] as IntelRow[]),
  ];
  return {
    adsBlob: general.length ? formatForeplayAds(general.map(rowToAd)) : "",
    staticsBlob: statics.length ? formatForeplayStaticAds(statics.map(rowToAd)) : "",
    libraryCount,
  };
}
