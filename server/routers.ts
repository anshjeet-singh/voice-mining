import { COOKIE_NAME } from "@shared/const";
import { invokeLLM } from "./_core/llm";
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
  getTrendSnapshotCount,
  getVaultCollectionsByUser,
  getVaultItemCount,
  getVaultItemsByUser,
  logActivity,
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
            // Studio is the home once the build shipped ad creatives
            studioReady: docs.some((d) => ["ad_scripts", "ad_statics"].includes(d.docType)),
          };
        })
      );
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const client = await requireClient(input.id, ctx.user.id);
        const allJobTypes = [...STAGE_ORDER, ...ON_DEMAND_TYPES];
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
        await requireClient(asset.clientId, ctx.user.id);
        await reviewClientAsset(
          input.assetId,
          input.action === "approve" ? "approved" : "rejected",
          input.feedback?.trim() || null
        );
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
     * Focused AI edit of ONE document. Rewrites just this doc with the operator's
     * feedback via the server LLM (fast, cheap, reliable) and saves it — never
     * touches the heavy worker pipeline or any other document.
     */
    aiEditDocument: protectedProcedure
      .input(z.object({ id: z.number(), feedback: z.string().min(1).max(10000) }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getClientDocumentById(input.id);
        if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
        await requireClient(doc.clientId, ctx.user.id);
        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "You are an elite direct-response copywriter editing ONE marketing document for an agency. Rewrite the FULL document applying the operator's feedback precisely. Keep the same overall structure, section headings and markdown formatting UNLESS the feedback explicitly asks to change them. Preserve every [PLACEHOLDER] token exactly as written. Keep the copy vibrant, high-energy and benefit-driven, never flatten it. Do NOT use em dashes anywhere. Output ONLY the complete rewritten document in markdown, with no preamble, no commentary and no surrounding code fences.",
            },
            {
              role: "user",
              content: `OPERATOR FEEDBACK (apply this to the document):\n${input.feedback}\n\nCURRENT DOCUMENT:\n${doc.content}`,
            },
          ],
          maxTokens: 8192,
        });
        let out = (result.choices[0]?.message?.content ?? "").trim();
        const fence = out.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/);
        if (fence) out = fence[1].trim();
        if (out.length < 50) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The AI returned an empty rewrite. Try again." });
        }
        await updateClientDocument(input.id, out);
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

    /** Move a deliverable through the kanban: draft -> approved -> posted -> archived. */
    setDocumentStatus: protectedProcedure
      .input(z.object({ id: z.number(), status: z.enum(["draft", "approved", "posted", "archived"]) }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getClientDocumentById(input.id);
        if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
        await requireClient(doc.clientId, ctx.user.id);
        await setClientDocumentStatus(input.id, input.status);
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
