import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock DB helpers
vi.mock("./db", () => ({
  getMiningSearchesByUser: vi.fn().mockResolvedValue([]),
  getMiningSearchById: vi.fn().mockResolvedValue(null),
  createMiningSearch: vi.fn().mockResolvedValue({ insertId: 1 }),
  updateMiningSearchStatus: vi.fn().mockResolvedValue(undefined),
  deleteMiningSearch: vi.fn().mockResolvedValue(undefined),
  getAnalysisResultBySearchId: vi.fn().mockResolvedValue(null),
  upsertAnalysisResult: vi.fn().mockResolvedValue(undefined),
  getReportsByUser: vi.fn().mockResolvedValue([]),
  getReportById: vi.fn().mockResolvedValue(null),
  getReportBySearchId: vi.fn().mockResolvedValue(null),
  createReport: vi.fn().mockResolvedValue({ insertId: 1 }),
  deleteReport: vi.fn().mockResolvedValue(undefined),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
}));

// Mock AI analysis
vi.mock("./aiAnalysis", () => ({
  runAnalysis: vi.fn().mockResolvedValue({
    painPoints: ["Pain 1", "Pain 2"],
    desires: ["Desire 1"],
    objections: ["Objection 1"],
    fears: ["Fear 1"],
    buyingTriggers: ["Trigger 1"],
    emotionalLanguage: ["Emotional 1"],
    trendingPhrases: ["Phrase 1"],
    verbatimQuotes: [],
    topThemes: [],
    sentimentBreakdown: { positive: 30, negative: 50, neutral: 20 },
  }),
  generateDeepMarketIntelligence: vi.fn().mockResolvedValue({
    executiveSummary: "Test summary",
    trendingTopics: [],
    competitorPatterns: [],
    emergingOpportunities: [],
    marketShifts: [],
    topDesires: [],
    topFears: [],
    dominantBeliefs: [],
    emotionalTriggers: [],
    languagePatterns: [],
    verbatimPhrases: [],
    keywordIntelligence: {
      longTailKeywords: [],
      emotionalKeywords: [],
      highConvertingPhrases: [],
      relatedSearches: [],
      trendingTerms: [],
    },
  }),
  generateViralHooks: vi.fn().mockResolvedValue(["Hook 1", "Hook 2"]),
  generateAdCopy: vi.fn().mockResolvedValue([]),
  generateSkoolPosts: vi.fn().mockResolvedValue([]),
  generateTalkingHeadScripts: vi.fn().mockResolvedValue([]),
  generateEmailSequence: vi.fn().mockResolvedValue({ sequenceName: "Test Sequence", emails: [] }),
}));

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "google",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("mining router", () => {
  it("list returns empty array when no searches", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.mining.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("get throws NOT_FOUND for non-existent search", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.mining.get({ id: 999 })).rejects.toThrow();
  });

  it("delete throws NOT_FOUND for non-existent search", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.mining.delete({ id: 999 })).rejects.toThrow();
  });
});

describe("analysis router", () => {
  it("getResult returns null when no analysis exists", async () => {
    const { getMiningSearchById } = await import("./db");
    vi.mocked(getMiningSearchById).mockResolvedValueOnce({
      id: 1,
      userId: 1,
      keyword: "test",
      niche: null,
      platforms: ["reddit"],
      status: "complete",
      progress: 100,
      progressMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.analysis.getResult({ searchId: 1 });
    expect(result).toBeNull();
  });
});

describe("reports router", () => {
  it("list returns empty array when no reports", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.reports.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("get throws NOT_FOUND for non-existent report", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.reports.get({ id: 999 })).rejects.toThrow();
  });
});

describe("auth router", () => {
  it("me returns user when authenticated", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result?.id).toBe(1);
    expect(result?.name).toBe("Test User");
  });

  it("logout clears session cookie", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
  });
});

