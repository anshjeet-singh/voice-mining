/**
 * Foreplay ad-spy integration. Pulls ads that are actually running (and
 * staying live) in the client's niche from the Foreplay discovery library,
 * formatted as pattern models for the ad generator. A long-running live ad
 * is a profitably spending ad; its hook shape and offer framing are proven.
 */

interface ForeplayAd {
  id: string;
  name?: string;
  headline?: string;
  description?: string;
  full_transcription?: string | null;
  cta_type?: string;
  display_format?: string;
  live?: boolean;
  running_duration?: { days?: number };
  emotional_drivers?: Record<string, number>;
  product_category?: string;
  image?: string;
  thumbnail?: string;
}

/** Format Foreplay ads as an LLM-ready blob. Pure, unit-testable. */
export function formatForeplayAds(ads: ForeplayAd[], cap = 12): string {
  const lines: string[] = [];
  for (const ad of ads.slice(0, cap)) {
    const bits: string[] = [];
    const days = ad.running_duration?.days ?? 0;
    bits.push(
      `AD by ${ad.name ?? "unknown"} (${(ad.display_format ?? "?").toLowerCase()}, ${
        ad.live ? "LIVE" : "ended"
      }, running ${days}+ days${ad.product_category ? `, sells: ${ad.product_category}` : ""})`
    );
    if (ad.headline) bits.push(`HEADLINE: ${ad.headline}`);
    if (ad.description) bits.push(`COPY: ${ad.description.replace(/\s+/g, " ").slice(0, 450)}`);
    if (ad.full_transcription) {
      bits.push(`VIDEO SCRIPT: ${ad.full_transcription.replace(/\s+/g, " ").slice(0, 500)}`);
    }
    if (ad.cta_type) bits.push(`CTA: ${ad.cta_type}`);
    const emotions = Object.entries(ad.emotional_drivers ?? {})
      .filter(([, v]) => v >= 7)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k} ${v}/10`);
    if (emotions.length) bits.push(`LEANS ON: ${emotions.join(", ")}`);
    lines.push(bits.join("\n"));
  }
  return lines.join("\n\n");
}

/**
 * Format Foreplay STATIC ads as design intelligence: same copy fields plus
 * the creative's image URL so the render session can VIEW the winning
 * layouts and clone them. Pure, unit-testable.
 */
export function formatForeplayStaticAds(ads: ForeplayAd[], cap = 10): string {
  const lines: string[] = [];
  for (const ad of ads.slice(0, cap)) {
    const bits: string[] = [];
    const days = ad.running_duration?.days ?? 0;
    bits.push(
      `STATIC by ${ad.name ?? "unknown"} (${ad.live ? "LIVE" : "ended"}, running ${days}+ days${
        ad.product_category ? `, sells: ${ad.product_category}` : ""
      })`
    );
    const img = ad.image || ad.thumbnail;
    if (img) bits.push(`IMAGE (view this to study the layout): ${img}`);
    if (ad.headline) bits.push(`HEADLINE: ${ad.headline}`);
    if (ad.description) bits.push(`COPY: ${ad.description.replace(/\s+/g, " ").slice(0, 450)}`);
    if (ad.cta_type) bits.push(`CTA: ${ad.cta_type}`);
    lines.push(bits.join("\n"));
  }
  return lines.join("\n\n");
}

/** Shared discovery fetch: run queries, dedupe, sort proven spenders first. */
async function fetchDiscoveryAds(key: string, queries: string[]): Promise<ForeplayAd[]> {
  const seen = new Set<string>();
  const ads: ForeplayAd[] = [];
  await Promise.allSettled(
    queries.map(async (url) => {
      try {
        const resp = await fetch(url, {
          headers: { Authorization: key },
          signal: AbortSignal.timeout(20_000),
        });
        if (!resp.ok) return;
        const data = (await resp.json()) as { data?: ForeplayAd[] };
        for (const ad of data.data ?? []) {
          if (!ad.id || seen.has(ad.id)) continue;
          seen.add(ad.id);
          ads.push(ad);
        }
      } catch (err) {
        console.warn("[foreplay] fetch failed:", String(err).slice(0, 120));
      }
    })
  );
  // Longest-running live ads first: they are the proven spenders
  ads.sort(
    (a, b) =>
      (b.live ? 1 : 0) - (a.live ? 1 : 0) ||
      (b.running_duration?.days ?? 0) - (a.running_duration?.days ?? 0)
  );
  return ads;
}

/**
 * Fetch winning ads for a niche: longest-running first (proven spenders),
 * topped up with most-relevant. Returns "" when no key or no results,
 * so callers can degrade gracefully.
 */
export async function fetchForeplayWinningAds(keyword: string): Promise<string> {
  const key = process.env.FOREPLAY_API_KEY;
  if (!key) return "";
  const primary = keyword.split(",")[0]?.trim() ?? keyword;
  const base = "https://public.api.foreplay.co/api/discovery/ads";
  const ads = await fetchDiscoveryAds(key, [
    `${base}?query=${encodeURIComponent(primary)}&limit=10&order=longest_running`,
    `${base}?query=${encodeURIComponent(primary)}&limit=8&order=most_relevant`,
  ]);
  if (!ads.length) return "";
  console.log(`[foreplay] "${primary}": ${ads.length} ads from the library`);
  return formatForeplayAds(ads);
}

/**
 * Fetch winning STATIC (image) ads for a niche, image URLs included, so the
 * statics render session has live design references beyond the local catalog.
 * Filters to image creatives client-side too, in case the API ignores the
 * display_format param. Returns "" when no key or no results.
 */
export async function fetchForeplayStaticAdInspiration(keyword: string): Promise<string> {
  const key = process.env.FOREPLAY_API_KEY;
  if (!key) return "";
  const primary = keyword.split(",")[0]?.trim() ?? keyword;
  const base = "https://public.api.foreplay.co/api/discovery/ads";
  const ads = await fetchDiscoveryAds(key, [
    `${base}?query=${encodeURIComponent(primary)}&limit=12&order=longest_running&display_format=image`,
    `${base}?query=${encodeURIComponent(primary)}&limit=8&order=most_relevant&display_format=image`,
  ]);
  const statics = ads.filter(
    (a) => (a.display_format ?? "").toLowerCase() === "image" || (!a.full_transcription && (a.image || a.thumbnail))
  );
  if (!statics.length) return "";
  console.log(`[foreplay] "${primary}": ${statics.length} static ads for design inspiration`);
  return formatForeplayStaticAds(statics);
}
