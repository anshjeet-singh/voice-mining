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
  stampJobHeartbeat,
  reapStaleJobs,
  setAssetSpec,
} from "./db";
import { formatMarketTruth, formatReferencePerformance, parseAdSpecs } from "./adPerformance";
import { composeMineRequest, harvestCompetitorSources } from "./competitorSources";
import { normalizeHooks, normalizeInsights } from "@shared/reportContent";
import type { InsightList } from "../drizzle/schema";
import { ON_DEMAND_TYPES, STAGES, stageAllDocTypes, stageContract, stagePromptSpec, type FunnelType } from "./stages";
import { serveCreativeIntel, refreshLibrary } from "./creativeLibrary";

/** True when the request carries the correct worker bearer token. */
export function isWorkerAuthorized(authHeader: string | undefined, secret: string): boolean {
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}

/** Legacy export kept for the worker-auth test contract. */
export const FOUNDATION_DOC_TITLES: Record<string, string> = stageContract("foundation", "call");

/** When the Mac worker last polled: drives the online/offline chip in the app. */
let workerLastSeenAt: number | null = null;
let lastReapAt = 0;
export function getWorkerLastSeenAt(): number | null {
  return workerLastSeenAt;
}

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

  // TRENDING THIS WEEK: the weekly trend cron already produces this data for
  // the client's keywords; feeding it here means month-3 batches hook into
  // this week's conversations, not month-0's.
  try {
    const { getLatestTrendSnapshot } = await import("./db");
    for (const kw of keyword.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 3)) {
      const snap = await getLatestTrendSnapshot(kw);
      if (!snap) continue;
      const topics = (snap.trendingTopics ?? [])
        .slice(0, 6)
        .map((t) => `- ${t.name} (${t.momentum}, ${t.score}/100): ${t.description}`)
        .join("\n");
      const phrases = (snap.trendingPhrases ?? []).slice(0, 10).map((p) => `- ${p}`).join("\n");
      const questions = (snap.emergingQuestions ?? []).slice(0, 8).map((q) => `- ${q}`).join("\n");
      parts.push(
        `\nTRENDING THIS WEEK (${snap.snapshotDate}, keyword "${kw}" — hooks and angles should ride what the market is talking about NOW):\nTOPICS:\n${topics}\nPHRASES:\n${phrases}\nQUESTIONS PEOPLE ARE ASKING:\n${questions}`
      );
      break;
    }
  } catch {
    /* trends are a bonus, never a blocker */
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
      workerLastSeenAt = Date.now();
      // Reaper rides the claim poll, throttled: a running job whose worker
      // went silent (Mac asleep, session killed) requeues instead of
      // stranding the queue forever.
      if (Date.now() - lastReapAt > 60_000) {
        lastReapAt = Date.now();
        reapStaleJobs().catch(() => {});
      }
      const job = await claimNextQueuedJob();
      if (!job) return res.json({ job: null });

      const client = await getClientById(job.clientId);
      if (!client) {
        await setJobStatus(job.id, "failed", "Client not found");
        return res.json({ job: null });
      }

      // Drive export: not a Claude job. Ship the approved images WITH their
      // Meta upload copy; the worker resolves the client's Drive folder,
      // copies the PNGs in, and writes the ready-to-upload copy sheet.
      if (job.type === "export_drive") {
        const approved = (await getClientAssetsMeta(job.clientId)).filter((a) => a.status === "approved");
        const images = await Promise.all(
          approved.map(async (a) => {
            const full = await getClientAssetById(a.id);
            return full && /^image\//.test(full.mime)
              ? {
                  filename: full.filename,
                  mime: full.mime,
                  base64: full.data,
                  copyPrimary: a.copyPrimary ?? "",
                  copyHeadline: a.copyHeadline ?? "",
                  copyDescription: a.copyDescription ?? "",
                }
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
              .filter((d) => (d.kind === "foundation" || d.kind === "deliverable") && !["client_links", "client_facts", "weekly_report"].includes(d.docType))
              .map((d) => ({ title: d.title, docType: d.docType, content: d.content }));

      // CLIENT FACTS: the operator's canonical links/names + current-state
      // notes. Every job gets them as ground truth that OVERRIDES older docs
      // (the free community may have shipped under a different name than the
      // day-one Skool doc invented; engines must use what exists TODAY).
      let clientFacts = "";
      {
        const linksDoc = docs.find((d) => d.docType === "client_links");
        const factsDoc = docs.find((d) => d.docType === "client_facts");
        const bits: string[] = [];
        if (linksDoc) {
          try {
            const links = JSON.parse(linksDoc.content) as Record<string, string>;
            const lines = Object.entries(links)
              .filter(([, v]) => v?.trim())
              .map(([k, v]) => `- ${k} = ${v}`);
            if (lines.length) bits.push(`Canonical links and names (use these REAL values; keep other [TOKEN]s as placeholders):\n${lines.join("\n")}`);
          } catch {
            /* malformed links doc: skip */
          }
        }
        if (factsDoc?.content.trim()) {
          bits.push(`Current state, straight from the operator (what actually exists today; overrides any conflicting name, asset, or claim in the docs below):\n${factsDoc.content.trim()}`);
        }
        clientFacts = bits.join("\n\n");
      }
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
        // The compounding creative library: refresh from Foreplay, then serve
        // ranked winners this client has NOT seen recently (no more repeats).
        const intel = await serveCreativeIntel(client.niche, job.clientId).catch(() => ({ adsBlob: "", staticsBlob: "", libraryCount: 0 }));
        if (intel.adsBlob) {
          research = `${research}\n\n# FOREPLAY WINNING ADS IN THIS NICHE (from our accumulated winners library of ${intel.libraryCount} tracked ads — longest-running live spenders ranked first, rotated so you get references previous batches did not. Model the angles and proof types, never copy the words)\n\n${intel.adsBlob}`;
        }
        // Statics jobs additionally get the winning IMAGE creatives with URLs:
        // live design references the render session views and can clone.
        if ((job.type === "ads" || job.type === "more_statics") && intel.staticsBlob) {
          research = `${research}\n\n# FOREPLAY WINNING STATIC ADS IN THIS NICHE (live image creatives from the winners library. VIEW each IMAGE url to study layout and composition; any may serve as a batch reference per the static-render-rules clone doctrine. Never copy their words)\n\n${intel.staticsBlob}`;
        }
        const allAssets = await getClientAssetsMeta(job.clientId);
        assetReviews = allAssets
          .filter((a) => a.status !== "pending")
          .map((a) => ({ filename: a.filename, status: a.status, feedback: a.feedback }));
        // MARKET TRUTH: real Meta spend results imported by the operator.
        // Outranks operator taste AND generator instinct: what actually
        // converted, with each winner's DNA, best CTR first.
        const marketTruth = formatMarketTruth(allAssets);
        if (marketTruth) {
          research = `${research}\n\n# MARKET TRUTH: REAL META RESULTS FOR THIS CLIENT'S SHIPPED ADS (imported from Ads Manager. This is the highest authority in this prompt: it outranks the operator verdicts and every pattern model. Study what the winners share — format, hook, awareness, avatar — and bias the new batch toward that DNA; treat the losers' DNA as anti-patterns. PROVEN WINNERS ARE FIRST-CLASS REFERENCES: for any ad listed here with above-average CTR, you may VIEW its PNG from the client's Drive ads folder and clone it directly, declaring 'Reference: winner — <filename>')\n\n${marketTruth}`;
        }
        // Which catalog references actually produce winners for THIS client
        const refPerf = formatReferencePerformance(allAssets);
        if (refPerf && (job.type === "ads" || job.type === "more_statics")) {
          research = `${research}\n\n# REFERENCE PERFORMANCE (the catalog references behind this client's shipped ads, ranked by REAL average CTR. Lean on winner-backed references; treat underperformers as radioactive)\n\n${refPerf}`;
        }
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
          clientFacts,
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
        assets?: Array<{ docType: string; filename: string; mime?: string; base64: string; qaScore?: number; qaNote?: string }>;
      };
      if (!jobId || !docs) return res.status(400).json({ error: "jobId and docs required" });

      const job = await (await import("./db")).getJobById(jobId);
      if (!job) return res.status(404).json({ error: "job not found" });
      // Idempotent: a retried complete (worker spool replay after a network
      // blip) must not double-write or flip an already-reviewed job.
      if (job.status === "review" || job.status === "approved") {
        return res.json({ ok: true, alreadyComplete: true });
      }
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
      // TWO-PHASE: validate the WHOLE contract before writing anything. The
      // old in-loop validation could overwrite docs 1..N-1 and then reject on
      // doc N, leaving the client half-updated with the PNGs discarded.
      for (const docType of Object.keys(contract)) {
        const content = docs[docType];
        if (!content || content.trim().length < 50) {
          await setJobStatus(jobId, "failed", `Worker returned empty or too-short doc: ${docType}`);
          return res.status(400).json({ error: `missing doc: ${docType}` });
        }
      }
      for (const [docType, title] of Object.entries(contract)) {
        const content = docs[docType]!;
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
        const createdIds: Record<string, number> = {};
        for (const a of assets) {
          if (!a.filename || !a.base64 || !(a.docType in contract)) continue;
          const filename = a.filename.slice(0, 300);
          if (prevApproved.has(filename)) continue;
          createdIds[filename] = await createClientAsset({
            clientId: job.clientId,
            jobId,
            docType: a.docType,
            filename,
            mime: a.mime?.slice(0, 100) || "image/png",
            data: a.base64,
            qaScore: typeof a.qaScore === "number" ? Math.round(a.qaScore) : undefined,
            qaNote: a.qaNote?.slice(0, 500),
          });
        }
        // Parse each ad's DNA (format/reference/avatar/angle/awareness/hook)
        // out of the batch doc's spec blocks into structured columns — the
        // schema the market-truth analysis and QA backtest sit on.
        const specSource = Object.keys(contract)
          .filter((t) => t.startsWith("ad_statics"))
          .map((t) => docs[t] ?? "")
          .join("\n\n");
        if (specSource) {
          const specs = parseAdSpecs(specSource, Object.keys(createdIds));
          for (const [filename, spec] of Object.entries(specs)) {
            await setAssetSpec(createdIds[filename], spec).catch(() => {});
          }
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
      await stampJobHeartbeat(jobId).catch(() => {});
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
      // A late/spurious fail (e.g. after a complete already landed via the
      // spool replay) must never yank a finished job back to failed.
      const job = await (await import("./db")).getJobById(jobId);
      if (job && (job.status === "review" || job.status === "approved")) {
        return res.json({ ok: true, ignored: "job already completed" });
      }
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
      // Constant research: every 6h ping also folds fresh Foreplay winners
      // into the creative library for every client niche (cheap API calls,
      // no Claude sessions) — the library compounds even between ad batches.
      const niches = Array.from(new Set((await getAllClients()).map((c) => c.niche.split(",")[0]?.trim()).filter(Boolean)));
      for (const niche of niches) {
        refreshLibrary(niche)
          .then((n) => n && console.log(`[creative-library] "${niche}": folded in ${n} ads`))
          .catch(() => {});
      }
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

  // Morning digest: what needs the operator TODAY. The worker pings this once
  // a day; the digest goes out via notifyOwner (webhook or server log) and
  // closes the worker-finishes-at-2am / operator-reviews-at-9am gap.
  app.post("/api/worker/daily-digest", async (req: Request, res: Response) => {
    if (!guard(req, res)) return;
    try {
      const { getRecentJobs } = await import("./db");
      const { notifyOwner } = await import("./_core/notification");
      const clients = await getAllClients();
      const names = new Map(clients.map((c) => [c.id, c.name]));
      const jobs = await getRecentJobs(7);
      const lines: string[] = [];

      const inReview = jobs.filter((j) => j.status === "review");
      if (inReview.length) {
        lines.push("NEEDS YOUR REVIEW:");
        for (const j of inReview) {
          const hrs = Math.round((Date.now() - new Date(j.finishedAt ?? j.createdAt).getTime()) / 3600000);
          lines.push(`- ${names.get(j.clientId) ?? j.clientId}: ${j.type} (waiting ${hrs}h)`);
        }
      }
      for (const c of clients) {
        const pending = (await getClientAssetsMeta(c.id)).filter((a) => a.status === "pending").length;
        if (pending) lines.push(`- ${c.name}: ${pending} ads awaiting verdicts`);
      }
      const failed = jobs.filter((j) => j.status === "failed" && Date.now() - new Date(j.createdAt).getTime() < 26 * 3600000);
      if (failed.length) {
        lines.push("FAILED (last 24h):");
        for (const j of failed) lines.push(`- ${names.get(j.clientId) ?? j.clientId}: ${j.type} — ${(j.error ?? "no error recorded").slice(0, 120)}`);
      }
      // Research staleness: month-3 copy written from month-0 language
      for (const c of clients) {
        const searches = await getSearchesByClient(c.id);
        const complete = searches.find((s) => s.status === "complete");
        if (complete && Date.now() - new Date(complete.createdAt).getTime() > 30 * 24 * 3600000 && !c.linkedReportId) {
          lines.push(`- ${c.name}: research is ${Math.round((Date.now() - new Date(complete.createdAt).getTime()) / (24 * 3600000))} days old — re-run or link a fresh report`);
        }
      }

      const content = lines.length ? lines.join("\n") : "All clear: nothing waiting on you.";
      await notifyOwner({ title: "Cashflow Coaches — morning digest", content });
      res.json({ ok: true, lines: lines.length });
    } catch (err) {
      console.error("[worker/daily-digest]", err);
      res.status(500).json({ error: "digest failed" });
    }
  });

  // Weekly per-client report: what shipped, what's live, how socials moved.
  // Composed from data already in the DB (zero LLM cost), stored as a
  // document so it shows on the Overview — the "machine is working" artifact.
  app.post("/api/worker/weekly-report", async (req: Request, res: Response) => {
    if (!guard(req, res)) return;
    try {
      const { getRecentJobs, saveSocialSnapshot, getSocialSnapshots } = await import("./db");
      const { getClientSocialStats } = await import("./socialStats");
      const weekAgo = Date.now() - 7 * 24 * 3600000;
      const allJobs = await getRecentJobs(7);
      const created: number[] = [];

      for (const client of await getAllClients()) {
        const docs = await getClientDocuments(client.id);
        const newDocs = docs.filter(
          (d) => d.kind === "deliverable" && d.docType !== "weekly_report" && new Date(d.createdAt).getTime() > weekAgo
        );
        const postedDocs = docs.filter(
          (d) => d.status === "posted" && new Date(d.updatedAt).getTime() > weekAgo
        );
        const assets = await getClientAssetsMeta(client.id);
        const newAds = assets.filter((a) => new Date(a.createdAt).getTime() > weekAgo);
        const approvedAds = assets.filter((a) => a.status === "approved");
        const clientJobs = allJobs.filter((j) => j.clientId === client.id && (j.status === "approved" || j.status === "review"));
        if (!newDocs.length && !newAds.length && !clientJobs.length) continue; // quiet week, no report

        // Social pulse: fetch (cached hourly), snapshot, and diff vs ~last week
        let socialLines = "";
        try {
          const stats = await getClientSocialStats(client);
          for (const s of stats) {
            if (s.error || s.followers == null) continue;
            await saveSocialSnapshot({ clientId: client.id, platform: s.platform, handle: s.handle, followers: s.followers, posts: s.posts ?? null, extra: s.extra ?? null });
          }
          const snaps = await getSocialSnapshots(client.id, 30);
          socialLines = stats
            .filter((s) => !s.error && s.followers != null)
            .map((s) => {
              const prior = snaps.filter((p) => p.platform === s.platform && Date.now() - new Date(p.createdAt).getTime() > 5 * 24 * 3600000).pop();
              const delta = prior?.followers != null ? (s.followers ?? 0) - prior.followers : null;
              return `- ${s.platform}: ${s.followers?.toLocaleString()} followers${delta != null ? ` (${delta >= 0 ? "+" : ""}${delta} this period)` : ""}`;
            })
            .join("\n");
        } catch {
          /* socials optional */
        }

        const engineCounts = new Map<string, number>();
        for (const j of clientJobs) engineCounts.set(j.type, (engineCounts.get(j.type) ?? 0) + 1);
        const date = new Date().toISOString().slice(0, 10);
        const md = [
          `# Weekly Report — ${date}`,
          "",
          `## Shipped this week`,
          newAds.length ? `- ${newAds.length} new ad creatives rendered (${approvedAds.length} total in the approved library)` : "",
          ...Array.from(engineCounts.entries()).map(([t, n]) => `- ${n}x ${STAGES[t]?.label ?? t}`),
          newDocs.length ? `- ${newDocs.length} new deliverable documents: ${newDocs.slice(0, 8).map((d) => d.title).join(", ")}${newDocs.length > 8 ? "…" : ""}` : "",
          postedDocs.length ? `\n## Went live\n${postedDocs.slice(0, 10).map((d) => `- ${d.title}`).join("\n")}` : "",
          socialLines ? `\n## Social pulse\n${socialLines}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        await createClientDocument({
          clientId: client.id,
          kind: "deliverable",
          docType: "weekly_report",
          title: `Weekly Report — ${date}`,
          content: md,
          status: "approved",
        });
        created.push(client.id);
      }
      res.json({ ok: true, reports: created.length });
    } catch (err) {
      console.error("[worker/weekly-report]", err);
      res.status(500).json({ error: "weekly report failed" });
    }
  });
}
