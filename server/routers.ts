import { COOKIE_NAME, ONE_YEAR_MS, PORTAL_COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  createCalendarEntry,
  createClient,
  createClientDocument,
  createJob,
  createMiningSearch,
  createReport,
  createSharedReport,
  createVaultCollection,
  createVaultItem,
  deleteCalendarEntry,
  deleteClient,
  deleteClientDocument,
  deleteReport,
  deleteMiningSearch,
  deleteVaultCollection,
  deleteVaultItem,
  deleteVaultItems,
  checkVaultItemExists,
  getActiveShareForReport,
  getAnalysisResultBySearchId,
  getCalendarEntriesByUser,
  getClientAssetById,
  createRefImage,
  deleteRefImage,
  getRefImageById,
  getRefImagesMeta,
  getClientAssetsMeta,
  getClientById,
  getClientDocumentById,
  getClientDocuments,
  getClientsByUser,
  getLatestJobForClient,
  getSearchesByClient,
  getMiningSearchById,
  getMiningSearchesByUser,
  getRecentActivity,
  getReportById,
  getReportBySearchId,
  getReportsByUser,
  getSharedReportByToken,
  addRecordingItem,
  listRecordingItems,
  getClientByRecordingToken,
  setRecordingToken,
  getRecordingItemById,
  setRecordingItemRecorded,
  deleteRecordingItem,
  getTrendSnapshotCount,
  getVaultCollectionsByUser,
  getVaultItemCount,
  getVaultItemsByUser,
  logActivity,
  getPortalLoginByEmail,
  getPortalLoginById,
  getPortalLoginByClientId,
  upsertPortalLogin,
  setPortalLoginPassword,
  deletePortalLogin,
  touchPortalLastLogin,
  reviewClientAsset,
  revokeSharedReport,
  setClientDocumentStatus,
  setJobStatus,
  updateCalendarEntry,
  updateClient,
  updateClientDocument,
  updateMiningSearchStatus,
  updateReport,
  updateVaultItem,
  upsertAnalysisResult,
  upsertClientDocumentByType,
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
  generateSkoolPosts,
  generateTalkingHeadScripts,
  generateViralHooks,
  generateYouTubeIdeas,
  runAnalysis,
  type AnalysisInput,
} from "./aiAnalysis";
import type { DeepMarketIntelligence } from "@shared/reportContent";
import { fetchRelatedSearches } from "./realScraper";
import { ON_DEMAND_TYPES, STAGE_ORDER, STAGES } from "./stages";
import { harvestCompetitorSources, resolveYouTubeLabels } from "./competitorSources";
import { getClientSocialStats } from "./socialStats";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  authenticatePortalRequest,
  clearLoginFailures,
  createPortalSessionToken,
  generatePortalPassword,
  hashPortalPassword,
  loginThrottled,
  recordLoginFailure,
  verifyPortalPassword,
} from "./portalAuth";

/**
 * Section titles of a multi-part script doc (each ## / ### heading = one
 * video) — the server-side mirror of the client's docSections parser, so
 * "every section ticked" can complete the item authoritatively.
 */
function scriptSectionTitles(content: string): string[] {
  const clean = content.replace(/```html[\s\S]*?```/g, "");
  for (const level of ["##", "###"]) {
    const re = new RegExp(`^${level}\\s+(.+)$`, "gm");
    const titles = Array.from(clean.matchAll(re)).map((m) => m[1].replace(/\*+/g, "").trim().slice(0, 280));
    if (titles.length >= 2) return titles;
  }
  return [];
}

/** Recorded → the card leaves the to-do and lands in the Editing stage. */
async function advanceDocAfterRecording(docId: number, currentStatus: string | null): Promise<void> {
  if (!["editing", "posted", "archived"].includes(currentStatus ?? "draft")) {
    await setClientDocumentStatus(docId, "editing");
  }
}

/** Requires a valid client-portal session cookie; injects ctx.portal. */
const portalProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const session = await authenticatePortalRequest(ctx.req);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in to your portal" });
  const login = await getPortalLoginById(session.loginId);
  if (!login || login.clientId !== session.clientId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in to your portal" });
  }
  return next({ ctx: { ...ctx, portal: { loginId: login.id, clientId: login.clientId, email: login.email } } });
});

/**
 * Pull competitor URLs out of whatever the user pasted — full URLs, bare
 * domains, Notion exports with markdown around them. Users are not going
 * to paste a clean one-URL-per-line list.
 */
function extractCompetitorUrls(text: string): string[] {
  const urls = new Set<string>();
  const clean = (u: string) => u.replace(/[*)\],.'"«»<>]+$/g, "").replace(/\/+$/, "");

  for (const m of Array.from(text.matchAll(/https?:\/\/[^\s)\]"'<>*]+/g))) {
    urls.add(clean(m[0]));
  }
  // Protocol-less links on known platforms (instagram.com/x, www.skool.com/y)
  for (const m of Array.from(
    text.matchAll(/(?:^|[\s(])((?:www\.)?(?:instagram|facebook|youtube|skool|tiktok|linkedin)\.com\/[^\s)\]"'<>*]+)/gi)
  )) {
    urls.add(clean(`https://${m[1].replace(/^www\./i, "www.")}`));
  }

  // Dedupe by normalised form (protocol-less matches often duplicate full URLs)
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of Array.from(urls)) {
    const key = u.replace(/^https?:\/\/(www\.)?/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out.slice(0, 10);
}

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

/** Guard: fetch a client and confirm it belongs to the caller. */
async function requireClient(clientId: number, userId: number) {
  const client = await getClientById(clientId);
  if (!client || client.userId !== userId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
  }
  return client;
}

export const appRouter = router({
  system: systemRouter,

  // ─── Clients (Client OS) ────────────────────────────────────────────────────

  clients: router({
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(200),
          niche: z.string().min(1).max(300),
          funnelType: z.enum(["webinar", "call"]),
          pricePoint: z.string().max(200).optional(),
          instagramHandle: z.string().max(200).optional(),
          youtubeHandle: z.string().max(200).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const id = await createClient({
          userId: ctx.user.id,
          name: input.name.trim(),
          niche: input.niche.trim(),
          funnelType: input.funnelType,
          pricePoint: input.pricePoint?.trim() || null,
          instagramHandle: input.instagramHandle?.trim() || null,
          youtubeHandle: input.youtubeHandle?.trim() || null,
        });
        await logActivity(ctx.user.id, "client_created", input.name);
        return { id };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const list = await getClientsByUser(ctx.user.id);
      return Promise.all(
        list.map(async (c) => {
          const [docs, searches, job] = await Promise.all([
            getClientDocuments(c.id),
            getSearchesByClient(c.id),
            getLatestJobForClient(c.id, "foundation"),
          ]);
          return {
            ...c,
            onboardingCount: docs.filter((d) => d.kind === "onboarding").length,
            reportCount: searches.filter((s) => s.status === "complete").length,
            foundationStatus: job?.status ?? null,
            // Studio is the home once the foundation shipped: the competitor
            // desk and engines then shape the FIRST ad batch, not the second
            studioReady: docs.some((d) => ["icp_snapshot", "offers", "ad_scripts", "ad_statics"].includes(d.docType)),
          };
        })
      );
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const client = await requireClient(input.id, ctx.user.id);
        // doc_create/doc_edit are the on-demand single-doc AI jobs; including them
        // here makes an in-flight one keep the studio auto-refetching until the
        // worker drops the finished doc onto its board.
        const allJobTypes = [...STAGE_ORDER, ...ON_DEMAND_TYPES, "doc_create", "doc_edit"];
        const [documents, searches, ...stageJobs] = await Promise.all([
          getClientDocuments(input.id),
          getSearchesByClient(input.id),
          ...allJobTypes.map((stage) => getLatestJobForClient(input.id, stage)),
        ]);
        const jobs = Object.fromEntries(
          allJobTypes.map((stage, i) => [stage, stageJobs[i] ?? null])
        ) as Record<(typeof allJobTypes)[number], Awaited<ReturnType<typeof getLatestJobForClient>> | null>;
        const assets = await getClientAssetsMeta(input.id);
        const completeSearch = searches.find((sr) => sr.status === "complete");
        const researchReport = completeSearch ? await getReportBySearchId(completeSearch.id) : null;
        // A linked report (onboarding chose an existing report instead of running a
        // fresh search) also carries competitor intel — harvest it too so the
        // Competitor Desk is seeded from the research even without a client search.
        const linkedReport =
          client.linkedReportId && client.linkedReportId !== researchReport?.id
            ? await getReportById(client.linkedReportId)
            : null;
        // Platform-tagged competitor sources pre-seed the Competitor Desk's miner.
        // The research report's competitor intel section carries channel links too.
        const competitorSources = harvestCompetitorSources({
          researchUrls: searches.flatMap((sr) => (sr.competitorUrls as string[] | null) ?? []),
          researchText:
            [researchReport, linkedReport]
              .filter(Boolean)
              .map((r) => JSON.stringify(r))
              .join("\n") || undefined,
          onboardingTexts: documents.filter((d) => d.kind === "onboarding").map((d) => d.content),
        });
        return {
          client,
          documents,
          searches,
          jobs,
          assets,
          refImages: await getRefImagesMeta(input.id),
          exportJob: await getLatestJobForClient(input.id, "export_drive"),
          competitorSources: await resolveYouTubeLabels(competitorSources),
          researchReportId: client.linkedReportId ?? researchReport?.id ?? null,
          linkedReportId: client.linkedReportId ?? null,
        };
      }),

    /** Approve or reject ONE rendered asset (static ad) with optional feedback. */
    reviewAsset: protectedProcedure
      .input(
        z.object({
          assetId: z.number(),
          action: z.enum(["approve", "reject"]),
          feedback: z.string().max(5000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const asset = await getClientAssetById(input.assetId);
        if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found" });
        const client = await requireClient(asset.clientId, ctx.user.id);
        await reviewClientAsset(
          input.assetId,
          input.action === "approve" ? "approved" : "rejected",
          input.feedback?.trim() || null
        );
        // AUTOPILOT: the LAST verdict on a batch, with rejects present,
        // queues the rebuild immediately — same request the Rebuild button
        // composes, grouped per owning engine.
        if (client.autoRun) {
          const all = await getClientAssetsMeta(asset.clientId);
          const pending = all.filter((a) => a.status === "pending");
          const rejected = all.filter((a) => a.status === "rejected");
          if (!pending.length && rejected.length) {
            const approvedNames = all.filter((a) => a.status === "approved").map((a) => a.filename);
            const groups = new Map<string, typeof rejected>();
            for (const a of rejected) {
              const stage = a.docType === "ad_statics_extra" ? "more_statics" : "ads";
              groups.set(stage, [...(groups.get(stage) ?? []), a]);
            }
            const queued: number[] = [];
            for (const [stage, group] of Array.from(groups.entries())) {
              const active = await getLatestJobForClient(asset.clientId, stage);
              if (active && (active.status === "queued" || active.status === "running")) continue;
              const feedback = [
                `REBUILD ONLY these rejected static ads (keep each one's EXACT filename); do NOT generate any other ads:`,
                ...group.map((a) => `- ${a.filename}: ${a.feedback || "rejected, no note"}`),
                approvedNames.length ? `Approved library (do not touch, do not re-render): ${approvedNames.join(", ")}` : "",
              ]
                .filter(Boolean)
                .join("\n");
              queued.push(
                await createJob({
                  clientId: asset.clientId,
                  userId: ctx.user.id,
                  type: stage,
                  status: "queued",
                  payload: { feedback },
                })
              );
            }
            if (queued.length) return { ok: true, autoRebuild: queued };
          }
        }
        return { ok: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.id, ctx.user.id);
        await deleteClient(input.id);
        return { ok: true };
      }),

    /** Upload a proof/cutout image the ad engine can composite into statics. */
    addRefImage: protectedProcedure
      .input(
        z.object({
          clientId: z.number(),
          filename: z.string().min(1).max(300),
          mime: z.string().max(100),
          // base64 payload without the data: URL prefix; ~5MB decoded cap
          data: z.string().min(1).max(7_000_000),
          note: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        const id = await createRefImage({
          clientId: input.clientId,
          filename: input.filename.trim(),
          mime: input.mime || "image/png",
          data: input.data,
          note: input.note?.trim() || null,
        });
        return { id };
      }),

    deleteRefImage: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const img = await getRefImageById(input.id);
        if (!img) throw new TRPCError({ code: "NOT_FOUND", message: "Image not found" });
        await requireClient(img.clientId, ctx.user.id);
        await deleteRefImage(input.id);
        return { ok: true };
      }),

    /** The user's existing reports, to link one at onboarding instead of running research. */
    availableReports: protectedProcedure.query(async ({ ctx }) => {
      const reports = await getReportsByUser(ctx.user.id);
      return reports.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt }));
    }),

    /** Link an existing report to this client (skips running fresh research). Pass null to unlink. */
    linkReport: protectedProcedure
      .input(z.object({ clientId: z.number(), reportId: z.number().nullable() }))
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        if (input.reportId != null) {
          const report = await getReportById(input.reportId);
          if (!report || report.userId !== ctx.user.id) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
          }
        }
        await updateClient(input.clientId, { linkedReportId: input.reportId });
        return { ok: true };
      }),

    /** Set the client's OWN social handles for the live stats card. */
    setSocials: protectedProcedure
      .input(
        z.object({
          clientId: z.number(),
          instagramHandle: z.string().max(200).optional(),
          youtubeHandle: z.string().max(200).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        await updateClient(input.clientId, {
          instagramHandle: input.instagramHandle?.trim() || null,
          youtubeHandle: input.youtubeHandle?.trim() || null,
        });
        return { ok: true };
      }),

    /** Live follower/subscriber stats for the client's own socials (cached 1h). */
    socialStats: protectedProcedure
      .input(z.object({ clientId: z.number() }))
      .query(async ({ ctx, input }) => {
        const client = await requireClient(input.clientId, ctx.user.id);
        return getClientSocialStats(client);
      }),

    /** Push the approved static ads into the client's Google Drive Ads folder.
     *  The local worker does the copy (it has the Drive mount); this just queues it. */
    exportApprovedToDrive: protectedProcedure
      .input(z.object({ clientId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        const existing = await getLatestJobForClient(input.clientId, "export_drive");
        if (existing && (existing.status === "queued" || existing.status === "running")) {
          throw new TRPCError({ code: "CONFLICT", message: "An export is already in progress" });
        }
        const approved = (await getClientAssetsMeta(input.clientId)).filter((a) => a.status === "approved");
        if (!approved.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No approved ads to export yet" });
        const id = await createJob({ clientId: input.clientId, userId: ctx.user.id, type: "export_drive", status: "queued", payload: {} });
        return { jobId: id, count: approved.length };
      }),

    addTextDocument: protectedProcedure
      .input(
        z.object({
          clientId: z.number(),
          docType: z.enum(["voice_transcript", "competitors", "intake", "other"]),
          title: z.string().min(1).max(300),
          content: z.string().min(1).max(2_000_000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        const id = await createClientDocument({
          clientId: input.clientId,
          kind: "onboarding",
          docType: input.docType,
          title: input.title.trim(),
          content: input.content,
        });
        return { id };
      }),

    addPdfDocument: protectedProcedure
      .input(
        z.object({
          clientId: z.number(),
          docType: z.enum(["voice_transcript", "competitors", "intake", "other"]),
          filename: z.string().min(1).max(300),
          base64: z.string().min(1).max(30_000_000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        const { PDFParse } = await import("pdf-parse");
        let text = "";
        try {
          const buf = Buffer.from(input.base64, "base64");
          const parser = new PDFParse({ data: new Uint8Array(buf) });
          const parsed = await parser.getText();
          text = parsed.text?.trim() ?? "";
        } catch (err) {
          console.error("[clients.addPdfDocument] parse failed:", err);
          throw new TRPCError({ code: "BAD_REQUEST", message: "Could not read that PDF. If it is a scan, export it as text first." });
        }
        if (text.length < 100) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "That PDF has no extractable text. If it is a scan, export it as text first." });
        }
        const id = await createClientDocument({
          clientId: input.clientId,
          kind: "onboarding",
          docType: input.docType,
          title: input.filename.replace(/\.pdf$/i, ""),
          content: text,
          source: input.filename,
        });
        return { id, chars: text.length };
      }),

    updateDocument: protectedProcedure
      .input(z.object({ id: z.number(), content: z.string().min(1).max(2_000_000) }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getClientDocumentById(input.id);
        if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
        await requireClient(doc.clientId, ctx.user.id);
        await updateClientDocument(input.id, input.content);
        return { ok: true };
      }),

    /**
     * Focused AI edit of ONE document. Queues a lightweight single-doc job for
     * the Mac worker (headless Claude Code on the Max plan) to rewrite just this
     * doc with the operator's instruction. High quality, no API cost, no geo
     * limits. Never touches any other document. Result lands back on this card.
     */
    aiEditDocument: protectedProcedure
      .input(z.object({ id: z.number(), feedback: z.string().min(1).max(10000) }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getClientDocumentById(input.id);
        if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
        await requireClient(doc.clientId, ctx.user.id);
        const jobId = await createJob({
          clientId: doc.clientId,
          userId: ctx.user.id,
          type: "doc_edit",
          status: "queued",
          payload: { docId: doc.id, docType: doc.docType, title: doc.title, feedback: input.feedback.trim() },
        });
        return { jobId };
      }),

    /**
     * Create ONE finished document from scratch. Queues a focused single-doc job
     * for the Mac worker (headless Claude Code on the Max plan), which reads the
     * agency skills, frameworks and this client's approved foundation docs and
     * writes the deliverable, then drops it as a draft card on the chosen board.
     * Top quality, no API cost, no geo limits.
     */
    aiCreateDocument: protectedProcedure
      .input(
        z.object({
          clientId: z.number(),
          docType: z.string().regex(/^[a-z_]+_extra$/),
          title: z.string().min(1).max(300),
          instructions: z.string().min(1).max(10000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        const jobId = await createJob({
          clientId: input.clientId,
          userId: ctx.user.id,
          type: "doc_create",
          status: "queued",
          payload: { docType: input.docType, title: input.title.trim(), instructions: input.instructions.trim() },
        });
        return { jobId };
      }),

    /**
     * Save the client's reusable links and standing names (VSL link, community
     * link, booking link, company name, ...) as a single JSON foundation doc.
     * The studio substitutes these into every [TOKEN] on copy, so a link set
     * once flows into every email and page without hand-editing each one.
     */
    setClientLinks: protectedProcedure
      .input(z.object({ clientId: z.number(), links: z.record(z.string(), z.string()) }))
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        const clean = Object.fromEntries(
          Object.entries(input.links)
            .map(([k, v]) => [k.trim(), (v ?? "").trim()])
            .filter(([k, v]) => k && v)
        );
        await upsertClientDocumentByType(
          input.clientId,
          "foundation",
          "client_links",
          "Client Links",
          JSON.stringify(clean, null, 2)
        );
        return { ok: true };
      }),

    /**
     * Free-text "current state" facts: what ACTUALLY exists for this client
     * today (real lead magnet names, renames, what was recorded vs skipped).
     * Injected into every worker claim as overriding ground truth, so engines
     * stop referencing day-one generated names that changed in the real build.
     */
    setClientFacts: protectedProcedure
      .input(z.object({ clientId: z.number(), facts: z.string().max(20000) }))
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        await upsertClientDocumentByType(
          input.clientId,
          "foundation",
          "client_facts",
          "Client Facts",
          input.facts.trim()
        );
        return { ok: true };
      }),

    /**
     * Paste an Ads Manager export (CSV or tab-separated) and stamp real
     * spend/CTR/CPL onto the matching rendered ads. Closes the loop: every
     * future batch reads these as MARKET TRUTH above operator taste.
     */
    importMetaResults: protectedProcedure
      .input(z.object({ clientId: z.number(), csv: z.string().min(10).max(200000) }))
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        const { parseMetaCsv, matchAssetFilename } = await import("./adPerformance");
        const { setAssetMetaResults } = await import("./db");
        const rows = parseMetaCsv(input.csv);
        if (!rows.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not read that export. Paste the Ads Manager table including the header row with 'Ad name'.",
          });
        }
        const assets = await getClientAssetsMeta(input.clientId);
        const filenames = assets.map((a) => a.filename);
        let matched = 0;
        const unmatched: string[] = [];
        for (const row of rows) {
          const filename = matchAssetFilename(row.adName, filenames);
          const asset = filename ? assets.find((a) => a.filename === filename) : null;
          if (!asset) {
            unmatched.push(row.adName);
            continue;
          }
          await setAssetMetaResults(asset.id, { metaSpend: row.spend, metaCtr: row.ctr, metaCpl: row.cpl });
          matched++;
        }
        return { matched, unmatched: unmatched.slice(0, 20), total: rows.length };
      }),

    /** Autopilot on/off: approvals queue the next stage, final verdicts queue rebuilds. */
    setAutoRun: protectedProcedure
      .input(z.object({ clientId: z.number(), autoRun: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        await updateClient(input.clientId, { autoRun: input.autoRun ? 1 : 0 });
        return { ok: true };
      }),

    /** The Mac worker's pulse: last claim poll, for the online/offline chip. */
    workerStatus: protectedProcedure.query(async () => {
      const { getWorkerLastSeenAt } = await import("./workerRoutes");
      return { lastSeenAt: getWorkerLastSeenAt() };
    }),

    /** Cancel a queued job, or force-requeue one stuck in running. */
    cancelJob: protectedProcedure
      .input(z.object({ jobId: z.number(), action: z.enum(["cancel", "requeue"]) }))
      .mutation(async ({ ctx, input }) => {
        const job = await (await import("./db")).getJobById(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND" });
        await requireClient(job.clientId, ctx.user.id);
        if (job.status !== "queued" && job.status !== "running") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Job is ${job.status}, nothing to ${input.action}` });
        }
        if (input.action === "cancel") {
          await setJobStatus(input.jobId, "failed", "Canceled by the operator");
        } else {
          const { getDb } = await import("./db");
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const { jobs } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          await db
            .update(jobs)
            .set({ status: "queued", claimToken: null, heartbeatAt: null, progress: null })
            .where(eq(jobs.id, input.jobId));
        }
        return { ok: true };
      }),

    /** The client share page link (/c/:token), minting the token on first use. */
    getShareLink: protectedProcedure
      .input(z.object({ clientId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const client = await requireClient(input.clientId, ctx.user.id);
        let token = (client as { shareToken?: string | null }).shareToken;
        if (!token) {
          token = nanoid(14);
          const { setShareToken } = await import("./db");
          await setShareToken(input.clientId, token);
        }
        return { token };
      }),

    // ── Client portal access: email + password credentials, one per client ──

    /** Current portal login for a client (never returns the password). */
    portalAccess: protectedProcedure
      .input(z.object({ clientId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        const login = await getPortalLoginByClientId(input.clientId);
        return login ? { email: login.email, lastLoginAt: login.lastLoginAt, createdAt: login.createdAt } : null;
      }),

    /**
     * Create (or re-key) the client's portal login. Generates the password
     * server-side and returns it ONCE — it is never stored in plaintext, so
     * the operator copies it into the welcome email right here or resets.
     */
    setPortalLogin: protectedProcedure
      .input(z.object({ clientId: z.number(), email: z.string().email().max(320) }))
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        const email = input.email.trim().toLowerCase();
        const existing = await getPortalLoginByEmail(email);
        if (existing && existing.clientId !== input.clientId) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "That email already belongs to another client's portal login",
          });
        }
        const password = generatePortalPassword();
        await upsertPortalLogin(input.clientId, email, await hashPortalPassword(password));
        return { email, password };
      }),

    /** New password for the existing login, returned once. */
    resetPortalPassword: protectedProcedure
      .input(z.object({ clientId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        const login = await getPortalLoginByClientId(input.clientId);
        if (!login) throw new TRPCError({ code: "NOT_FOUND", message: "No portal login for this client yet" });
        const password = generatePortalPassword();
        await setPortalLoginPassword(login.id, await hashPortalPassword(password));
        return { email: login.email, password };
      }),

    removePortalLogin: protectedProcedure
      .input(z.object({ clientId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        await deletePortalLogin(input.clientId);
        return { ok: true };
      }),

    // ── Recording queue: hand scripts to the client, they mark them recorded ──

    /** The shareable /record/:token link, minting the token on first use. */
    getRecordingLink: protectedProcedure
      .input(z.object({ clientId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const client = await requireClient(input.clientId, ctx.user.id);
        let token = client.recordingToken;
        if (!token) {
          token = nanoid(14);
          await setRecordingToken(input.clientId, token);
        }
        return { token };
      }),

    /** Put one script doc on the client's recording to-do list — same effect
     *  as moving its pipeline card into the Recording stage. */
    sendToRecording: protectedProcedure
      .input(z.object({ docId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getClientDocumentById(input.docId);
        if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
        await requireClient(doc.clientId, ctx.user.id);
        const id = await addRecordingItem(doc.clientId, input.docId);
        await setClientDocumentStatus(input.docId, "recording");
        return { id };
      }),

    recordingQueue: protectedProcedure
      .input(z.object({ clientId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        const items = await listRecordingItems(input.clientId);
        return items.map(({ content: _c, ...meta }) => meta);
      }),

    removeRecordingItem: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const item = await getRecordingItemById(input.id);
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        await requireClient(item.clientId, ctx.user.id);
        await deleteRecordingItem(input.id);
        return { ok: true };
      }),

    deleteDocument: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getClientDocumentById(input.id);
        if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
        await requireClient(doc.clientId, ctx.user.id);
        await deleteClientDocument(input.id);
        return { ok: true };
      }),

    /** Operator-written draft added straight onto an engine's content board. */
    /**
     * One-time split of the Video Scripts stage doc into one recordable card
     * per script (funnel_asset_extra, born approved) so the Funnel section is
     * a real pipeline: record it, mark it posted. Idempotent.
     */
    splitFunnelScripts: protectedProcedure
      .input(z.object({ clientId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        const docs = await getClientDocuments(input.clientId);
        if (docs.some((d) => d.docType === "funnel_asset_extra")) return { created: 0 };
        const scriptsDoc = docs.find((d) => d.docType === "video_scripts");
        if (!scriptsDoc) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No video scripts yet" });

        // Split on the heading level the doc actually uses for scripts
        const splitBy = (level: string) => {
          const re = new RegExp(`^${level}\\s+(.+)$`, "gm");
          const marks = Array.from(scriptsDoc.content.matchAll(re));
          return marks.map((m, i) => ({
            title: m[1].trim().slice(0, 280),
            content: scriptsDoc.content.slice(m.index!, marks[i + 1]?.index ?? scriptsDoc.content.length).trim(),
          }));
        };
        let parts = splitBy("##");
        if (parts.length < 3) parts = splitBy("###");
        if (parts.length < 3) parts = splitBy("#");
        if (!parts.length) parts = [{ title: scriptsDoc.title, content: scriptsDoc.content }];

        for (const p of parts) {
          await createClientDocument({
            clientId: input.clientId,
            kind: "deliverable",
            docType: "funnel_asset_extra",
            title: p.title,
            content: p.content,
            status: "approved",
          });
        }
        return { created: parts.length };
      }),

    addEngineDraft: protectedProcedure
      .input(
        z.object({
          clientId: z.number(),
          docType: z.string().regex(/^[a-z_]+_extra$/),
          title: z.string().min(1).max(300),
          content: z.string().min(1).max(500_000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        const id = await createClientDocument({
          clientId: input.clientId,
          kind: "deliverable",
          docType: input.docType,
          title: input.title.trim(),
          content: input.content,
        });
        return { id };
      }),

    /**
     * Move a deliverable through its kanban. Non-recordable boards run
     * draft -> approved -> posted; recordable scripts run draft -> recording
     * -> editing -> posted. Moving INTO recording puts the script on the
     * client's to-do; pulling it back to draft takes it off again.
     */
    setDocumentStatus: protectedProcedure
      .input(z.object({ id: z.number(), status: z.enum(["draft", "approved", "posted", "archived", "recording", "editing"]) }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getClientDocumentById(input.id);
        if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
        await requireClient(doc.clientId, ctx.user.id);
        await setClientDocumentStatus(input.id, input.status);
        if (input.status === "recording") {
          await addRecordingItem(doc.clientId, input.id);
        } else if ((doc.status ?? "draft") === "recording" && input.status === "draft") {
          const { deleteRecordingItemsByDoc } = await import("./db");
          await deleteRecordingItemsByDoc(input.id);
        }
        return { ok: true };
      }),

    /**
     * Queue (or requeue) a pipeline stage job for the Mac worker. Gating
     * mirrors the mother skill: foundation needs onboarding material, every
     * later stage needs the previous stage approved.
     */
    generateStage: protectedProcedure
      .input(
        z.object({
          clientId: z.number(),
          stage: z.enum(["foundation", "skool", "funnel", "emails", "ads", "more_statics", "more_scripts", "more_content_ig", "more_content_yt", "more_emails", "more_skool", "more_landers", "content_intel"]),
          feedback: z.string().max(10000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        const stageDef = STAGES[input.stage];
        if (stageDef.requires) {
          const prev = await getLatestJobForClient(input.clientId, stageDef.requires);
          const prevApproved = prev?.status === "approved";
          // On-demand engines stay unlocked once the required stage has EVER
          // shipped docs: a rebuild putting the stage back into running must
          // not re-lock the whole studio.
          const isOnDemand = (ON_DEMAND_TYPES as readonly string[]).includes(input.stage);
          if (!prevApproved && isOnDemand) {
            const docs = await getClientDocuments(input.clientId);
            const requiredTypes = new Set(
              Object.keys(
                (await import("./stages")).stageContract(stageDef.requires, "call")
              ).concat(Object.keys((await import("./stages")).stageContract(stageDef.requires, "webinar")))
            );
            const everCompleted = docs.some((d) => requiredTypes.has(d.docType));
            if (!everCompleted) {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: `Complete ${STAGES[stageDef.requires].label} first`,
              });
            }
          } else if (!prevApproved) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `Approve ${STAGES[stageDef.requires].label} first`,
            });
          }
        } else {
          const docs = await getClientDocuments(input.clientId);
          if (!docs.some((d) => d.kind === "onboarding")) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Add onboarding material first" });
          }
        }
        const existing = await getLatestJobForClient(input.clientId, input.stage);
        if (existing && (existing.status === "queued" || existing.status === "running")) {
          throw new TRPCError({ code: "CONFLICT", message: `A ${stageDef.label} job is already in progress` });
        }
        const id = await createJob({
          clientId: input.clientId,
          userId: ctx.user.id,
          type: input.stage,
          status: "queued",
          payload: input.feedback ? { feedback: input.feedback } : {},
        });
        return { jobId: id };
      }),

    /** Approve a stage's deliverables, or reject with feedback (requeues). */
    reviewStage: protectedProcedure
      .input(
        z.object({
          clientId: z.number(),
          stage: z.enum(["foundation", "skool", "funnel", "emails", "ads", "more_statics", "more_scripts", "more_content_ig", "more_content_yt", "more_emails", "more_skool", "more_landers", "content_intel"]),
          action: z.enum(["approve", "reject"]),
          feedback: z.string().max(10000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireClient(input.clientId, ctx.user.id);
        const job = await getLatestJobForClient(input.clientId, input.stage);
        if (!job || job.status !== "review") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `No ${STAGES[input.stage].label} deliverables waiting for review`,
          });
        }
        if (input.action === "approve") {
          await setJobStatus(job.id, "approved");
          await logActivity(ctx.user.id, "foundation_approved", `${input.stage} for client ${input.clientId}`);
          // AUTOPILOT: approval queues the next stage in the chain, so the
          // pipeline runs overnight and mornings start with a review queue.
          const client = await getClientById(input.clientId);
          const chainIdx = (STAGE_ORDER as readonly string[]).indexOf(input.stage);
          const nextStage = chainIdx >= 0 ? (STAGE_ORDER as readonly string[])[chainIdx + 1] : undefined;
          if (client?.autoRun && nextStage) {
            const existing = await getLatestJobForClient(input.clientId, nextStage);
            if (!existing || (existing.status !== "queued" && existing.status !== "running" && existing.status !== "review")) {
              const jobId = await createJob({
                clientId: input.clientId,
                userId: ctx.user.id,
                type: nextStage,
                status: "queued",
                payload: {},
              });
              return { status: "approved" as const, autoQueued: nextStage, jobId };
            }
          }
          return { status: "approved" as const };
        }
        await setJobStatus(job.id, "failed", "Rejected by owner with feedback");
        const id = await createJob({
          clientId: input.clientId,
          userId: ctx.user.id,
          type: input.stage,
          status: "queued",
          payload: { feedback: input.feedback ?? "" },
        });
        return { status: "requeued" as const, jobId: id };
      }),
  }),

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
    /**
     * One search, one report. Accepts up to 10 keywords (the UI sends one per
     * line) that all feed the SAME report, plus optional competitor URLs.
     */
    create: protectedProcedure
      .input(
        z.object({
          keywords: z.array(z.string().min(1).max(500)).min(1).max(10),
          niche: z.string().max(100000).optional(),
          platforms: z.array(z.string()).min(1),
          brandVoice: z.string().max(100000).optional(),
          /** Raw competitor paste — URLs get extracted server-side, notes kept as context. */
          competitors: z.string().max(20000).optional(),
          /** Client OS: attach this research to a client workspace. */
          clientId: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const keywords = Array.from(new Set(input.keywords.map((k) => k.trim()).filter(Boolean)));
        if (keywords.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No valid keywords provided" });
        }
        if (input.clientId) await requireClient(input.clientId, ctx.user.id);
        const competitorPaste = (input.competitors ?? "").trim();
        const competitorUrls = competitorPaste ? extractCompetitorUrls(competitorPaste) : [];

        const insertId = await createMiningSearch({
          userId: ctx.user.id,
          keyword: keywords.join(", "),
          niche: input.niche ?? null,
          platforms: input.platforms,
          status: "pending",
          progress: 0,
          brandVoice: input.brandVoice ?? null,
          competitorUrls: competitorUrls.length ? competitorUrls : null,
          competitorNotes: competitorPaste || null,
          clientId: input.clientId ?? null,
        });

        const search = await getMiningSearchById(insertId);
        if (!search) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await logActivity(ctx.user.id, "search_created", keywords.join(", "));
        return search;
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
        processAnalysis(
          input.searchId,
          search.keyword,
          search.platforms as string[],
          brandVoice,
          ctx.user.id,
          (search.competitorUrls as string[] | null) ?? undefined,
          search.competitorNotes ?? undefined
        ).catch((err) => console.error("[Analysis] Failed:", err));

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
        const sections = await generateAllSections(search.keyword, analysisResult, brandVoice, (search.competitorUrls as string[] | null) ?? undefined, search.competitorNotes ?? undefined);

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
          throw new TRPCError({ code: "NOT_FOUND", message: "Analysis results not found. Please re-run the search first" });
        }
        const search = await getMiningSearchById(report.searchId);
        if (!search) throw new TRPCError({ code: "NOT_FOUND" });

        const brandVoice = search.brandVoice ?? undefined;
        const sections = await generateAllSections(search.keyword, analysisResult, brandVoice, (search.competitorUrls as string[] | null) ?? undefined, search.competitorNotes ?? undefined);

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
          throw new TRPCError({ code: "NOT_FOUND", message: "Analysis results not found. Please re-run the search first" });
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
            const intel = await generateCompetitorIntel(search.keyword, brandVoice, (search.competitorUrls as string[] | null) ?? undefined, search.competitorNotes ?? undefined);
            if (!intel) {
              throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Could not find competitor data for this keyword. Try again in a moment." });
            }
            await updateReport(input.id, { competitorIntel: intel });
            break;
          }
        }

        return getReportById(input.id);
      }),

  }),

  // ─── Client portal (app.cashflowcoaches.io/portal) ──────────────────────────

  /**
   * The client's own logged-in home: read-only, scoped to ONE client by the
   * portal session. Ad library with downloads + the Meta copy, recording
   * to-dos, research report, competitor desk, and every approved document.
   * NO generate buttons — the engines stay the operator's.
   */
  portal: router({
    login: publicProcedure
      .input(z.object({ email: z.string().email().max(320), password: z.string().min(1).max(200) }))
      .mutation(async ({ ctx, input }) => {
        const ip = String(ctx.req.headers["x-forwarded-for"] ?? ctx.req.socket?.remoteAddress ?? "unknown")
          .split(",")[0]
          .trim();
        if (loginThrottled(input.email, ip)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many attempts — wait 15 minutes and try again.",
          });
        }
        const login = await getPortalLoginByEmail(input.email);
        const ok = login && (await verifyPortalPassword(input.password, login.passwordHash));
        if (!ok) {
          recordLoginFailure(input.email, ip);
          throw new TRPCError({ code: "UNAUTHORIZED", message: "That email and password don't match." });
        }
        clearLoginFailures(input.email);
        await touchPortalLastLogin(login.id);
        // The To-Do tab reuses the recording checklist by token — mint it here
        // so every portal account can always reach its list.
        const client = await getClientById(login.clientId);
        if (client && !client.recordingToken) await setRecordingToken(client.id, nanoid(14));
        const token = await createPortalSessionToken(login.id, login.clientId);
        ctx.res.cookie(PORTAL_COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
        return { ok: true };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(PORTAL_COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { ok: true } as const;
    }),

    /** Light session probe for the login screen. */
    me: publicProcedure.query(async ({ ctx }) => {
      const session = await authenticatePortalRequest(ctx.req);
      if (!session) return null;
      const login = await getPortalLoginById(session.loginId);
      if (!login || login.clientId !== session.clientId) return null;
      const client = await getClientById(login.clientId);
      return client ? { clientName: client.name, email: login.email } : null;
    }),

    /** Everything the portal renders, in one scoped read. Deliberately
     *  NARROW: strategy docs never leave the operator's side — the client
     *  gets their ads, their content pipelines, research, and the desk. */
    home: portalProcedure.query(async ({ ctx }) => {
      const client = await getClientById(ctx.portal.clientId);
      if (!client) throw new TRPCError({ code: "NOT_FOUND" });
      const [docs, assets] = await Promise.all([
        getClientDocuments(client.id),
        getClientAssetsMeta(client.id),
      ]);

      // Content pipelines, stage-mapped: legacy 'approved' renders as Draft.
      const mapStage = (s: string | null): "draft" | "recording" | "editing" | "posted" | "archived" => {
        const v = s ?? "draft";
        if (v === "approved") return "draft";
        return (["draft", "recording", "editing", "posted", "archived"].includes(v) ? v : "draft") as
          | "draft"
          | "recording"
          | "editing"
          | "posted"
          | "archived";
      };
      const pipeline = (docType: string) =>
        docs
          .filter((d) => d.docType === docType && mapStage(d.status) !== "archived")
          .map((d) => ({
            id: d.id,
            title: d.title,
            content: d.content,
            stage: mapStage(d.status),
            updatedAt: d.updatedAt,
          }));

      const weeklyReports = docs
        .filter((d) => d.docType === "weekly_report")
        .sort((a, b) => b.id - a.id)
        .slice(0, 6)
        .map((d) => ({ title: d.title, content: d.content }));
      const intel = docs
        .filter((d) => d.docType === "content_intel_extra")
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

      const searches = await getSearchesByClient(client.id);
      const completeSearch = searches.find((sr) => sr.status === "complete");
      const researchReport = completeSearch ? await getReportBySearchId(completeSearch.id) : null;

      return {
        clientName: client.name,
        niche: client.niche,
        funnelType: client.funnelType,
        recordingToken: client.recordingToken,
        ads: assets
          .filter((a) => a.status === "approved")
          .map((a) => ({
            id: a.id,
            filename: a.filename,
            format: a.format,
            copyPrimary: a.copyPrimary,
            copyHeadline: a.copyHeadline,
            copyDescription: a.copyDescription,
            createdAt: a.createdAt,
          })),
        content: {
          shortform: pipeline("content_ig_extra"),
          youtube: pipeline("content_yt_extra"),
        },
        weeklyReports,
        intelContent: intel?.content ?? null,
        intelUpdatedAt: intel?.updatedAt ?? null,
        hasReport: Boolean(client.linkedReportId ?? researchReport),
      };
    }),

    /**
     * The client hit "recorded" on a pipeline card: the script leaves the
     * Recording stage and lands in In editing — on the operator's board too,
     * because it is the same status column.
     */
    advanceDoc: portalProcedure
      .input(z.object({ docId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getClientDocumentById(input.docId);
        if (!doc || doc.clientId !== ctx.portal.clientId) throw new TRPCError({ code: "NOT_FOUND" });
        if ((doc.status ?? "draft") !== "recording") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This script is not in the recording stage" });
        }
        await setClientDocumentStatus(input.docId, "editing");
        const items = await listRecordingItems(doc.clientId);
        const item = items.find((i) => i.docId === input.docId);
        if (item && !item.recordedAt) await setRecordingItemRecorded(item.id, true);
        return { ok: true };
      }),

    /** The client's market research report — same payload shape as the public
     *  share so the portal renders the exact owner report, read-only. */
    report: portalProcedure.query(async ({ ctx }) => {
      const client = await getClientById(ctx.portal.clientId);
      if (!client) throw new TRPCError({ code: "NOT_FOUND" });
      let report = client.linkedReportId ? await getReportById(client.linkedReportId) : null;
      if (!report) {
        const searches = await getSearchesByClient(client.id);
        const completeSearch = searches.find((sr) => sr.status === "complete");
        report = completeSearch ? await getReportBySearchId(completeSearch.id) : null;
      }
      if (!report) return null;
      const analysis = await getAnalysisResultBySearchId(report.searchId);
      const { userId: _u, searchId: _s, ...publicReport } = report;
      return {
        report: publicReport,
        analysis: analysis
          ? {
              painPoints: analysis.painPoints,
              desires: analysis.desires,
              objections: analysis.objections,
              fears: analysis.fears,
              sentimentBreakdown: analysis.sentimentBreakdown,
              topThemes: analysis.topThemes,
              verbatimQuotes: analysis.verbatimQuotes,
            }
          : null,
      };
    }),
  }),

  // ─── Report Sharing ──────────────────────────────────────────────────────────

  /** Public client share page (/c/:token): the client's window into the
   *  machine — weekly reports + the competitor desk. Token IS the auth;
   *  ONLY curated, client-safe content is returned. */
  clientShare: router({
    get: publicProcedure
      .input(z.object({ token: z.string().min(6).max(64) }))
      .query(async ({ input }) => {
        const { getClientByShareToken } = await import("./db");
        const client = await getClientByShareToken(input.token);
        if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
        const docs = await getClientDocuments(client.id);
        const weekly = docs
          .filter((d) => d.docType === "weekly_report")
          .sort((a, b) => b.id - a.id)
          .slice(0, 4)
          .map((d) => ({ title: d.title, content: d.content }));
        const intel = docs
          .filter((d) => d.docType === "content_intel_extra")
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
        return {
          clientName: client.name,
          weeklyReports: weekly,
          intelContent: intel?.content ?? null,
          intelUpdatedAt: intel?.updatedAt ?? null,
        };
      }),
  }),

  /** Public recording page: the client opens /record/:token, reads their
   *  scripts, and ticks each one off as recorded. Token IS the auth.
   *  The list IS the Recording pipeline stage — ticking a script off moves
   *  its card to In editing, so it leaves the to-do on both sides at once. */
  recording: router({
    get: publicProcedure
      .input(z.object({ token: z.string().min(6).max(64) }))
      .query(async ({ input }) => {
        const client = await getClientByRecordingToken(input.token);
        if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Recording list not found" });
        const items = await listRecordingItems(client.id);
        return {
          clientName: client.name,
          items: items
            .filter((i) => !["editing", "posted", "archived"].includes(i.status ?? "draft"))
            .map((i) => ({
              id: i.id,
              title: i.title,
              content: i.content,
              docType: i.docType,
              recordedAt: i.recordedAt,
              checkedSections: (i.checkedSections as string[] | null) ?? [],
              sectionLinks: (i.sectionLinks as Record<string, string> | null) ?? {},
              recordingUrl: i.recordingUrl ?? null,
            })),
        };
      }),

    /** Client pastes the recording URL (Loom/Wistia/YouTube) for a video.
     *  The link IS the proof it's filmed: a whole-item link (or the last
     *  section's link) ticks it off and advances the card to In editing. */
    setLink: publicProcedure
      .input(
        z.object({
          token: z.string().min(6).max(64),
          itemId: z.number(),
          section: z.string().min(1).max(300).optional(),
          url: z.string().max(1000),
        })
      )
      .mutation(async ({ input }) => {
        const client = await getClientByRecordingToken(input.token);
        if (!client) throw new TRPCError({ code: "NOT_FOUND" });
        const item = await getRecordingItemById(input.itemId);
        if (!item || item.clientId !== client.id) throw new TRPCError({ code: "NOT_FOUND" });
        const url = input.url.trim();
        if (url && !/^https?:\/\/\S+$/i.test(url)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Paste a full link starting with https://" });
        }
        const { setRecordingLink, toggleRecordingSection } = await import("./db");
        await setRecordingLink(input.itemId, input.section ?? null, url);
        if (!url) return { ok: true, advanced: false };
        const doc = await getClientDocumentById(item.docId);
        let advanced = false;
        if (input.section) {
          // The link counts as the tick for that video.
          const checkedNow = (item.checkedSections as string[] | null) ?? [];
          const checked = checkedNow.includes(input.section)
            ? checkedNow
            : await toggleRecordingSection(input.itemId, input.section);
          if (doc) {
            const sections = scriptSectionTitles(doc.content);
            if (sections.length > 0 && sections.every((s) => checked.includes(s))) {
              await setRecordingItemRecorded(input.itemId, true);
              await advanceDocAfterRecording(item.docId, doc.status);
              advanced = true;
            }
          }
        } else {
          await setRecordingItemRecorded(input.itemId, true);
          if (doc) {
            await advanceDocAfterRecording(item.docId, doc.status);
            advanced = true;
          }
        }
        return { ok: true, advanced };
      }),

    /** Client ticks one section (one video) inside a multi-part script doc.
     *  Ticking the LAST section completes the item and advances the card. */
    toggleSection: publicProcedure
      .input(z.object({ token: z.string().min(6).max(64), itemId: z.number(), section: z.string().min(1).max(300) }))
      .mutation(async ({ input }) => {
        const client = await getClientByRecordingToken(input.token);
        if (!client) throw new TRPCError({ code: "NOT_FOUND" });
        const item = await getRecordingItemById(input.itemId);
        if (!item || item.clientId !== client.id) throw new TRPCError({ code: "NOT_FOUND" });
        const { toggleRecordingSection } = await import("./db");
        const checked = await toggleRecordingSection(input.itemId, input.section);
        const doc = await getClientDocumentById(item.docId);
        if (doc) {
          const sections = scriptSectionTitles(doc.content);
          if (sections.length > 0 && sections.every((s) => checked.includes(s))) {
            await setRecordingItemRecorded(input.itemId, true);
            await advanceDocAfterRecording(item.docId, doc.status);
          }
        }
        return { checked };
      }),

    markRecorded: publicProcedure
      .input(z.object({ token: z.string().min(6).max(64), itemId: z.number(), recorded: z.boolean() }))
      .mutation(async ({ input }) => {
        const client = await getClientByRecordingToken(input.token);
        if (!client) throw new TRPCError({ code: "NOT_FOUND" });
        const item = await getRecordingItemById(input.itemId);
        if (!item || item.clientId !== client.id) throw new TRPCError({ code: "NOT_FOUND" });
        await setRecordingItemRecorded(input.itemId, input.recorded);
        const doc = await getClientDocumentById(item.docId);
        if (doc && input.recorded) await advanceDocAfterRecording(item.docId, doc.status);
        return { ok: true };
      }),
  }),

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
          // Full analysis view so the shared page renders EXACTLY like the
          // owner's report (voice-of-customer, sentiment, themes, quotes)
          analysis: analysis
            ? {
                painPoints: analysis.painPoints,
                desires: analysis.desires,
                objections: analysis.objections,
                fears: analysis.fears,
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
    /** Quick Stats row: clients, keywords mined, content pieces, trend snapshots. */
    stats: protectedProcedure.query(async ({ ctx }) => {
      const [searches, reports, clientList, snapshotCount] = await Promise.all([
        getMiningSearchesByUser(ctx.user.id),
        getReportsByUser(ctx.user.id),
        getClientsByUser(ctx.user.id),
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
        clients: clientList.length,
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
      const [searches, reports, clientList, searchKeywords] = await Promise.all([
        getMiningSearchesByUser(ctx.user.id),
        getReportsByUser(ctx.user.id),
        getClientsByUser(ctx.user.id),
        getDistinctTrendKeywords(),
      ]);
      const mine = new Set(searches.map((s) => s.keyword.toLowerCase()));
      return {
        createdClient: clientList.length > 0,
        ranFirstSearch: searches.length > 0,
        viewedReport: reports.length > 0,
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
 * Run a section generator with one retry. A single flaky LLM response
 * (malformed JSON, transient error) must never kill the whole report —
 * the section comes back undefined and the user can hit Regenerate.
 */
async function sectionWithRetry<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await fn();
    } catch (err) {
      console.warn(`[${label}] attempt ${attempt} failed:`, err);
    }
  }
  return undefined;
}

/**
 * Generate every report section in parallel from an analysis result.
 * Each section retries once and fails independently — one bad section
 * never blocks the report.
 */
async function generateAllSections(
  keyword: string,
  analysisResult: AnalysisInput | Record<string, unknown>,
  brandVoice?: string,
  competitorUrls?: string[],
  competitorNotes?: string
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
    sectionWithRetry("MarketIntelligence", () => generateDeepMarketIntelligence(keyword, analysis, brandVoice)),
    sectionWithRetry("ViralHooks", () => generateViralHooks(keyword, analysis, brandVoice)),
    sectionWithRetry("AdCopy", () => generateAdCopy(keyword, analysis, brandVoice)),
    sectionWithRetry("SkoolPosts", () => generateSkoolPosts(keyword, analysis, brandVoice)),
    sectionWithRetry("TalkingHeadScripts", () => generateTalkingHeadScripts(keyword, analysis, brandVoice)),
    sectionWithRetry("EmailSequence", () => generateEmailSequence(keyword, analysis, brandVoice)),
    sectionWithRetry("YouTubeIdeas", () => generateYouTubeIdeas(keyword, analysis, brandVoice)),
    sectionWithRetry("CompetitorIntel", () => generateCompetitorIntel(keyword, brandVoice, competitorUrls, competitorNotes)),
  ]);

  // Typed empty fallbacks for the two non-nullable object columns — the UI
  // shows a Regenerate state when a section comes back empty.
  const emptyIntelligence: DeepMarketIntelligence = {
    executiveSummary: "",
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
    keywordIntelligence: { longTailKeywords: [], emotionalKeywords: [], highConvertingPhrases: [], relatedSearches: [], trendingTerms: [] },
  };

  return {
    marketIntelligence: marketIntelligence ?? emptyIntelligence,
    viralHooks: viralHooks ?? [],
    adCopyIdeas: adCopyIdeas ?? [],
    skoolPosts: skoolPosts ?? [],
    talkingHeadScripts: talkingHeadScripts ?? [],
    emailSequence: emailSequence ?? { sequenceName: "", emails: [] },
    youtubeIdeas: youtubeIdeas ?? [],
    competitorIntel: competitorIntel ?? undefined,
  };
}

// ─── Background processing ────────────────────────────────────────────────────

async function processAnalysis(searchId: number, keyword: string, platforms: string[], brandVoice?: string, userId?: number, competitorUrls?: string[], competitorNotes?: string) {
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
    const sections = await generateAllSections(keyword, analysisOutput, brandVoice, competitorUrls, competitorNotes);

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

/** Trend data is stored per keyword; only allow access to keywords the user has actually searched. */
async function assertKeywordBelongsToUser(userId: number, keyword: string) {
  const searches = await getMiningSearchesByUser(userId);
  const mine = new Set(searches.map((s) => s.keyword.toLowerCase()));
  if (!mine.has(keyword.toLowerCase())) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Run a search for this keyword first to track its trends" });
  }
}
