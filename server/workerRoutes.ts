/**
 * HTTP endpoints for the local Mac worker (Client OS engine).
 *
 * The worker polls /api/worker/claim with a Bearer WORKER_SECRET, receives the
 * oldest queued job with everything it needs (client meta, onboarding text,
 * rendered research, client lessons, rejection feedback), runs headless Claude
 * Code with the owner's real agency skills, then posts the four foundation
 * docs back to /api/worker/complete (or /api/worker/fail).
 */
import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";
import {
  claimNextQueuedJob,
  createClientAsset,
  createClientDocument,
  createJob,
  deleteClientDocumentsByTypes,
  deleteUnapprovedClientAssetsByTypes,
  getAllClients,
  getAnalysisResultBySearchId,
  getClientAssetById,
  getClientById,
  getClientAssetsMeta,
  getClientDocumentById,
  getClientDocuments,
  getLatestJobForClient,
  updateClientDocument,
  getRefImageById,
  getRefImagesWithData,
  getReportById,
  getReportBySearchId,
  getSearchesByClient,
  setJobProgress,
  setJobStatus,
  upsertClientDocumentByType,
} from "./db";
import { composeMineRequest, harvestCompetitorSources } from "./competitorSources";
import { normalizeHooks, normalizeInsights } from "@shared/reportContent";
import type { InsightList } from "../drizzle/schema";
import { ON_DEMAND_TYPES, stageAllDocTypes, stageContract, stagePromptSpec, type FunnelType } from "./stages";
import { fetchForeplayWinningAds, fetchForeplayStaticAdInspiration } from "./foreplay";

/** True when the request carries the correct worker bearer token. */
export function isWorkerAuthorized(authHeader: string | undefined, secret: string): boolean {
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}

/** Legacy export kept for the worker-auth test contract. */
export const FOUNDATION_DOC_TITLES: Record<string, string> = stageContract("foundation", "call");

// On-demand single-doc AI jobs (doc_create / doc_edit) borrow the skills and
// frameworks of the engine whose board the document lives on, so the worker
// writes it to the same quality bar as a full batch from that engine.
const DOC_PARENT_STAGE: Record<string, string> = {
  emails_extra: "more_emails",
  skool_extra: "more_skool",
  ad_scripts_extra: "more_scripts",
  lander_extra: "more_landers",
  content_ig_extra: "more_content_ig",
  content_yt_extra: "more_content_yt",
};

/**
 * Build a synthetic single-output stage spec for a doc_create / doc_edit job.
 * Reuses the parent engine's skills + frameworks but narrows the run to ONE
 * document. For an edit, embeds the current document into job.payload.feedback
 * (which buildDocPrompt surfaces as the REVISION FEEDBACK section) and mutates
 * the passed-in job so the shared claim payload picks it up.
 */
async function buildCustomDocSpec(
  job: { id: number; type: string; payload: any },
  funnelType: FunnelType
) {
  const p = (job.payload ?? {}) as {
    docType?: string;
    title?: string;
    instructions?: string;
    feedback?: string;
    docId?: number;
  };
  const isCreate = job.type === "doc_create";
  const targetDocType = String(p.docType || (isCreate ? "emails_extra" : "document"));
  const parent = DOC_PARENT_STAGE[targetDocType] ?? "more_emails";
  const base = stagePromptSpec(parent, funnelType);
  if (!base) return null;
  const title = String(p.title || "Document").slice(0, 300);

  let description: string;
  if (isCreate) {
    description = `Build this document IN FULL, exactly as the operator asks, at the agency's top quality bar for this engine. THE OPERATOR'S REQUEST:\n\n${String(
      p.instructions || ""
    )}\n\nProduce ONE complete, final, client-ready document. It is a SINGLE deliverable: do NOT split it into multiple cards and do NOT emit any <!-- SPLIT --> marker.`;
  } else {
    const current = await getClientDocumentById(Number(p.docId));
    description = `REVISE the existing document supplied in the REVISION FEEDBACK section below. Return the COMPLETE revised document, not a diff or a summary. If the instruction asks to regenerate, redo, refresh or "make it better" without other specifics, produce a genuinely NEW and stronger version (fresh angles, hooks and examples); never echo the current text back. Keep it a SINGLE document with no <!-- SPLIT --> marker.`;
    job.payload = {
      ...p,
      feedback: `OPERATOR INSTRUCTION: ${String(p.feedback || "")}\n\n===== CURRENT DOCUMENT (revise THIS one) =====\n${
        current?.content ?? ""
      }`,
    };
  }

  return {
    ...base,
    label: isCreate ? `Create document: ${title}` : `Revise document: ${title}`,
    outputs: [{ docType: isCreate ? targetDocType : "document", filename: "document.md", title, description }],
  };
}

const insightLines = (list: InsightList | null | undefined, cap: number) =>
  normalizeInsights(list)
    .slice(0, cap)
    .map((i) => `- ${i.text}${i.verbatimExample ? ` (verbatim: "${i.verbatimExample}")` : ""}`)
    .join("\n");

/** Render the client's research as readable text for the worker. A linked
 *  report (chosen at onboarding) wins; otherwise the client's own search. */
async function renderResearchForClient(clientId: number): Promise<string> {
  const client = await getClientById(clientId);
  let searchId: number | null = null;
  let keyword = "";
  let report: Awaited<ReturnType<typeof getReportById>> | undefined;

  if (client?.linkedReportId) {
    report = await getReportById(client.linkedReportId);
    if (report) {
      searchId = report.searchId;
      keyword = report.name;
    }
  }
  if (searchId == null) {
    const searches = await getSearchesByClient(clientId);
    const complete = searches.find((s) => s.status === "complete");
    if (!complete) return "";
    searchId = complete.id;
    keyword = complete.keyword;
    report = await getReportBySearchId(complete.id);
  }

  const analysis = await getAnalysisResultBySearchId(searchId);
  if (!analysis) return "";

  const parts: string[] = [`VOICE MINING RESEARCH for keywords: ${keyword}`];
  parts.push(`\nPAIN POINTS:\n${insightLines(analysis.painPoints, 12)}`);
  parts.push(`\nDESIRES:\n${insightLines(analysis.desires, 12)}`);
  parts.push(`\nFEARS:\n${insightLines(analysis.fears, 8)}`);
  parts.push(`\nOBJECTIONS:\n${insightLines(analysis.objections, 8)}`);
  const strList = (v: unknown, cap: number) =>
    Array.isArray(v) ? (v as string[]).slice(0, cap).map((x) => `- ${x}`).join("\n") : "";
  parts.push(`\nBUYING TRIGGERS:\n${strList(analysis.buyingTriggers, 8)}`);
  parts.push(`\nEMOTIONAL LANGUAGE:\n${strList(analysis.emotionalLanguage, 12)}`);
  parts.push(`\nTRENDING PHRASES:\n${strList(analysis.trendingPhrases, 10)}`);
  const quotes = Array.isArray(analysis.verbatimQuotes)
    ? (analysis.verbatimQuotes as Array<{ text: string; platform?: string }>)
        .slice(0, 12)
        .map((q) => `- "${q.text}"${q.platform ? ` [${q.platform}]` : ""}`)
        .join("\n")
    : "";
  parts.push(`\nVERBATIM QUOTES:\n${quotes}`);

  if (report?.competitorIntel?.competitors?.length) {
    const comp = report.competitorIntel.competitors
      .map((c) => {
        const bits = [
          c.icp ? `targets: ${c.icp}` : "",
          `angle: ${c.angles?.length ? c.angles.join("; ") : c.angle}`,
          c.sells?.length ? `sells: ${c.sells.join("; ")}` : c.offer ? `sells: ${c.offer}` : "",
          c.doingWell?.length ? `doing well: ${c.doingWell.join("; ")}` : "",
          `weak: ${c.notDoingWell?.length ? c.notDoingWell.join("; ") : c.weakness}`,
          `gap: ${c.gap}`,
        ].filter(Boolean);
        return `- ${c.name}: ${bits.join(" | ")}`;
      })
      .join("\n");
    parts.push(`\nCOMPETITOR INTEL (use for positioning, offer differentiation, and ICP contrast):\n${comp}`);
    const gapLines = report.competitorIntel.gapPlan?.length
      ? report.competitorIntel.gapPlan.map((g) => `- ${g.gap} -> move: ${g.action}`)
      : (report.competitorIntel.marketGaps ?? []).map((g) => `- ${g}`);
    if (gapLines.length) {
      parts.push(`\nMARKET GAPS + MOVES:\n${gapLines.join("\n")}`);
    }
  }

  return parts.join("\n");
}

/**
 * The research report's GENERATED content assets: hooks, scripts, posts, and
 * emails already written FOR this market with the agency frameworks. Engines
 * repackage and extend these instead of starting cold.
 */
async function renderContentAssetsForClient(clientId: number): Promise<string> {
  const searches = await getSearchesByClient(clientId);
  const complete = searches.find((s) => s.status === "complete");
  if (!complete) return "";
  const report = await getReportBySearchId(complete.id);
  if (!report) return "";

  const parts: string[] = [];

  const hooks = normalizeHooks(report.viralHooks as never).slice(0, 25);
  if (hooks.length) {
    parts.push(
      `## VIRAL HOOK BANK (proven for THIS market: use them, adapt them, extend the patterns)\n${hooks
        .map((h) => `- [${h.category} / ${h.hookType}] ${h.hook} (why it works: ${h.whyThisWorks})`)
        .join("\n")}`
    );
  }

  const ths = ((report.talkingHeadScripts as unknown as Array<Record<string, string>>) ?? []).slice(0, 10);
  if (ths.length) {
    parts.push(
      `## TALKING-HEAD SCRIPTS (the house short-form structure: pattern interrupt, hook, mind-read, twist tease, CTA before payoff, payoff, closing CTA with comment keyword. THIS IS THE FLOOR for any short-form content: match the structure, beat the execution)\n${ths
        .map(
          (t, i) =>
            `### ${i + 1}. ${t.title}\n${t.patternInterrupt ? `Pattern interrupt: ${t.patternInterrupt}\n` : ""}Hook: ${t.hook}\nMind-read: ${t.mindRead}\nTwist tease: ${t.twistTease}\nCTA before payoff: ${t.ctaBeforePayoff}\nPayoff: ${t.payoff}\nClosing CTA: ${t.closingCta} (comment keyword: ${t.commentKeyword})`
        )
        .join("\n\n")}`
    );
  }

  const yts = ((report.youtubeIdeas as unknown as Array<Record<string, unknown>>) ?? []).slice(0, 8);
  if (yts.length) {
    parts.push(
      `## YOUTUBE PACKAGING (outlier-modeled titles and hooks for this niche)\n${yts
        .map((y) => {
          const bullets = Array.isArray(y.contentBullets) ? ` | covers: ${(y.contentBullets as string[]).join("; ")}` : "";
          return `- ${y.title}${y.basedOn ? ` (modeled on: ${y.basedOn})` : ""}${y.hook ? `\n  Hook: ${y.hook}` : ""}${bullets}`;
        })
        .join("\n")}`
    );
  }

  const skool = ((report.skoolPosts as unknown as Array<Record<string, unknown>>) ?? []).slice(0, 8);
  if (skool.length) {
    parts.push(
      `## SKOOL POSTS (proven post copy + DM workflows for this market)\n${skool
        .map((p, i) => {
          const dm = Array.isArray(p.dmWorkflow)
            ? (p.dmWorkflow as Array<Record<string, string>>).map((m) => m.message ?? m.text ?? "").filter(Boolean).slice(0, 3).join(" -> ")
            : "";
          return `### ${i + 1}. [${p.postType}]${p.commentKeyword ? ` keyword: ${p.commentKeyword}` : ""}\n${p.postCopy}${dm ? `\nDM flow: ${dm}` : ""}`;
        })
        .join("\n\n")}`
    );
  }

  const seq = report.emailSequence as unknown as { sequenceName?: string; emails?: Array<Record<string, unknown>> } | null;
  if (seq?.emails?.length) {
    parts.push(
      `## EMAIL SEQUENCE BASELINE (${seq.sequenceName ?? "sequence"}: proven subjects and arcs for this market)\n${seq.emails
        .slice(0, 14)
        .map((e) => `- Day ${e.dayNumber}: "${e.subject}" (preview: ${e.previewText})`)
        .join("\n")}`
    );
  }

  const ads = ((report.adCopyIdeas as unknown as Array<Record<string, unknown>>) ?? []).slice(0, 8);
  if (ads.length) {
    parts.push(
      `## AD COPY IDEAS (proven angles and headlines for this market)\n${ads
        .map((a) => `- [${a.awarenessLevel}] ${a.headline}: ${String(a.body ?? "").slice(0, 200)} (CTA: ${a.cta})`)
        .join("\n")}`
    );
  }

  return parts.join("\n\n");
}

export function registerWorkerRoutes(app: Express) {
  const guard = (req: Request, res: Response): boolean => {
    if (!isWorkerAuthorized(req.headers.authorization, ENV.workerSecret)) {
      res.status(403).json({ error: "forbidden" });
      return false;
    }
    return true;
  };

  app.post("/api/worker/claim", async (req: Request, res: Response) => {
    if (!guard(req, res)) return;
    try {
      const job = await claimNextQueuedJob();
      if (!job) return res.json({ job: null });

      const client = await getClientById(job.clientId);
      if (!client) {
        await setJobStatus(job.id, "failed", "Client not found");
        return res.json({ job: null });
      }

      // Drive export: not a Claude job. Ship the approved images; the worker
      // resolves the client's Drive folder and copies them in.
      if (job.type === "export_drive") {
        const approved = (await getClientAssetsMeta(job.clientId)).filter((a) => a.status === "approved");
        const images = await Promise.all(
          approved.map(async (a) => {
            const full = await getClientAssetById(a.id);
            return full && /^image\//.test(full.mime)
              ? { filename: full.filename, mime: full.mime, base64: full.data }
              : null;
          })
        );
        return res.json({
          job: {
            id: job.id,
            type: "export_drive",
            client: { name: client.name },
            exportImages: images.filter(Boolean),
          },
        });
      }

      const spec =
        job.type === "doc_create" || job.type === "doc_edit"
          ? await buildCustomDocSpec(job, client.funnelType as FunnelType)
          : stagePromptSpec(job.type, client.funnelType as FunnelType);
      if (!spec) {
        await setJobStatus(job.id, "failed", `Unknown job type: ${job.type}`);
        return res.json({ job: null });
      }

      const docs = await getClientDocuments(job.clientId);
      const onboardingDocs = docs
        .filter((d) => d.kind === "onboarding")
        .map((d) => ({ title: d.title, docType: d.docType, content: d.content }));
      const lessons = docs.filter((d) => d.kind === "lesson").map((d) => d.content);
      // Approved artefacts from earlier stages: the mother skill's rule is
      // "pass full documents, never summaries", so later stages get everything.
      const approvedDocs =
        job.type === "foundation"
          ? []
          : docs
              .filter((d) => (d.kind === "foundation" || d.kind === "deliverable") && d.docType !== "client_links")
              .map((d) => ({ title: d.title, docType: d.docType, content: d.content }));
      let research = await renderResearchForClient(job.clientId);
      // Ads stage: attach live Foreplay winners for the niche as pattern
      // models (angles and hooks, never words to copy), plus the operator's
      // per-ad verdicts from the previous batch (the calibration loop).
      const isEngineJob = job.type === "ads" || (ON_DEMAND_TYPES as readonly string[]).includes(job.type);
      if (isEngineJob) {
        const contentAssets = await renderContentAssetsForClient(job.clientId).catch(() => "");
        if (contentAssets) {
          research = `${research}\n\n# PROVEN CONTENT ASSETS FROM THE RESEARCH REPORT (already written FOR this market with the agency frameworks. This is your FLOOR: repackage, extend, and beat it. Match its voice and hook patterns; never contradict it)\n\n${contentAssets}`;
        }
      }
      let assetReviews: Array<{ filename: string; status: string; feedback: string | null }> = [];
      let refImages: Array<{ filename: string; mime: string; note: string | null; base64: string }> = [];
      if (job.type === "ads" || job.type === "more_statics" || job.type === "more_scripts") {
        const foreplay = await fetchForeplayWinningAds(client.niche).catch(() => "");
        if (foreplay) {
          research = `${research}\n\n# FOREPLAY WINNING ADS IN THIS NICHE (live, longest-running: proven spenders. Model the angles and proof types, never copy the words)\n\n${foreplay}`;
        }
        // Statics jobs additionally get the winning IMAGE creatives with URLs:
        // live design references the render session views and can clone.
        if (job.type === "ads" || job.type === "more_statics") {
          const foreplayStatics = await fetchForeplayStaticAdInspiration(client.niche).catch(() => "");
          if (foreplayStatics) {
            research = `${research}\n\n# FOREPLAY WINNING STATIC ADS IN THIS NICHE (live image creatives. VIEW each IMAGE url to study layout and composition; any may serve as a batch reference per the static-render-rules clone doctrine. Never copy their words)\n\n${foreplayStatics}`;
          }
        }
        assetReviews = (await getClientAssetsMeta(job.clientId))
          .filter((a) => a.status !== "pending")
          .map((a) => ({ filename: a.filename, status: a.status, feedback: a.feedback }));
        // Operator-uploaded proof/cutout images the render session composites in
        refImages = (await getRefImagesWithData(job.clientId)).map((r) => ({
          filename: r.filename,
          mime: r.mime,
          note: r.note,
          base64: r.data,
        }));
      }

      res.json({
        job: {
          id: job.id,
          type: job.type,
          stage: spec,
          client: {
            name: client.name,
            niche: client.niche,
            funnelType: client.funnelType,
            pricePoint: client.pricePoint ?? "",
          },
          onboardingDocs,
          approvedDocs,
          research,
          lessons,
          feedback: job.payload?.feedback ?? "",
          assetReviews,
          refImages,
        },
      });
    } catch (err) {
      console.error("[worker/claim]", err);
      res.status(500).json({ error: "claim failed" });
    }
  });

  app.post("/api/worker/complete", async (req: Request, res: Response) => {
    if (!guard(req, res)) return;
    try {
      const { jobId, docs, clientLessons, assets } = req.body as {
        jobId: number;
        docs: Record<string, string>;
        clientLessons?: string[];
        /** Rendered binaries (static ad PNGs): base64, keyed to a docType. */
        assets?: Array<{ docType: string; filename: string; mime?: string; base64: string }>;
      };
      if (!jobId || !docs) return res.status(400).json({ error: "jobId and docs required" });

      const job = await (await import("./db")).getJobById(jobId);
      if (!job) return res.status(404).json({ error: "job not found" });
      const client = await getClientById(job.clientId);
      if (!client) return res.status(404).json({ error: "client not found" });

      // On-demand single-doc AI jobs: write the ONE document straight to its
      // card (create -> new draft, edit -> overwrite in place). No stage contract.
      if (job.type === "doc_create" || job.type === "doc_edit") {
        const p = (job.payload ?? {}) as { docType?: string; title?: string; docId?: number };
        const key = job.type === "doc_create" ? String(p.docType) : "document";
        let content = (docs[key] ?? Object.values(docs)[0] ?? "").trim();
        content = content.replace(/<!--\s*SPLIT\s*-->/g, "").trim();
        if (content.length < 50) {
          await setJobStatus(jobId, "failed", "Worker returned an empty document");
          return res.status(400).json({ error: "empty document" });
        }
        if (job.type === "doc_create") {
          await createClientDocument({
            clientId: job.clientId,
            kind: "deliverable",
            docType: String(p.docType),
            title: String(p.title || "Document").slice(0, 300),
            content,
            status: "draft",
          });
        } else {
          await updateClientDocument(Number(p.docId), content);
        }
        for (const lesson of clientLessons ?? []) {
          if (lesson.trim().length > 5) {
            await createClientDocument({
              clientId: job.clientId,
              kind: "lesson",
              docType: "note",
              title: "Client lesson",
              content: lesson.trim(),
            });
          }
        }
        await setJobStatus(jobId, "approved");
        return res.json({ ok: true });
      }

      // Contract comes from the server-side stage registry, never the worker
      const contract = stageContract(job.type, client.funnelType as FunnelType);
      if (!Object.keys(contract).length) {
        return res.status(400).json({ error: `unknown job type: ${job.type}` });
      }
      const kind = job.type === "foundation" ? ("foundation" as const) : ("deliverable" as const);
      for (const [docType, title] of Object.entries(contract)) {
        const content = docs[docType];
        if (!content || content.trim().length < 50) {
          await setJobStatus(jobId, "failed", `Worker returned empty or too-short doc: ${docType}`);
          return res.status(400).json({ error: `missing doc: ${docType}` });
        }
        // Engine batches split into ONE document per piece (reel, script,
        // email, post): each lands on the kanban as its own card. Units are
        // separated by an <!-- SPLIT --> line; title comes from the unit's
        // first heading. Stage docs keep upsert-by-type semantics.
        if (docType.endsWith("_extra") && content.includes("<!-- SPLIT -->")) {
          const units = content
            .split(/<!--\s*SPLIT\s*-->/)
            .map((u) => u.trim())
            .filter((u) => u.length > 40);
          for (const unit of units) {
            const heading = unit.match(/^#\s+(.+)$/m)?.[1]?.trim();
            await createClientDocument({
              clientId: job.clientId,
              kind,
              docType,
              title: (heading || title).slice(0, 300),
              content: unit,
            });
          }
        } else {
          await upsertClientDocumentByType(job.clientId, kind, docType, title, content.trim());
        }
      }

      // Sweep stale docs whose docType left this stage's contract (contract
      // changes or funnel-type switches otherwise leave orphans in review)
      const stale = stageAllDocTypes(job.type).filter((t) => !(t in contract));
      await deleteClientDocumentsByTypes(job.clientId, stale);

      // Rendered assets: sweep only the NON-approved assets for this stage's
      // docTypes (approved ads persist forever: the accumulating ad library),
      // then store the new set. An incoming filename that already exists as
      // an approved asset is skipped: the blessed original stays canonical.
      if (assets?.length) {
        const prevApproved = new Set(
          (await getClientAssetsMeta(job.clientId))
            .filter((p) => p.status === "approved")
            .map((p) => p.filename)
        );
        await deleteUnapprovedClientAssetsByTypes(job.clientId, stageAllDocTypes(job.type));
        for (const a of assets) {
          if (!a.filename || !a.base64 || !(a.docType in contract)) continue;
          const filename = a.filename.slice(0, 300);
          if (prevApproved.has(filename)) continue;
          await createClientAsset({
            clientId: job.clientId,
            jobId,
            docType: a.docType,
            filename,
            mime: a.mime?.slice(0, 100) || "image/png",
            data: a.base64,
          });
        }
      }

      for (const lesson of clientLessons ?? []) {
        if (lesson.trim().length > 5) {
          await createClientDocument({
            clientId: job.clientId,
            kind: "lesson",
            docType: "note",
            title: "Client lesson",
            content: lesson.trim(),
          });
        }
      }

      const isOnDemand = (ON_DEMAND_TYPES as readonly string[]).includes(job.type);
      await setJobStatus(jobId, isOnDemand ? "approved" : "review");
      res.json({ ok: true });
    } catch (err) {
      console.error("[worker/complete]", err);
      res.status(500).json({ error: "complete failed" });
    }
  });

  // Live progress line from the worker while a job runs ("building ad 8 of 15").
  app.post("/api/worker/progress", async (req: Request, res: Response) => {
    if (!guard(req, res)) return;
    try {
      const { jobId, progress } = req.body as { jobId: number; progress: string };
      if (!jobId || typeof progress !== "string") {
        return res.status(400).json({ error: "jobId and progress required" });
      }
      await setJobProgress(jobId, progress);
      res.json({ ok: true });
    } catch (err) {
      console.error("[worker/progress]", err);
      res.status(500).json({ error: "progress failed" });
    }
  });

  // Serve a rendered asset to the logged-in owner (img src="/api/assets/:id").
  app.get("/api/assets/:id", async (req: Request, res: Response) => {
    try {
      const { authenticateRequest } = await import("./_core/auth");
      const user = await authenticateRequest(req).catch(() => null);
      if (!user) return res.status(401).json({ error: "unauthorized" });
      const asset = await getClientAssetById(Number(req.params.id));
      if (!asset) return res.status(404).json({ error: "not found" });
      const client = await getClientById(asset.clientId);
      if (!client || client.userId !== user.id) return res.status(404).json({ error: "not found" });
      res.setHeader("Content-Type", asset.mime);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(Buffer.from(asset.data, "base64"));
    } catch (err) {
      console.error("[assets/get]", err);
      res.status(500).json({ error: "asset fetch failed" });
    }
  });

  // Operator-uploaded reference image bytes (owner-only), for UI thumbnails.
  app.get("/api/refimages/:id", async (req: Request, res: Response) => {
    try {
      const { authenticateRequest } = await import("./_core/auth");
      const user = await authenticateRequest(req).catch(() => null);
      if (!user) return res.status(401).json({ error: "unauthorized" });
      const img = await getRefImageById(Number(req.params.id));
      if (!img) return res.status(404).json({ error: "not found" });
      const client = await getClientById(img.clientId);
      if (!client || client.userId !== user.id) return res.status(404).json({ error: "not found" });
      res.setHeader("Content-Type", img.mime);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(Buffer.from(img.data, "base64"));
    } catch (err) {
      console.error("[refimages/get]", err);
      res.status(500).json({ error: "ref image fetch failed" });
    }
  });

  app.post("/api/worker/fail", async (req: Request, res: Response) => {
    if (!guard(req, res)) return;
    try {
      const { jobId, error } = req.body as { jobId: number; error: string };
      if (!jobId) return res.status(400).json({ error: "jobId required" });
      await setJobStatus(jobId, "failed", (error ?? "Unknown worker error").slice(0, 2000));
      res.json({ ok: true });
    } catch (err) {
      console.error("[worker/fail]", err);
      res.status(500).json({ error: "fail failed" });
    }
  });

  // Drive export finished: mark approved on success, failed on error.
  app.post("/api/worker/export-done", async (req: Request, res: Response) => {
    if (!guard(req, res)) return;
    try {
      const { jobId, ok, count, path, error } = req.body as {
        jobId: number;
        ok: boolean;
        count?: number;
        path?: string;
        error?: string;
      };
      if (!jobId) return res.status(400).json({ error: "jobId required" });
      if (ok) await setJobStatus(jobId, "approved", `Exported ${count ?? 0} ads -> ${path ?? "Drive"}`.slice(0, 500));
      else await setJobStatus(jobId, "failed", (error ?? "Export failed").slice(0, 2000));
      res.json({ ok: true });
    } catch (err) {
      console.error("[worker/export-done]", err);
      res.status(500).json({ error: "export-done failed" });
    }
  });

  /**
   * Auto-refresh mining: the worker pings this a few times a day. For every
   * client whose desk was mined at least once but whose freshest intel is
   * older than 3 days, queue a new deep-mine job (roughly 2x/week per client).
   * Never first-runs a client — the operator kicks off the first mine.
   */
  app.post("/api/worker/auto-intel", async (req: Request, res: Response) => {
    if (!guard(req, res)) return;
    try {
      const STALE_MS = 3 * 24 * 60 * 60 * 1000;
      const queued: number[] = [];
      for (const client of await getAllClients()) {
        const docs = await getClientDocuments(client.id);
        const intelDocs = docs.filter((d) => d.docType === "content_intel_extra");
        if (!intelDocs.length) continue; // never auto-run before the operator's first mine
        const freshest = Math.max(...intelDocs.map((d) => new Date(d.updatedAt).getTime()));
        if (Date.now() - freshest < STALE_MS) continue;
        const active = await getLatestJobForClient(client.id, "content_intel");
        if (active && (active.status === "queued" || active.status === "running")) continue;
        const searches = await getSearchesByClient(client.id);
        const completeSearch = searches.find((sr) => sr.status === "complete");
        const report = completeSearch ? await getReportBySearchId(completeSearch.id) : null;
        const sources = harvestCompetitorSources({
          researchUrls: searches.flatMap((sr) => (sr.competitorUrls as string[] | null) ?? []),
          researchText: report ? JSON.stringify(report) : undefined,
          onboardingTexts: docs.filter((d) => d.kind === "onboarding").map((d) => d.content),
        });
        const jobId = await createJob({
          clientId: client.id,
          userId: client.userId,
          type: "content_intel",
          status: "queued",
          payload: { feedback: composeMineRequest(sources) },
        });
        queued.push(jobId);
        console.log(`[worker/auto-intel] queued refresh mine for client ${client.id} (${client.name}), job ${jobId}`);
      }
      res.json({ ok: true, queued });
    } catch (err) {
      console.error("[worker/auto-intel]", err);
      res.status(500).json({ error: "auto-intel failed" });
    }
  });
}
