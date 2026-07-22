import {
  float,
  int,
  json,
  longtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import type {
  CompetitorIntel,
  DeepMarketIntelligence,
  EmailSequence,
  InsightList,
  SentimentBreakdown,
  SkoolPostWithDMWorkflow,
  TalkingHeadScript,
  Theme,
  VerbatimQuote,
  ViralHook,
  AdCopyIdea,
  YouTubeIdea,
} from "../shared/reportContent";

// Re-export content types so existing `import type { X } from "drizzle/schema"` keeps working.
export type {
  AdCopyIdea,
  AudiencePsychology,
  CompetitorEntry,
  CompetitorIntel,
  DeepMarketIntelligence,
  DMMessage,
  EmailMessage,
  EmailSequence,
  HookCategory,
  HookType,
  InsightItem,
  InsightList,
  KeywordIntelligence,
  ScriptBRollSuggestion,
  SentimentBreakdown,
  SkoolPostFormat,
  SkoolPostWithDMWorkflow,
  TalkingHeadScript,
  Theme,
  TrendingTopic,
  VerbatimQuote,
  ViralHook,
  YouTubeIdea,
} from "../shared/reportContent";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Clients — DFY agency client workspaces (Client OS)
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  niche: varchar("niche", { length: 300 }).notNull(),
  funnelType: mysqlEnum("funnelType", ["webinar", "call"]).notNull(),
  pricePoint: varchar("pricePoint", { length: 200 }),
  /** The client's OWN socials, for the live stats card on the Overview. */
  instagramHandle: varchar("instagramHandle", { length: 200 }),
  youtubeHandle: varchar("youtubeHandle", { length: 200 }),
  /** An existing report linked at onboarding instead of running fresh research. */
  linkedReportId: int("linkedReportId"),
  /** Public token for the client's recording queue page (/record/:token). */
  recordingToken: varchar("recordingToken", { length: 64 }),
  /** Public token for the client share page (/c/:token): desk + reports. */
  shareToken: varchar("shareToken", { length: 64 }),
  /** Autopilot: stage approval queues the next stage; the last ad verdict
   *  with rejects queues the rebuild. 0/1. */
  autoRun: int("autoRun").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

// Client documents — onboarding material (extracted text), generated foundation
// docs, and client-level lessons from the learning loop. Text only, no binaries.
export const clientDocuments = mysqlTable("client_documents", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  kind: mysqlEnum("kind", ["onboarding", "foundation", "deliverable", "lesson"]).notNull(),
  docType: varchar("docType", { length: 50 }).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  content: longtext("content").notNull(),
  source: varchar("source", { length: 300 }),
  /** Kanban state for deliverables: draft -> approved -> posted; archived = soft delete. */
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ClientDocument = typeof clientDocuments.$inferSelect;
export type InsertClientDocument = typeof clientDocuments.$inferInsert;

// Client assets — rendered binaries (static ad PNGs) posted by the worker
// alongside a stage's docs. data is base64; served via /api/assets/:id.
// Reviewed per-asset: approve / reject with feedback feeds regeneration.
export const clientAssets = mysqlTable("client_assets", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  jobId: int("jobId").notNull(),
  docType: varchar("docType", { length: 50 }).notNull(),
  filename: varchar("filename", { length: 300 }).notNull(),
  mime: varchar("mime", { length: 100 }).notNull().default("image/png"),
  data: longtext("data").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).notNull().default("pending"),
  feedback: longtext("feedback"),
  // ── Ad DNA, parsed from the batch doc's per-ad spec at completion ──
  format: varchar("format", { length: 100 }),
  reference: varchar("reference", { length: 300 }),
  subAvatar: varchar("subAvatar", { length: 200 }),
  angle: varchar("angle", { length: 400 }),
  awareness: varchar("awareness", { length: 50 }),
  hookCategory: varchar("hookCategory", { length: 100 }),
  // ── Meta upload copy, parsed from the batch spec: the ad ships WITH its words ──
  copyPrimary: varchar("copyPrimary", { length: 1000 }),
  copyHeadline: varchar("copyHeadline", { length: 200 }),
  copyDescription: varchar("copyDescription", { length: 200 }),
  // ── Independent QA pass (graded before the operator ever sees the batch) ──
  qaScore: int("qaScore"),
  qaNote: varchar("qaNote", { length: 500 }),
  // ── Real Meta results, pasted from Ads Manager: the market's verdict ──
  metaSpend: float("metaSpend"),
  metaCtr: float("metaCtr"),
  metaCpl: float("metaCpl"),
  metaImportedAt: timestamp("metaImportedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Operator-uploaded INPUT images (client cutouts, proof screenshots, testimonials)
 *  that the ad engine can composite and annotate into rendered statics. */
export const clientRefImages = mysqlTable("client_ref_images", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  filename: varchar("filename", { length: 300 }).notNull(),
  mime: varchar("mime", { length: 100 }).notNull().default("image/png"),
  data: longtext("data").notNull(),
  /** How to use it: "Trent cutout, no bg", "SoFi $151k approval, circle the number". */
  note: varchar("note", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Client portal logins (app.cashflowcoaches.io/portal): email + password
 *  credentials the operator creates at onboarding, scoped to ONE client
 *  workspace. Deliberately separate from the owner Google allowlist — a
 *  portal session can only ever read its own client's approved work. */
export const clientPortalLogins = mysqlTable("client_portal_logins", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  /** scrypt, stored as "s2$<saltB64>$<hashB64>" — no plaintext ever kept. */
  passwordHash: varchar("passwordHash", { length: 300 }).notNull(),
  lastLoginAt: timestamp("lastLoginAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ClientPortalLogin = typeof clientPortalLogins.$inferSelect;

/** The recording queue: script documents the operator sent to the client to
 *  record. The client sees them on the public /record/:token page and marks
 *  each one recorded — replaces the Notion to-do handoff. */
export const clientRecordingItems = mysqlTable("client_recording_items", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  docId: int("docId").notNull(),
  recordedAt: timestamp("recordedAt"),
  /** Section titles the client has ticked off inside a multi-part doc. */
  checkedSections: json("checkedSections").$type<string[]>(),
  /** Per-section recording URLs (Loom/Wistia/YouTube): section title -> url. */
  sectionLinks: json("sectionLinks").$type<Record<string, string>>(),
  /** The recording URL for a single-video item. */
  recordingUrl: varchar("recordingUrl", { length: 1000 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ClientRecordingItem = typeof clientRecordingItems.$inferSelect;

/**
 * The compounding creative-research library. Every winning ad seen via
 * Foreplay is stored once (deduped on sourceId) and re-sightings bump
 * timesSeen/runningDays — an ad that keeps appearing across weeks is a
 * proven spender. Generations retrieve top-ranked rows they have NOT been
 * served recently, so references compound instead of repeating.
 */
export const creativeIntel = mysqlTable("creative_intel", {
  id: int("id").autoincrement().primaryKey(),
  source: varchar("source", { length: 20 }).notNull().default("foreplay"),
  sourceId: varchar("sourceId", { length: 100 }).notNull(),
  niche: varchar("niche", { length: 300 }).notNull(),
  advertiser: varchar("advertiser", { length: 200 }),
  displayFormat: varchar("displayFormat", { length: 30 }),
  headline: varchar("headline", { length: 500 }),
  copy: text("copy"),
  transcript: longtext("transcript"),
  ctaType: varchar("ctaType", { length: 60 }),
  imageUrl: varchar("imageUrl", { length: 1000 }),
  productCategory: varchar("productCategory", { length: 200 }),
  live: int("live").default(0).notNull(),
  runningDays: int("runningDays").default(0).notNull(),
  timesSeen: int("timesSeen").default(1).notNull(),
  firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  /** Stamped once the worker has archived the creative to the Drive swipe
   *  folder — the asset then survives Foreplay's feed (and Foreplay itself). */
  archivedAt: timestamp("archivedAt"),
});

/** Which library ads were served to which client, for no-repeat retrieval. */
export const creativeIntelServes = mysqlTable("creative_intel_serves", {
  id: int("id").autoincrement().primaryKey(),
  intelId: int("intelId").notNull(),
  clientId: int("clientId").notNull(),
  servedAt: timestamp("servedAt").defaultNow().notNull(),
});

/** Weekly-ish social stat snapshots so growth is a trendline, not a memory.
 *  Written when stats are fetched (Overview load, weekly report). */
export const socialStatsSnapshots = mysqlTable("social_stats_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  platform: varchar("platform", { length: 20 }).notNull(),
  handle: varchar("handle", { length: 200 }).notNull(),
  followers: int("followers"),
  posts: int("posts"),
  extra: int("extra"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ClientAsset = typeof clientAssets.$inferSelect;
export type InsertClientAsset = typeof clientAssets.$inferInsert;

export type ClientRefImage = typeof clientRefImages.$inferSelect;
export type InsertClientRefImage = typeof clientRefImages.$inferInsert;

// Jobs — the queue the local Mac worker polls. Status flow:
// queued -> running -> review -> approved (or failed; reject requeues a new job).
export const jobs = mysqlTable("jobs", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  userId: int("userId").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  status: mysqlEnum("status", ["queued", "running", "review", "approved", "failed"])
    .default("queued")
    .notNull(),
  // No .default() — TiDB rejects literal DEFAULT on JSON columns.
  // doc_create/doc_edit jobs carry the single-doc AI fields alongside feedback.
  payload: json("payload").$type<{
    feedback?: string;
    docType?: string;
    title?: string;
    instructions?: string;
    docId?: number;
  }>(),
  error: text("error"),
  /** Live status line while running ("building ad 8 of 15"), cleared on finish. */
  progress: varchar("progress", { length: 500 }),
  /** Set atomically at claim so exactly one worker owns the row. */
  claimToken: varchar("claimToken", { length: 32 }),
  /** Stamped by worker progress pings; the reaper requeues silent jobs. */
  heartbeatAt: timestamp("heartbeatAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  startedAt: timestamp("startedAt"),
  finishedAt: timestamp("finishedAt"),
});

export type Job = typeof jobs.$inferSelect;
export type InsertJob = typeof jobs.$inferInsert;

// Mining searches — each represents a keyword + platform scope
export const miningSearches = mysqlTable("mining_searches", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // Set when the research was run from inside a client workspace
  clientId: int("clientId"),
  keyword: text("keyword").notNull(),
  niche: text("niche"),
  platforms: json("platforms").$type<string[]>().notNull(),
  status: mysqlEnum("status", ["pending", "mining", "analyzing", "complete", "failed"])
    .default("pending")
    .notNull(),
  progress: int("progress").default(0).notNull(),
  progressMessage: text("progressMessage"),
  brandVoice: text("brandVoice"),
  // Competitor URLs extracted from whatever the user pasted (Instagram/
  // Facebook/Skool/website). No .default() — TiDB rejects literal DEFAULT
  // on JSON columns.
  competitorUrls: json("competitorUrls").$type<string[]>(),
  // The raw competitor paste (notes, handles, descriptions) — fed to the
  // competitor intel generator as context alongside the scraped pages.
  competitorNotes: text("competitorNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MiningSearch = typeof miningSearches.$inferSelect;
export type InsertMiningSearch = typeof miningSearches.$inferInsert;

// Analysis results — AI-extracted insights per search
// Insight columns hold InsightItem[] for new analyses; rows created before the
// structured-insight upgrade hold plain string[]. Use normalizeInsights() to read.
export const analysisResults = mysqlTable("analysis_results", {
  id: int("id").autoincrement().primaryKey(),
  searchId: int("searchId").notNull().unique(),
  painPoints: json("painPoints").$type<InsightList>().notNull(),
  desires: json("desires").$type<InsightList>().notNull(),
  objections: json("objections").$type<InsightList>().notNull(),
  fears: json("fears").$type<InsightList>().notNull(),
  buyingTriggers: json("buyingTriggers").$type<string[]>().notNull(),
  emotionalLanguage: json("emotionalLanguage").$type<string[]>().notNull(),
  trendingPhrases: json("trendingPhrases").$type<string[]>().notNull(),
  verbatimQuotes: json("verbatimQuotes").$type<VerbatimQuote[]>().notNull(),
  topThemes: json("topThemes").$type<Theme[]>().notNull(),
  sentimentBreakdown: json("sentimentBreakdown").$type<SentimentBreakdown>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AnalysisResult = typeof analysisResults.$inferSelect;

// Market intelligence reports
// viralHooks holds ViralHook[] for new reports; legacy reports hold string[].
export const reports = mysqlTable("reports", {
  id: int("id").autoincrement().primaryKey(),
  searchId: int("searchId").notNull(),
  userId: int("userId").notNull(),
  name: text("name").notNull(),
  marketIntelligence: json("marketIntelligence").$type<DeepMarketIntelligence>().notNull(),
  viralHooks: json("viralHooks").$type<ViralHook[] | string[]>().notNull(),
  adCopyIdeas: json("adCopyIdeas").$type<AdCopyIdea[]>().notNull(),
  skoolPosts: json("skoolPosts").$type<SkoolPostWithDMWorkflow[]>().notNull(),
  youtubeIdeas: json("youtubeIdeas").$type<YouTubeIdea[]>(),
  talkingHeadScripts: json("talkingHeadScripts").$type<TalkingHeadScript[]>(),
  emailSequence: json("emailSequence").$type<EmailSequence>(),
  competitorIntel: json("competitorIntel").$type<CompetitorIntel>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;

// Daily trend snapshots from internet scraping
export const trendSnapshots = mysqlTable("trend_snapshots", {
  id: int("id").primaryKey().autoincrement(),
  keyword: varchar("keyword", { length: 500 }).notNull(),
  snapshotDate: varchar("snapshot_date", { length: 20 }).notNull(), // YYYY-MM-DD
  trendingTopics: json("trending_topics").$type<Array<{
    name: string;
    description: string;
    score: number;
    momentum: "Rising" | "Stable" | "Emerging" | "Declining";
  }>>().notNull(),
  trendingPhrases: json("trending_phrases").$type<string[]>().notNull(),
  emergingQuestions: json("emerging_questions").$type<string[]>().notNull(),
  createdAt: int("created_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// Vault items — saved individual content pieces
export const vaultItems = mysqlTable("vault_items", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  reportId: int("reportId").notNull(),
  searchKeyword: text("searchKeyword").notNull(),
  contentType: mysqlEnum("contentType", ["hook", "email", "skool_post", "ad_copy", "script", "youtube_idea"]).notNull(),
  label: text("label").notNull(),
  content: text("content").notNull(),
  metadata: json("metadata").$type<Record<string, string>>(),
  tags: json("tags").$type<string[]>(),
  collectionId: int("collectionId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VaultItem = typeof vaultItems.$inferSelect;
export type InsertVaultItem = typeof vaultItems.$inferInsert;

// Named collections for grouping vault items (e.g. "Q4 Campaign", "Launch Week")
export const vaultCollections = mysqlTable("vault_collections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VaultCollection = typeof vaultCollections.$inferSelect;

// Public share links for reports — expire after 30 days
export const sharedReports = mysqlTable("shared_reports", {
  id: int("id").autoincrement().primaryKey(),
  reportId: int("reportId").notNull(),
  userId: int("userId").notNull(),
  token: varchar("token", { length: 32 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SharedReport = typeof sharedReports.$inferSelect;

// Content calendar — vault items scheduled onto specific days
export const calendarEntries = mysqlTable("calendar_entries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  vaultItemId: int("vaultItemId").notNull(),
  scheduledDate: varchar("scheduledDate", { length: 20 }).notNull(), // YYYY-MM-DD
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CalendarEntry = typeof calendarEntries.$inferSelect;

// Raw scrape cache — repeat searches within 24h reuse cached results
export const scrapeCache = mysqlTable("scrape_cache", {
  id: int("id").autoincrement().primaryKey(),
  keyword: varchar("keyword", { length: 500 }).notNull(),
  result: longtext("result").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Recent activity feed for the dashboard
export const activityLog = mysqlTable("activity_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  action: mysqlEnum("action", [
    "search_created",
    "report_generated",
    "vault_saved",
    "report_shared",
    "trend_refreshed",
    "client_created",
    "foundation_approved",
  ]).notNull(),
  detail: text("detail").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ActivityEntry = typeof activityLog.$inferSelect;
