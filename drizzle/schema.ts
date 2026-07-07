import {
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

// Mining searches — each represents a keyword + platform scope
export const miningSearches = mysqlTable("mining_searches", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  keyword: text("keyword").notNull(),
  niche: text("niche"),
  platforms: json("platforms").$type<string[]>().notNull(),
  status: mysqlEnum("status", ["pending", "mining", "analyzing", "complete", "failed"])
    .default("pending")
    .notNull(),
  progress: int("progress").default(0).notNull(),
  progressMessage: text("progressMessage"),
  brandVoice: text("brandVoice"),
  // Competitor URLs (Instagram/Facebook/Skool/website) pasted by the user.
  // No .default() — TiDB rejects literal DEFAULT on JSON columns.
  competitorUrls: json("competitorUrls").$type<string[]>(),
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
  ]).notNull(),
  detail: text("detail").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ActivityEntry = typeof activityLog.$inferSelect;
