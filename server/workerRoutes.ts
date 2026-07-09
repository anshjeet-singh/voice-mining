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
  createClientDocument,
  getAnalysisResultBySearchId,
  getClientById,
  getClientDocuments,
  getReportBySearchId,
  getSearchesByClient,
  setJobStatus,
  upsertFoundationDocument,
} from "./db";
import { normalizeInsights } from "@shared/reportContent";
import type { InsightList } from "../drizzle/schema";

/** True when the request carries the correct worker bearer token. */
export function isWorkerAuthorized(authHeader: string | undefined, secret: string): boolean {
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}

export const FOUNDATION_DOC_TITLES: Record<string, string> = {
  icp_snapshot: "ICP Snapshot",
  offers: "Offers",
  brand_positioning: "Brand & Positioning",
  course_outline: "Course Outline",
};

const insightLines = (list: InsightList | null | undefined, cap: number) =>
  normalizeInsights(list)
    .slice(0, cap)
    .map((i) => `- ${i.text}${i.verbatimExample ? ` (verbatim: "${i.verbatimExample}")` : ""}`)
    .join("\n");

/** Render the client's most recent research report as readable text for the worker. */
async function renderResearchForClient(clientId: number): Promise<string> {
  const searches = await getSearchesByClient(clientId);
  const complete = searches.find((s) => s.status === "complete");
  if (!complete) return "";

  const [analysis, report] = await Promise.all([
    getAnalysisResultBySearchId(complete.id),
    getReportBySearchId(complete.id),
  ]);
  if (!analysis) return "";

  const parts: string[] = [`VOICE MINING RESEARCH for keywords: ${complete.keyword}`];
  parts.push(`\nPAIN POINTS:\n${insightLines(analysis.painPoints, 12)}`);
  parts.push(`\nDESIRES:\n${insightLines(analysis.desires, 12)}`);
  parts.push(`\nFEARS:\n${insightLines(analysis.fears, 8)}`);
  parts.push(`\nOBJECTIONS:\n${insightLines(analysis.objections, 8)}`);
  const strList = (v: unknown, cap: number) =>
    Array.isArray(v) ? (v as string[]).slice(0, cap).map((x) => `- ${x}`).join("\n") : "";
  parts.push(`\nBUYING TRIGGERS:\n${strList(analysis.buyingTriggers, 8)}`);
  parts.push(`\nEMOTIONAL LANGUAGE:\n${strList(analysis.emotionalLanguage, 12)}`);
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
      const docs = await getClientDocuments(job.clientId);
      const onboardingDocs = docs
        .filter((d) => d.kind === "onboarding")
        .map((d) => ({ title: d.title, docType: d.docType, content: d.content }));
      const lessons = docs.filter((d) => d.kind === "lesson").map((d) => d.content);
      const research = await renderResearchForClient(job.clientId);

      res.json({
        job: {
          id: job.id,
          type: job.type,
          client: {
            name: client.name,
            niche: client.niche,
            funnelType: client.funnelType,
            pricePoint: client.pricePoint ?? "",
          },
          onboardingDocs,
          research,
          lessons,
          feedback: job.payload?.feedback ?? "",
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
      const { jobId, docs, clientLessons } = req.body as {
        jobId: number;
        docs: Record<string, string>;
        clientLessons?: string[];
      };
      if (!jobId || !docs) return res.status(400).json({ error: "jobId and docs required" });

      const job = await (await import("./db")).getJobById(jobId);
      if (!job) return res.status(404).json({ error: "job not found" });

      for (const [docType, title] of Object.entries(FOUNDATION_DOC_TITLES)) {
        const content = docs[docType];
        if (!content || content.trim().length < 50) {
          await setJobStatus(jobId, "failed", `Worker returned empty or too-short doc: ${docType}`);
          return res.status(400).json({ error: `missing doc: ${docType}` });
        }
        await upsertFoundationDocument(job.clientId, docType, title, content.trim());
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

      await setJobStatus(jobId, "review");
      res.json({ ok: true });
    } catch (err) {
      console.error("[worker/complete]", err);
      res.status(500).json({ error: "complete failed" });
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
}
