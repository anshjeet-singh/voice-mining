import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertClient,
  InsertClientDocument,
  InsertJob,
  InsertMiningSearch,
  InsertReport,
  InsertUser,
  InsertVaultItem,
  activityLog,
  analysisResults,
  calendarEntries,
  clientDocuments,
  clients,
  jobs,
  miningSearches,
  reports,
  scrapeCache,
  sharedReports,
  trendSnapshots,
  users,
  vaultCollections,
  vaultItems,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───────────────────────────────────────────────────────────────────

import { ENV } from "./_core/env";

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (ENV.adminEmail && user.email && user.email.toLowerCase() === ENV.adminEmail.toLowerCase()) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0] ?? undefined;
}

// ─── Mining Searches ─────────────────────────────────────────────────────────

export async function createMiningSearch(data: InsertMiningSearch): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(miningSearches).values(data);
  return result.insertId;
}

export async function getMiningSearchById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(miningSearches).where(eq(miningSearches.id, id)).limit(1);
  return result[0] ?? undefined;
}

export async function getMiningSearchesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(miningSearches)
    .where(eq(miningSearches.userId, userId))
    .orderBy(desc(miningSearches.createdAt));
}

export async function updateMiningSearchStatus(
  id: number,
  status: "pending" | "mining" | "analyzing" | "complete" | "failed",
  progress: number,
  progressMessage?: string
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(miningSearches)
    .set({ status, progress, progressMessage: progressMessage ?? null })
    .where(eq(miningSearches.id, id));
}

export async function deleteMiningSearch(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(miningSearches)
    .where(and(eq(miningSearches.id, id), eq(miningSearches.userId, userId)));
}

// ─── Analysis Results ────────────────────────────────────────────────────────

export async function upsertAnalysisResult(data: typeof analysisResults.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(analysisResults)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        painPoints: data.painPoints,
        desires: data.desires,
        objections: data.objections,
        fears: data.fears,
        buyingTriggers: data.buyingTriggers,
        emotionalLanguage: data.emotionalLanguage,
        trendingPhrases: data.trendingPhrases,
        verbatimQuotes: data.verbatimQuotes,
        topThemes: data.topThemes,
        sentimentBreakdown: data.sentimentBreakdown,
      },
    });
}

export async function getAnalysisResultBySearchId(searchId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(analysisResults)
    .where(eq(analysisResults.searchId, searchId))
    .limit(1);
  return result[0] ?? undefined;
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export async function createReport(data: InsertReport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(reports).values(data);
  return result[0];
}

export async function getReportById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  return result[0] ?? undefined;
}

export async function getReportBySearchId(searchId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(reports)
    .where(eq(reports.searchId, searchId))
    .orderBy(desc(reports.createdAt))
    .limit(1);
  return result[0] ?? undefined;
}

export async function getReportsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(reports)
    .where(eq(reports.userId, userId))
    .orderBy(desc(reports.createdAt));
}

export async function deleteReport(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(reports).where(and(eq(reports.id, id), eq(reports.userId, userId)));
}

export async function updateReport(id: number, data: Partial<InsertReport>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(reports).set(data).where(eq(reports.id, id));
}

// ─── Vault Items ──────────────────────────────────────────────────────────────────────────────

export async function createVaultItem(data: InsertVaultItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(vaultItems).values(data);
  return result[0];
}

export async function getVaultItemsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(vaultItems)
    .where(eq(vaultItems.userId, userId))
    .orderBy(desc(vaultItems.createdAt));
}

export async function deleteVaultItem(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(vaultItems).where(and(eq(vaultItems.id, id), eq(vaultItems.userId, userId)));
}

export async function checkVaultItemExists(userId: number, reportId: number, label: string) {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select({ id: vaultItems.id })
    .from(vaultItems)
    .where(and(eq(vaultItems.userId, userId), eq(vaultItems.reportId, reportId), eq(vaultItems.label, label)))
    .limit(1);
  return result.length > 0 ? result[0].id : null;
}

// ─── Trend Snapshots ─────────────────────────────────────────────────────────

export type TrendTopic = {
  name: string;
  description: string;
  score: number;
  momentum: "Rising" | "Stable" | "Emerging" | "Declining";
};

export async function saveTrendSnapshot(data: {
  keyword: string;
  snapshotDate: string;
  trendingTopics: TrendTopic[];
  trendingPhrases: string[];
  emergingQuestions: string[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Refreshing twice in one day replaces the day's snapshot instead of duplicating it.
  await db
    .delete(trendSnapshots)
    .where(and(eq(trendSnapshots.keyword, data.keyword), eq(trendSnapshots.snapshotDate, data.snapshotDate)));
  // createdAt is epoch SECONDS — the column is INT, so milliseconds overflow it.
  await db.insert(trendSnapshots).values({
    keyword: data.keyword,
    snapshotDate: data.snapshotDate,
    trendingTopics: data.trendingTopics,
    trendingPhrases: data.trendingPhrases,
    emergingQuestions: data.emergingQuestions,
    createdAt: Math.floor(Date.now() / 1000),
  });
}

export async function getTrendSnapshots(keyword: string, days: number = 7) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(trendSnapshots)
    .where(eq(trendSnapshots.keyword, keyword))
    .orderBy(desc(trendSnapshots.snapshotDate))
    .limit(days);
}

export async function getLatestTrendSnapshot(keyword: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(trendSnapshots)
    .where(eq(trendSnapshots.keyword, keyword))
    .orderBy(desc(trendSnapshots.snapshotDate))
    .limit(1);
  return result[0] ?? undefined;
}

export async function getDistinctTrendKeywords() {
  const db = await getDb();
  if (!db) return [];
  const result = await db
    .selectDistinct({ keyword: trendSnapshots.keyword })
    .from(trendSnapshots)
    .orderBy(trendSnapshots.keyword);
  return result.map((r) => r.keyword);
}

// ─── Shared Reports ───────────────────────────────────────────────────────────

export async function createSharedReport(data: {
  reportId: number;
  userId: number;
  token: string;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(sharedReports).values(data);
}

export async function getActiveShareForReport(reportId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(sharedReports)
    .where(
      and(
        eq(sharedReports.reportId, reportId),
        eq(sharedReports.userId, userId),
        gt(sharedReports.expiresAt, new Date())
      )
    )
    .orderBy(desc(sharedReports.createdAt))
    .limit(1);
  return result[0] ?? undefined;
}

export async function getSharedReportByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(sharedReports)
    .where(and(eq(sharedReports.token, token), gt(sharedReports.expiresAt, new Date())))
    .limit(1);
  return result[0] ?? undefined;
}

export async function revokeSharedReport(reportId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(sharedReports)
    .where(and(eq(sharedReports.reportId, reportId), eq(sharedReports.userId, userId)));
}

// ─── Vault Collections ────────────────────────────────────────────────────────

export async function createVaultCollection(userId: number, name: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(vaultCollections).values({ userId, name });
  return result.insertId;
}

export async function getVaultCollectionsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(vaultCollections)
    .where(eq(vaultCollections.userId, userId))
    .orderBy(desc(vaultCollections.createdAt));
}

export async function deleteVaultCollection(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  // Detach items first so they fall back to "no collection"
  await db
    .update(vaultItems)
    .set({ collectionId: null })
    .where(and(eq(vaultItems.collectionId, id), eq(vaultItems.userId, userId)));
  await db
    .delete(vaultCollections)
    .where(and(eq(vaultCollections.id, id), eq(vaultCollections.userId, userId)));
}

export async function updateVaultItem(
  id: number,
  userId: number,
  data: { tags?: string[]; collectionId?: number | null }
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(vaultItems)
    .set(data)
    .where(and(eq(vaultItems.id, id), eq(vaultItems.userId, userId)));
}

export async function deleteVaultItems(ids: number[], userId: number) {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  await db
    .delete(vaultItems)
    .where(and(inArray(vaultItems.id, ids), eq(vaultItems.userId, userId)));
}

// ─── Calendar Entries ─────────────────────────────────────────────────────────

export async function createCalendarEntry(data: {
  userId: number;
  vaultItemId: number;
  scheduledDate: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(calendarEntries).values(data);
  return result.insertId;
}

export async function getCalendarEntriesByUser(userId: number, fromDate: string, toDate: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(calendarEntries)
    .where(
      and(
        eq(calendarEntries.userId, userId),
        sql`${calendarEntries.scheduledDate} >= ${fromDate}`,
        sql`${calendarEntries.scheduledDate} <= ${toDate}`
      )
    )
    .orderBy(calendarEntries.scheduledDate);
}

export async function updateCalendarEntry(id: number, userId: number, scheduledDate: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(calendarEntries)
    .set({ scheduledDate })
    .where(and(eq(calendarEntries.id, id), eq(calendarEntries.userId, userId)));
}

export async function deleteCalendarEntry(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(calendarEntries)
    .where(and(eq(calendarEntries.id, id), eq(calendarEntries.userId, userId)));
}

// ─── Scrape Cache (24h) ───────────────────────────────────────────────────────

const SCRAPE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getCachedScrape(keyword: string): Promise<string | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const cutoff = new Date(Date.now() - SCRAPE_CACHE_TTL_MS);
  const result = await db
    .select()
    .from(scrapeCache)
    .where(and(eq(scrapeCache.keyword, keyword.toLowerCase()), gt(scrapeCache.createdAt, cutoff)))
    .orderBy(desc(scrapeCache.createdAt))
    .limit(1);
  return result[0]?.result;
}

export async function saveCachedScrape(keyword: string, result: string) {
  const db = await getDb();
  if (!db) return;
  // Drop stale entries for this keyword, then insert the fresh one
  await db.delete(scrapeCache).where(eq(scrapeCache.keyword, keyword.toLowerCase()));
  await db.insert(scrapeCache).values({ keyword: keyword.toLowerCase(), result });
}

// ─── Activity Log ─────────────────────────────────────────────────────────────

export async function logActivity(
  userId: number,
  action:
    | "search_created"
    | "report_generated"
    | "vault_saved"
    | "report_shared"
    | "trend_refreshed"
    | "client_created"
    | "foundation_approved",
  detail: string
) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(activityLog).values({ userId, action, detail });
  } catch (err) {
    // Activity logging must never break the main flow
    console.warn("[Activity] Failed to log:", err);
  }
}

export async function getRecentActivity(userId: number, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(activityLog)
    .where(eq(activityLog.userId, userId))
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getVaultItemCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(vaultItems)
    .where(eq(vaultItems.userId, userId));
  return Number(result[0]?.count ?? 0);
}

export async function getTrendSnapshotCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  // Snapshots are keyword-scoped; count the ones for this user's keywords
  const searches = await getMiningSearchesByUser(userId);
  const keywords = Array.from(new Set(searches.map((s) => s.keyword)));
  if (keywords.length === 0) return 0;
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(trendSnapshots)
    .where(inArray(trendSnapshots.keyword, keywords));
  return Number(result[0]?.count ?? 0);
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

/**
 * Count how many reports a user has generated in the current calendar week
 * (Monday 00:00 UTC to Sunday 23:59 UTC).
 */
export async function getReportsThisWeek(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Get the start of the current week (Monday 00:00 UTC)
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - daysFromMonday);
  weekStart.setUTCHours(0, 0, 0, 0);

  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(reports)
    .where(and(eq(reports.userId, userId), sql`${reports.createdAt} >= ${weekStart}`));

  return Number(result[0]?.count ?? 0);
}

// ─── Clients (Client OS) ─────────────────────────────────────────────────────

export async function createClient(data: InsertClient): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clients).values(data);
  return result[0].insertId;
}

export async function getClientsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clients).where(eq(clients.userId, userId)).orderBy(desc(clients.updatedAt));
}

export async function getClientById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return rows[0];
}

export async function updateClient(id: number, data: Partial<InsertClient>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clients).set(data).where(eq(clients.id, id));
}

export async function deleteClient(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(clientDocuments).where(eq(clientDocuments.clientId, id));
  await db.delete(jobs).where(eq(jobs.clientId, id));
  await db.delete(clients).where(eq(clients.id, id));
}

// ─── Client documents ────────────────────────────────────────────────────────

export async function createClientDocument(data: InsertClientDocument): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clientDocuments).values(data);
  return result[0].insertId;
}

export async function getClientDocuments(clientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(clientDocuments)
    .where(eq(clientDocuments.clientId, clientId))
    .orderBy(clientDocuments.kind, clientDocuments.createdAt);
}

export async function getClientDocumentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(clientDocuments).where(eq(clientDocuments.id, id)).limit(1);
  return rows[0];
}

export async function updateClientDocument(id: number, content: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clientDocuments).set({ content }).where(eq(clientDocuments.id, id));
}

export async function deleteClientDocument(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(clientDocuments).where(eq(clientDocuments.id, id));
}

/** Replace a generated foundation doc (regenerations overwrite by docType). */
/** Replace-on-regenerate upsert keyed by (clientId, kind, docType). */
export async function upsertClientDocumentByType(
  clientId: number,
  kind: "foundation" | "deliverable",
  docType: string,
  title: string,
  content: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select({ id: clientDocuments.id })
    .from(clientDocuments)
    .where(and(eq(clientDocuments.clientId, clientId), eq(clientDocuments.kind, kind), eq(clientDocuments.docType, docType)))
    .limit(1);
  if (existing[0]) {
    await db.update(clientDocuments).set({ content, title }).where(eq(clientDocuments.id, existing[0].id));
  } else {
    await db.insert(clientDocuments).values({ clientId, kind, docType, title, content });
  }
}

// ─── Jobs (worker queue) ─────────────────────────────────────────────────────

export async function createJob(data: InsertJob): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(jobs).values(data);
  return result[0].insertId;
}

export async function getJobById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return rows[0];
}

export async function getLatestJobForClient(clientId: number, type: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.clientId, clientId), eq(jobs.type, type)))
    .orderBy(desc(jobs.id))
    .limit(1);
  return rows[0];
}

/**
 * Atomically claim the oldest queued job: UPDATE ... LIMIT 1 marks it running,
 * then read it back. Safe for a single worker; good enough if a second worker
 * ever runs because the UPDATE is the lock.
 */
export async function claimNextQueuedJob() {
  const db = await getDb();
  if (!db) return undefined;
  await db.execute(
    sql`UPDATE jobs SET status = 'running', startedAt = NOW() WHERE status = 'queued' ORDER BY id ASC LIMIT 1`
  );
  const rows = await db
    .select()
    .from(jobs)
    .where(eq(jobs.status, "running"))
    .orderBy(desc(jobs.startedAt))
    .limit(1);
  return rows[0];
}

export async function setJobStatus(id: number, status: "queued" | "running" | "review" | "approved" | "failed", error?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const patch: Record<string, unknown> = { status };
  if (error !== undefined) patch.error = error;
  if (status === "review" || status === "approved" || status === "failed") patch.finishedAt = new Date();
  await db.update(jobs).set(patch).where(eq(jobs.id, id));
}

export async function getSearchesByClient(clientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(miningSearches).where(eq(miningSearches.clientId, clientId)).orderBy(desc(miningSearches.createdAt));
}
