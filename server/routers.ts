import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  createCalendarEntry,
  createMiningSearch,
  createReport,
  createSharedReport,
  createVaultCollection,
  createVaultItem,
  deleteCalendarEntry,
  deleteReport,
  deleteMiningSearch,
  deleteVaultCollection,
  deleteVaultItem,
  deleteVaultItems,
  checkVaultItemExists,
  getActiveShareForReport,
  getAnalysisResultBySearchId,
  getCalendarEntriesByUser,
  getMiningSearchById,
  getMiningSearchesByUser,
  getRecentActivity,
  getReportById,
  getReportBySearchId,
  getReportsByUser,
  getSharedReportByToken,
  getTrendSnapshotCount,
  getVaultCollectionsByUser,
  getVaultItemCount,
  getVaultItemsByUser,
  logActivity,
  revokeSharedReport,
  updateCalendarEntry,
  updateMiningSearchStatus,
  updateReport,
  updateVaultItem,
  upsertAnalysisResult,
  getTrendSnapshots,
  getLatestTrendSnapshot,
  getDistinctTrendKeywords,
  saveTrendSnapshot,
  getReportsThisWeek,
} from "./db";
import {
  generateAdCopy,
  generateCompetitorIntel,
  generateDeepMarketIntelligence,
  generateEmailSequence,
  generatePositioningStatement,
  generateSkoolPosts,
  generateTalkingHeadScripts,
  generateViralHooks,
  generateYouTubeIdeas,
  runAnalysis,
  type AnalysisInput,
} from "./aiAnalysis";
import { fetchRelatedSearches } from "./realScraper";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

/** How many bulk searches may run their pipelines at once. */
const BULK_CONCURRENCY = 3;

/** Report sections that can be regenerated individually. */
const REPORT_SECTIONS = [
  "marketIntelligence",
  "viralHooks",
  "adCopyIdeas",
  "skoolPosts",
  "talkingHeadScripts",
  "emailSequence",
  "youtubeIdeas",
  "competitorIntel",
] as const;

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Mining Searches ───────────────────────────────────────────────────────

  mining: router({
    create: protectedProcedure
      .input(
        z.object({
          keyword: z.string().min(1).max(100000),
          niche: z.string().max(100000).optional(),
          platforms: z.array(z.string()).min(1),
          brandVoice: z.string().max(100000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const insertId = await createMiningSearch({
          userId: ctx.user.id,
          keyword: input.keyword,
          niche: input.niche ?? null,
          platforms: input.platforms,
          status: "pending",
          progress: 0,
          brandVoice: input.brandVoice ?? null,
        });

        const search = await getMiningSearchById(insertId);
        if (!search) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await logActivity(ctx.user.id, "search_created", input.keyword);
        return search;
      }),

    /**
     * Bulk mode: create up to 10 keyword searches at once and start their
     * pipelines immediately, running at most BULK_CONCURRENCY in parallel.
     */
    createBulk: protectedProcedure
      .input(
        z.object({
          keywords: z.array(z.string().min(1).max(500)).min(1).max(10),
          niche: z.string().max(100000).optional(),
          platforms: z.array(z.string()).min(1),
          brandVoice: z.string().max(100000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const keywords = Array.from(new Set(input.keywords.map((k) => k.trim()).filter(Boolean)));
        if (keywords.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No valid keywords provided" });
        }

        const searchIds: number[] = [];
        for (const keyword of keywords) {
          const insertId = await createMiningSearch({
            userId: ctx.user.id,
            keyword,
            niche: input.niche ?? null,
            platforms: input.platforms,
            status: "pending",
            progress: 0,
            brandVoice: input.brandVoice ?? null,
          });
          searchIds.push(insertId);
          await logActivity(ctx.user.id, "search_created", keyword);
        }

        // Fire the pipelines with a small concurrency cap (fire and forget)
        runBulkPipelines(searchIds, keywords, input.platforms, input.brandVoice, ctx.user.id).catch(
          (err) => console.error("[Bulk] Pipeline error:", err)
        );

        return { searchIds };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return getMiningSearchesByUser(ctx.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const search = await getMiningSearchById(input.id);
        if (!search || search.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return search;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const search = await getMiningSearchById(input.id);
        if (!search || search.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await deleteMiningSearch(input.id, ctx.user.id);
        return { success: true };
      }),

    getStatus: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const search = await getMiningSearchById(input.id);
        if (!search || search.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return {
          status: search.status,
          progress: search.progress,
          progressMessage: search.progressMessage,
        };
      }),

    /** Status of many searches at once — powers the bulk progress dashboard. */
    getStatuses: protectedProcedure
      .input(z.object({ ids: z.array(z.number()).min(1).max(20) }))
      .query(async ({ ctx, input }) => {
        const searches = await Promise.all(input.ids.map((id) => getMiningSearchById(id)));
        return searches
          .filter((s): s is NonNullable<typeof s> => !!s && s.userId === ctx.user.id)
          .map((s) => ({
            id: s.id,
            keyword: s.keyword,
            status: s.status,
            progress: s.progress,
            progressMessage: s.progressMessage,
          }));
      }),

    /** Live keyword suggestions from SerpAPI related searches. */
    keywordSuggestions: protectedProcedure
      .input(z.object({ keyword: z.string().min(2).max(500) }))
      .query(async ({ input }) => {
        return fetchRelatedSearches(input.keyword);
      }),
  }),

  // ─── Analysis ─────────────────────────────────────────────────────────────

  analysis: router({
    run: protectedProcedure
      .input(z.object({ searchId: z.number(), brandVoice: z.string().max(100000).optional() }))
      .mutation(async ({ ctx, input }) => {
        const search = await getMiningSearchById(input.searchId);
        if (!search || search.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        if (search.status === "mining" || search.status === "analyzing") {
          throw new TRPCError({ code: "CONFLICT", message: "Analysis already in progress" });
        }

        // Use brand voice from input (if passed) or fall back to what was saved on the search
        const brandVoice = input.brandVoice ?? (search.brandVoice ?? undefined);

        // Start async processing (fire and forget)
        processAnalysis(input.searchId, search.keyword, search.platforms as string[], brandVoice, ctx.user.id).catch(
          (err) => console.error("[Analysis] Failed:", err)
        );

        return { started: true };
      }),

    getResult: protectedProcedure
      .input(z.object({ searchId: z.number() }))
      .query(async ({ ctx, input }) => {
        const search = await getMiningSearchById(input.searchId);
        if (!search || search.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const result = await getAnalysisResultBySearchId(input.searchId);
        return result ?? null;
      }),
  }),

  // ─── Reports ──────────────────────────────────────────────────────────────

  reports: router({
    weeklyUsage: protectedProcedure.query(async ({ ctx }) => {
      const used = await getReportsThisWeek(ctx.user.id);
      return { used, limit: null, remaining: null };
    }),

    generate: protectedProcedure
      .input(z.object({ searchId: z.number(), name: z.string().min(1).max(100000) }))
      .mutation(async ({ ctx, input }) => {
        const search = await getMiningSearchById(input.searchId);
        if (!search || search.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        if (search.status !== "complete") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Analysis must be complete before generating a report",
          });
        }

        const analysisResult = await getAnalysisResultBySearchId(input.searchId);
        if (!analysisResult) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Analysis results not found" });
        }

        const brandVoice = search.brandVoice ?? undefined;
        const sections = await generateAllSections(search.keyword, analysisResult, brandVoice);

        await createReport({
          searchId: input.searchId,
          userId: ctx.user.id,
          name: input.name,
          ...sections,
        });

        await logActivity(ctx.user.id, "report_generated", input.name);
        const report = await getReportBySearchId(input.searchId);
        return report!;
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const report = await getReportById(input.id);
        if (!report || report.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return report;
      }),

    getBySearch: protectedProcedure
      .input(z.object({ searchId: z.number() }))
      .query(async ({ ctx, input }) => {
        const search = await getMiningSearchById(input.searchId);
        if (!search || search.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const report = await getReportBySearchId(input.searchId);
        return report ?? null;
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return getReportsByUser(ctx.user.id);
    }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const report = await getReportById(input.id);
        if (!report || report.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await deleteReport(input.id, ctx.user.id);
        return { success: true };
      }),

    regenerate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const report = await getReportById(input.id);
        if (!report || report.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const analysisResult = await getAnalysisResultBySearchId(report.searchId);
        if (!analysisResult) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Analysis results not found — please re-run the search first" });
        }
        const search = await getMiningSearchById(report.searchId);
        if (!search) throw new TRPCError({ code: "NOT_FOUND" });

        const brandVoice = search.brandVoice ?? undefined;
        const sections = await generateAllSections(search.keyword, analysisResult, brandVoice);

        await updateReport(input.id, sections);
        return getReportById(input.id);
      }),

    /** Re-run a single report section without touching the rest. */
    regenerateSection: protectedProcedure
      .input(z.object({ id: z.number(), section: z.enum(REPORT_SECTIONS) }))
      .mutation(async ({ ctx, input }) => {
        const report = await getReportById(input.id);
        if (!report || report.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const search = await getMiningSearchById(report.searchId);
        if (!search) throw new TRPCError({ code: "NOT_FOUND" });
        const analysisResult = await getAnalysisResultBySearchId(report.searchId);
        if (!analysisResult && input.section !== "competitorIntel") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Analysis results not found — please re-run the search first" });
        }

        const brandVoice = search.brandVoice ?? undefined;
        const analysis = analysisResult as unknown as AnalysisInput;

        switch (input.section) {
          case "marketIntelligence":
            await updateReport(input.id, { marketIntelligence: await generateDeepMarketIntelligence(search.keyword, analysis, brandVoice) });
            break;
          case "viralHooks":
            await updateReport(input.id, { viralHooks: await generateViralHooks(search.keyword, analysis, brandVoice) });
            break;
          case "adCopyIdeas":
            await updateReport(input.id, { adCopyIdeas: await generateAdCopy(search.keyword, analysis, brandVoice) });
            break;
          case "skoolPosts":
            await updateReport(input.id, { skoolPosts: await generateSkoolPosts(search.keyword, analysis, brandVoice) });
            break;
          case "talkingHeadScripts":
            await updateReport(input.id, { talkingHeadScripts: await generateTalkingHeadScripts(search.keyword, analysis, brandVoice) });
            break;
          case "emailSequence":
            await updateReport(input.id, { emailSequence: await generateEmailSequence(search.keyword, analysis, brandVoice) });
            break;
          case "youtubeIdeas":
            await updateReport(input.id, { youtubeIdeas: await generateYouTubeIdeas(search.keyword, analysis, brandVoice) });
            break;
          case "competitorIntel": {
            const intel = await generateCompetitorIntel(search.keyword, brandVoice);
            if (!intel) {
              throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Could not find competitor data for this keyword. Try again in a moment." });
            }
            await updateReport(input.id, { competitorIntel: intel });
            break;
          }
        }

        return getReportById(input.id);
      }),

    /** One-click positioning statement from the report's competitor intel. */
    generatePositioning: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const report = await getReportById(input.id);
        if (!report || report.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        if (!report.competitorIntel) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Generate competitor intel first" });
        }
        const search = await getMiningSearchById(report.searchId);
        const statement = await generatePositioningStatement(
          search?.keyword ?? report.name,
          report.competitorIntel,
          search?.brandVoice ?? undefined
        );
        await updateReport(input.id, {
          competitorIntel: { ...report.competitorIntel, positioningStatement: statement },
        });
        return { statement };
      }),
  }),

  // ─── Report Sharing ──────────────────────────────────────────────────────────

  share: router({
    /** Create (or return the existing active) public share link for a report. */
    create: protectedProcedure
      .input(z.object({ reportId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const report = await getReportById(input.reportId);
        if (!report || report.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        const existing = await getActiveShareForReport(input.reportId, ctx.user.id);
        if (existing) {
          return { token: existing.token, expiresAt: existing.expiresAt };
        }

        const token = nanoid(12);
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await createSharedReport({ reportId: input.reportId, userId: ctx.user.id, token, expiresAt });
        await logActivity(ctx.user.id, "report_shared", report.name);
        return { token, expiresAt };
      }),

    /** Current active share link for a report (if any). */
    getForReport: protectedProcedure
      .input(z.object({ reportId: z.number() }))
      .query(async ({ ctx, input }) => {
        const share = await getActiveShareForReport(input.reportId, ctx.user.id);
        return share ? { token: share.token, expiresAt: share.expiresAt } : null;
      }),

    revoke: protectedProcedure
      .input(z.object({ reportId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await revokeSharedReport(input.reportId, ctx.user.id);
        return { success: true };
      }),

    /** Public: read a shared report by token. No auth required. */
    getPublic: publicProcedure
      .input(z.object({ token: z.string().min(1).max(64) }))
      .query(async ({ input }) => {
        const share = await getSharedReportByToken(input.token);
        if (!share) {
          throw new TRPCError({ code: "NOT_FOUND", message: "This share link has expired or does not exist" });
        }
        const report = await getReportById(share.reportId);
        if (!report) throw new TRPCError({ code: "NOT_FOUND" });
        const analysis = await getAnalysisResultBySearchId(report.searchId);
        // Strip ownership fields from the public payload
        const { userId: _u, searchId: _s, ...publicReport } = report;
        return {
          report: publicReport,
          analysis: analysis
            ? {
                sentimentBreakdown: analysis.sentimentBreakdown,
                topThemes: analysis.topThemes,
                verbatimQuotes: analysis.verbatimQuotes,
              }
            : null,
          expiresAt: share.expiresAt,
        };
      }),
  }),

  // ─── Vault ───────────────────────────────────────────────────────────────────

  vault: router({
    save: protectedProcedure
      .input(
        z.object({
          reportId: z.number(),
          searchKeyword: z.string().max(100000),
          contentType: z.enum(["hook", "email", "skool_post", "ad_copy", "script", "youtube_idea"]),
          label: z.string().max(100000),
          content: z.string().max(100000),
          metadata: z.record(z.string(), z.string()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Check if already saved (toggle off)
        const existingId = await checkVaultItemExists(ctx.user.id, input.reportId, input.label);
        if (existingId && typeof existingId === "number") {
          await deleteVaultItem(existingId, ctx.user.id);
          return { saved: false };
        }
        await createVaultItem({
          userId: ctx.user.id,
          reportId: input.reportId,
          searchKeyword: input.searchKeyword,
          contentType: input.contentType,
          label: input.label,
          content: input.content,
          metadata: (input.metadata ?? {}) as Record<string, string>,
        });
        await logActivity(ctx.user.id, "vault_saved", input.label.slice(0, 200));
        return { saved: true };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return getVaultItemsByUser(ctx.user.id);
    }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteVaultItem(input.id, ctx.user.id);
        return { success: true };
      }),

    /** Bulk delete selected vault items. */
    deleteMany: protectedProcedure
      .input(z.object({ ids: z.array(z.number()).min(1).max(500) }))
      .mutation(async ({ ctx, input }) => {
        await deleteVaultItems(input.ids, ctx.user.id);
        return { success: true };
      }),

    /** Update tags and/or collection on a vault item. */
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          tags: z.array(z.string().min(1).max(50)).max(20).optional(),
          collectionId: z.number().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const data: { tags?: string[]; collectionId?: number | null } = {};
        if (input.tags !== undefined) data.tags = input.tags;
        if (input.collectionId !== undefined) data.collectionId = input.collectionId;
        await updateVaultItem(input.id, ctx.user.id, data);
        return { success: true };
      }),

    collections: router({
      list: protectedProcedure.query(async ({ ctx }) => {
        return getVaultCollectionsByUser(ctx.user.id);
      }),
      create: protectedProcedure
        .input(z.object({ name: z.string().min(1).max(200) }))
        .mutation(async ({ ctx, input }) => {
          const id = await createVaultCollection(ctx.user.id, input.name);
          return { id };
        }),
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
          await deleteVaultCollection(input.id, ctx.user.id);
          return { success: true };
        }),
    }),
  }),

  // ─── Content Calendar ─────────────────────────────────────────────────────────

  calendar: router({
    /** Calendar entries joined with their vault items for a date range. */
    list: protectedProcedure
      .input(z.object({ fromDate: z.string().length(10), toDate: z.string().length(10) }))
      .query(async ({ ctx, input }) => {
        const [entries, items] = await Promise.all([
          getCalendarEntriesByUser(ctx.user.id, input.fromDate, input.toDate),
          getVaultItemsByUser(ctx.user.id),
        ]);
        const itemsById = new Map(items.map((i) => [i.id, i]));
        return entries
          .map((e) => {
            const item = itemsById.get(e.vaultItemId);
            return item ? { ...e, item } : null;
          })
          .filter((e): e is NonNullable<typeof e> => e !== null);
      }),

    add: protectedProcedure
      .input(z.object({ vaultItemId: z.number(), scheduledDate: z.string().length(10) }))
      .mutation(async ({ ctx, input }) => {
        const id = await createCalendarEntry({
          userId: ctx.user.id,
          vaultItemId: input.vaultItemId,
          scheduledDate: input.scheduledDate,
        });
        return { id };
      }),

    /** Drag-and-drop: move an entry to a new date. */
    move: protectedProcedure
      .input(z.object({ id: z.number(), scheduledDate: z.string().length(10) }))
      .mutation(async ({ ctx, input }) => {
        await updateCalendarEntry(input.id, ctx.user.id, input.scheduledDate);
        return { success: true };
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteCalendarEntry(input.id, ctx.user.id);
        return { success: true };
      }),

    /**
     * Auto-fill a month with unscheduled vault content:
     * 2x Skool posts/week, 1x email/week, 3x hooks/week, 1x video script/week.
     */
    autoFill: protectedProcedure
      .input(z.object({ monthStart: z.string().length(10) }))
      .mutation(async ({ ctx, input }) => {
        const start = new Date(`${input.monthStart}T00:00:00Z`);
        if (isNaN(start.getTime())) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid month start date" });
        }
        const monthEndDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
        const toDateStr = (d: Date) => d.toISOString().slice(0, 10);

        const [items, existing] = await Promise.all([
          getVaultItemsByUser(ctx.user.id),
          getCalendarEntriesByUser(ctx.user.id, toDateStr(start), toDateStr(monthEndDate)),
        ]);

        const scheduledItemIds = new Set(existing.map((e) => e.vaultItemId));
        const pool = (type: string) => items.filter((i) => i.contentType === type && !scheduledItemIds.has(i.id));

        const skool = pool("skool_post");
        const emails = pool("email");
        const hooks = pool("hook");
        const scripts = pool("script");

        // Weekly slots as day-of-month offsets from each week start (Mon-based grid not required;
        // we just space content sensibly through each 7-day block of the month)
        const WEEKLY_SLOTS: Array<{ pool: typeof skool; dayOffsets: number[] }> = [
          { pool: skool, dayOffsets: [0, 3] },   // 2x Skool posts/week (e.g. Mon + Thu)
          { pool: emails, dayOffsets: [2] },     // 1x email/week (e.g. Wed)
          { pool: hooks, dayOffsets: [1, 3, 5] },// 3x hooks/week (e.g. Tue, Thu, Sat)
          { pool: scripts, dayOffsets: [4] },    // 1x video/week (e.g. Fri)
        ];

        let created = 0;
        const daysInMonth = monthEndDate.getUTCDate();

        for (let weekStart = 1; weekStart <= daysInMonth; weekStart += 7) {
          for (const slot of WEEKLY_SLOTS) {
            for (const offset of slot.dayOffsets) {
              const day = weekStart + offset;
              if (day > daysInMonth) continue;
              const item = slot.pool.shift();
              if (!item) continue;
              const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day));
              await createCalendarEntry({
                userId: ctx.user.id,
                vaultItemId: item.id,
                scheduledDate: toDateStr(date),
              });
              created++;
            }
          }
        }

        return { created };
      }),
  }),

  // ─── Dashboard ───────────────────────────────────────────────────────────────

  dashboard: router({
    /** Quick Stats row: keywords mined, content pieces, vault items, trend snapshots. */
    stats: protectedProcedure.query(async ({ ctx }) => {
      const [searches, reports, vaultCount, snapshotCount] = await Promise.all([
        getMiningSearchesByUser(ctx.user.id),
        getReportsByUser(ctx.user.id),
        getVaultItemCount(ctx.user.id),
        getTrendSnapshotCount(ctx.user.id),
      ]);

      // Rough content piece count across all reports
      const contentPieces = reports.reduce((sum, r) => {
        const hooks = Array.isArray(r.viralHooks) ? r.viralHooks.length : 0;
        const ads = Array.isArray(r.adCopyIdeas) ? r.adCopyIdeas.length : 0;
        const posts = Array.isArray(r.skoolPosts) ? r.skoolPosts.length : 0;
        const scripts = Array.isArray(r.talkingHeadScripts) ? r.talkingHeadScripts.length : 0;
        const ideas = Array.isArray(r.youtubeIdeas) ? r.youtubeIdeas.length : 0;
        const emails = r.emailSequence?.emails?.length ?? 0;
        return sum + hooks + ads + posts + scripts + ideas + emails;
      }, 0);

      return {
        keywordsMined: new Set(searches.map((s) => s.keyword.toLowerCase())).size,
        contentPieces,
        vaultItems: vaultCount,
        trendSnapshots: snapshotCount,
        completedSearches: searches.filter((s) => s.status === "complete").length,
        activeSearches: searches.filter((s) => s.status === "mining" || s.status === "analyzing").length,
        totalReports: reports.length,
      };
    }),

    /** Last 10 actions for the Recent Activity feed. */
    activity: protectedProcedure.query(async ({ ctx }) => {
      return getRecentActivity(ctx.user.id, 10);
    }),

    /** Onboarding checklist state, derived from real usage. */
    onboarding: protectedProcedure.query(async ({ ctx }) => {
      const [searches, reports, vaultCount, searchKeywords] = await Promise.all([
        getMiningSearchesByUser(ctx.user.id),
        getReportsByUser(ctx.user.id),
        getVaultItemCount(ctx.user.id),
        getDistinctTrendKeywords(),
      ]);
      const mine = new Set(searches.map((s) => s.keyword.toLowerCase()));
      return {
        ranFirstSearch: searches.length > 0,
        viewedReport: reports.length > 0,
        savedToVault: vaultCount > 0,
        checkedTrends: searchKeywords.some((k) => mine.has(k.toLowerCase())),
      };
    }),
  }),

  // ─── Trends ──────────────────────────────────────────────────────────────────

  trends: router({
    // Get distinct keywords that have snapshots, limited to this user's search keywords
    getKeywords: protectedProcedure.query(async ({ ctx }) => {
      const [all, searches] = await Promise.all([
        getDistinctTrendKeywords(),
        getMiningSearchesByUser(ctx.user.id),
      ]);
      const mine = new Set(searches.map((s) => s.keyword.toLowerCase()));
      return all.filter((k) => mine.has(k.toLowerCase()));
    }),

    // Get keywords from user's past searches (for dropdown)
    getUserKeywords: protectedProcedure.query(async ({ ctx }) => {
      const searches = await getMiningSearchesByUser(ctx.user.id);
      const keywords = Array.from(new Set(searches.map((s) => s.keyword)));
      return keywords;
    }),

    // Get last N days of snapshots for a keyword
    getSnapshots: protectedProcedure
      .input(z.object({ keyword: z.string().min(1).max(500), days: z.number().min(1).max(30).default(7) }))
      .query(async ({ ctx, input }) => {
        await assertKeywordBelongsToUser(ctx.user.id, input.keyword);
        return getTrendSnapshots(input.keyword, input.days);
      }),

    // Get the latest snapshot for a keyword
    getLatest: protectedProcedure
      .input(z.object({ keyword: z.string().min(1).max(500) }))
      .query(async ({ ctx, input }) => {
        await assertKeywordBelongsToUser(ctx.user.id, input.keyword);
        return getLatestTrendSnapshot(input.keyword);
      }),

    /**
     * Momentum scores (0-100) for each of the user's tracked keywords, based on
     * snapshot velocity: average topic score of the latest snapshot vs the
     * previous one, weighted by rising/emerging topic counts. Also returns the
     * top 3 rising topics across all keywords for the "Trending Now" section.
     */
    momentum: protectedProcedure.query(async ({ ctx }) => {
      const searches = await getMiningSearchesByUser(ctx.user.id);
      const keywords = Array.from(new Set(searches.map((s) => s.keyword)));

      const perKeyword = await Promise.all(
        keywords.map(async (keyword) => {
          const snapshots = await getTrendSnapshots(keyword, 8);
          if (snapshots.length === 0) return null;

          const latest = snapshots[0];
          const previous = snapshots[1];

          const avg = (topics: Array<{ score: number }>) =>
            topics.length ? topics.reduce((s, t) => s + t.score, 0) / topics.length : 0;

          const latestAvg = avg(latest.trendingTopics);
          const prevAvg = previous ? avg(previous.trendingTopics) : latestAvg;
          const delta = latestAvg - prevAvg; // -100..100 in theory, usually small

          const risingCount = latest.trendingTopics.filter(
            (t) => t.momentum === "Rising" || t.momentum === "Emerging"
          ).length;
          const risingRatio = latest.trendingTopics.length
            ? risingCount / latest.trendingTopics.length
            : 0;

          // Base on current strength, boosted by velocity and rising share
          const momentum = Math.max(0, Math.min(100, Math.round(latestAvg * 0.6 + delta * 2 + risingRatio * 40)));

          return {
            keyword,
            momentum,
            snapshotCount: snapshots.length,
            topTopics: latest.trendingTopics
              .filter((t) => t.momentum === "Rising" || t.momentum === "Emerging")
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
              .map((t) => ({ ...t, keyword })),
          };
        })
      );

      const tracked = perKeyword.filter((k): k is NonNullable<typeof k> => k !== null);
      const trendingNow = tracked
        .flatMap((k) => k.topTopics)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      return {
        keywords: tracked.map(({ keyword, momentum, snapshotCount }) => ({ keyword, momentum, snapshotCount })),
        trendingNow,
      };
    }),

    // Manual trigger: generate a fresh snapshot right now
    manualRefresh: protectedProcedure
      .input(z.object({ keyword: z.string().min(1).max(500) }))
      .mutation(async ({ ctx, input }) => {
        await assertKeywordBelongsToUser(ctx.user.id, input.keyword);
        const { generateTrendSnapshotForKeyword } = await import("./scheduledHandlers");
        const today = new Date().toISOString().slice(0, 10);
        const snapshot = await generateTrendSnapshotForKeyword(input.keyword, today);
        await saveTrendSnapshot({
          keyword: input.keyword,
          snapshotDate: today,
          trendingTopics: snapshot.trendingTopics,
          trendingPhrases: snapshot.trendingPhrases,
          emergingQuestions: snapshot.emergingQuestions,
        });
        await logActivity(ctx.user.id, "trend_refreshed", input.keyword);
        return { ok: true, date: today };
      }),
  }),

  // ─── Comparison ──────────────────────────────────────────────────────────────

  comparison: router({
    compare: protectedProcedure
      .input(z.object({ searchIds: z.array(z.number()).min(2).max(5) }))
      .query(async ({ ctx, input }) => {
        const results = await Promise.all(
          input.searchIds.map(async (id) => {
            const search = await getMiningSearchById(id);
            if (!search || search.userId !== ctx.user.id) return null;
            const analysis = await getAnalysisResultBySearchId(id);
            const report = await getReportBySearchId(id);
            return { search, analysis, report };
          })
        );
        return results.filter(Boolean);
      }),
  }),
});

export type AppRouter = typeof appRouter;

// ─── Report generation pipeline ────────────────────────────────────────────────

/**
 * Generate every report section in parallel from an analysis result.
 * Competitor intel failing (or finding nothing) never blocks the report.
 */
async function generateAllSections(
  keyword: string,
  analysisResult: AnalysisInput | Record<string, unknown>,
  brandVoice?: string
) {
  const analysis = analysisResult as unknown as AnalysisInput;
  const [
    marketIntelligence,
    viralHooks,
    adCopyIdeas,
    skoolPosts,
    talkingHeadScripts,
    emailSequence,
    youtubeIdeas,
    competitorIntel,
  ] = await Promise.all([
    generateDeepMarketIntelligence(keyword, analysis, brandVoice),
    generateViralHooks(keyword, analysis, brandVoice),
    generateAdCopy(keyword, analysis, brandVoice),
    generateSkoolPosts(keyword, analysis, brandVoice),
    generateTalkingHeadScripts(keyword, analysis, brandVoice),
    generateEmailSequence(keyword, analysis, brandVoice),
    generateYouTubeIdeas(keyword, analysis, brandVoice),
    generateCompetitorIntel(keyword, brandVoice).catch((err) => {
      console.warn("[CompetitorIntel] Generation failed, continuing without it:", err);
      return null;
    }),
  ]);

  return {
    marketIntelligence,
    viralHooks,
    adCopyIdeas,
    skoolPosts,
    talkingHeadScripts,
    emailSequence,
    youtubeIdeas,
    competitorIntel: competitorIntel ?? undefined,
  };
}

// ─── Background processing ────────────────────────────────────────────────────

async function processAnalysis(searchId: number, keyword: string, platforms: string[], brandVoice?: string, userId?: number) {
  try {
    await updateMiningSearchStatus(searchId, "mining", 10, "Warming up the scrapers...");

    // Live per-source progress from the scraper (Reddit counts, YouTube counts, ...)
    const onScrapeProgress = (message: string) => {
      updateMiningSearchStatus(searchId, "mining", 25, message).catch(() => {});
    };

    const analysisOutput = await runAnalysis(keyword, platforms, brandVoice, onScrapeProgress);

    await updateMiningSearchStatus(searchId, "analyzing", 45, "Extracting pain points, desires, fears, and buying triggers from real conversations...");

    await upsertAnalysisResult({
      searchId,
      ...analysisOutput,
    });

    await updateMiningSearchStatus(searchId, "analyzing", 60, "Writing your report: hooks, ads, Skool posts, scripts, emails, competitor intel...");

    // Auto-generate the full report immediately — no manual button needed
    const reportName = `${keyword} Market Intelligence Report`;
    const sections = await generateAllSections(keyword, analysisOutput, brandVoice);

    await updateMiningSearchStatus(searchId, "analyzing", 90, "Finalising your report...");

    await createReport({
      searchId,
      userId: userId ?? 0,
      name: reportName,
      ...sections,
    });

    if (userId) await logActivity(userId, "report_generated", reportName);

    await updateMiningSearchStatus(searchId, "complete", 100, "Report ready!");
  } catch (err) {
    console.error("[processAnalysis] Error:", err);
    await updateMiningSearchStatus(searchId, "failed", 0, "Analysis failed. Please try again.");
  }
}

/** Run bulk search pipelines with a concurrency cap. */
async function runBulkPipelines(
  searchIds: number[],
  keywords: string[],
  platforms: string[],
  brandVoice: string | undefined,
  userId: number
) {
  const queue = searchIds.map((id, i) => ({ id, keyword: keywords[i] }));
  const workers = Array.from({ length: Math.min(BULK_CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) break;
      await processAnalysis(job.id, job.keyword, platforms, brandVoice, userId).catch((err) =>
        console.error(`[Bulk] Search ${job.id} failed:`, err)
      );
    }
  });
  await Promise.all(workers);
}

/** Trend data is stored per keyword; only allow access to keywords the user has actually searched. */
async function assertKeywordBelongsToUser(userId: number, keyword: string) {
  const searches = await getMiningSearchesByUser(userId);
  const mine = new Set(searches.map((s) => s.keyword.toLowerCase()));
  if (!mine.has(keyword.toLowerCase())) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Run a search for this keyword first to track its trends" });
  }
}
