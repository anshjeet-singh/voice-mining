/**
 * Local Mac worker for the Client OS engine.
 *
 * Polls the deployed app for queued foundation jobs, runs headless Claude Code
 * (the owner's Max plan — $0 marginal cost) with the real agency skills, and
 * posts the four foundation docs back for review. Craft lessons accumulate in
 * worker/learnings/*.md and get git-committed with a source stamp.
 *
 * Run: npm run worker
 * Env: APP_URL, WORKER_SECRET, SKILLS_DIR (claude.ai skills cache, read-only),
 *      LEARNINGS_DIR (defaults to <repo>/worker/learnings)
 */
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import "dotenv/config";
import {
  buildDocPrompt,
  buildQaPrompt,
  parseCraftLessons,
  parseDocOutput,
  parseQaOutput,
  planShards,
  type ClaimedJob,
  type StageOutputSpec,
} from "./workerLib";

const exec = promisify(execFile);

const APP_URL = (process.env.APP_URL ?? "https://voice-mining.onrender.com").replace(/\/$/, "");
const WORKER_SECRET = process.env.WORKER_SECRET ?? "";
const SKILLS_DIR = process.env.SKILLS_DIR ?? "";
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const LEARNINGS_DIR = process.env.LEARNINGS_DIR ?? path.join(REPO_ROOT, "worker", "learnings");
const FRAMEWORKS_DIR = process.env.FRAMEWORKS_DIR ?? path.join(REPO_ROOT, "worker", "frameworks");
// Pin model AND effort: headless CLI defaults can silently downgrade quality
const WORKER_MODEL = process.env.WORKER_MODEL ?? "opus";
const WORKER_EFFORT = process.env.WORKER_EFFORT ?? "high";

/**
 * Resolve the claude binary to an absolute path. Under launchd the login
 * shell does not source .zshrc, so ~/.local/bin is not on PATH and a bare
 * "claude" spawn fails with ENOENT.
 */
function resolveClaudeBin(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const candidates = [
    path.join(os.homedir(), ".local", "bin", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ];
  for (const c of candidates) {
    try {
      fsSync.accessSync(c, fsSync.constants.X_OK);
      return c;
    } catch {
      /* try next */
    }
  }
  return "claude";
}
const CLAUDE_BIN = resolveClaudeBin();
const POLL_MS = 5_000;
// Deliverables are long runs. The ads creative deliverable views ~100
// reference images and visual-QA-loops 15 rendered statics: 30 minutes is
// not enough. Configurable via WORKER_TIMEOUT_MIN.
const CLAUDE_TIMEOUT_MS = Number(process.env.WORKER_TIMEOUT_MIN ?? 90) * 60 * 1000;

if (!WORKER_SECRET) {
  console.error("WORKER_SECRET is not set. Add it to .env or export it, matching Render.");
  process.exit(1);
}
if (!SKILLS_DIR) {
  console.error("SKILLS_DIR is not set. Point it at the claude.ai skills cache directory.");
  process.exit(1);
}

async function api<T>(route: string, body: unknown): Promise<T> {
  const res = await fetch(`${APP_URL}/api/worker/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${WORKER_SECRET}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${route} -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

// ─── Crash-safe completion: spool -> retry -> replay ─────────────────────────
// A finished multi-hour batch must NEVER be lost to a network blip or a Render
// cold start. The payload is spooled to disk BEFORE the first POST; retries
// back off; unsent spools replay on boot and between polls. The server's
// /complete is idempotent, so a double-send is harmless.

const SPOOL_DIR = path.join(REPO_ROOT, "worker", "spool");

async function spoolPath(jobId: number): Promise<string> {
  await fs.mkdir(SPOOL_DIR, { recursive: true });
  return path.join(SPOOL_DIR, `complete-${jobId}.json`);
}

/** POST /complete with backoff. True = server confirmed; false = spooled for replay. */
async function completeWithRetry(payload: { jobId: number } & Record<string, unknown>): Promise<boolean> {
  const file = await spoolPath(payload.jobId);
  await fs.writeFile(file, JSON.stringify(payload));
  const delays = [0, 10_000, 45_000, 120_000];
  for (const delay of delays) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      await api("complete", payload);
      await fs.rm(file, { force: true });
      return true;
    } catch (err) {
      console.error(`[job ${payload.jobId}] complete attempt failed:`, (err as Error).message.slice(0, 200));
    }
  }
  console.error(`[job ${payload.jobId}] complete NOT confirmed — payload spooled at ${file}; will replay`);
  return false;
}

/** Re-send any spooled completions (boot + between polls). */
async function replaySpool(): Promise<void> {
  const files = await fs.readdir(SPOOL_DIR).catch(() => [] as string[]);
  for (const f of files) {
    if (!f.startsWith("complete-") || !f.endsWith(".json")) continue;
    const full = path.join(SPOOL_DIR, f);
    try {
      const payload = JSON.parse(await fs.readFile(full, "utf8"));
      await api("complete", payload);
      await fs.rm(full, { force: true });
      console.log(`[spool] replayed ${f} — server confirmed`);
    } catch (err) {
      console.error(`[spool] replay of ${f} failed:`, (err as Error).message.slice(0, 150));
    }
  }
}

async function readJobDir(dir: string): Promise<Record<string, string | undefined>> {
  const files: Record<string, string | undefined> = {};
  for (const name of await fs.readdir(dir)) {
    if (name.endsWith(".md")) {
      files[name] = await fs.readFile(path.join(dir, name), "utf8");
    }
  }
  return files;
}

/** Append craft lessons to worker/learnings/<skill>.md and git-commit them. */
async function saveCraftLessons(raw: string, jobId: number, clientName: string) {
  const lessons = parseCraftLessons(raw);
  if (!lessons.length) return;

  await fs.mkdir(LEARNINGS_DIR, { recursive: true });
  const stamp = `<!-- ${new Date().toISOString().slice(0, 10)} · job ${jobId} · client: ${clientName} -->`;
  const touched: string[] = [];
  for (const { skill, lessons: body } of lessons) {
    const file = path.join(LEARNINGS_DIR, `${skill}.md`);
    const exists = await fs
      .access(file)
      .then(() => true)
      .catch(() => false);
    const header = exists ? "" : `# Learnings: ${skill}\n\nAccumulated craft lessons applied on every run.\n`;
    await fs.appendFile(file, `${header}\n${stamp}\n${body}\n`);
    touched.push(file);
  }

  try {
    await exec("git", ["add", ...touched], { cwd: REPO_ROOT });
    await exec(
      "git",
      ["commit", "-m", `learn: craft lessons from job ${jobId} (${clientName})`],
      { cwd: REPO_ROOT }
    );
    console.log(`  committed craft lessons for: ${lessons.map((l) => l.skill).join(", ")}`);
  } catch (err) {
    console.warn("  craft lessons saved but git commit failed:", (err as Error).message.slice(0, 200));
  }
}

/**
 * Spawn headless Claude Code with stdin CLOSED. Recent claude CLI versions
 * stall then error on an open-but-empty stdin pipe ("no stdin data received
 * in 3s"), which is exactly what promisified execFile hands them. spawn with
 * stdio ignore is the equivalent of `< /dev/null`. Captures a stderr tail so
 * a failed run reports the real error, not just "Command failed".
 */
function runClaude(args: string[], cwd: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-4000);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`claude timed out after ${Math.round(timeoutMs / 60000)}m. stderr: ${stderr.trim()}`));
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(`claude exited ${code}. stderr: ${stderr.trim() || "(empty)"}`));
    });
  });
}

/**
 * Live progress: each deliverable's session appends step lines to
 * ./PROGRESS.log; we tail the newest line per deliverable, compose one
 * status string for the job, and post it whenever it changes.
 */
function makeProgressReporter(jobId: number) {
  const lines = new Map<string, string>();
  let lastPosted = "";
  const post = async () => {
    const combined = Array.from(lines.entries())
      .map(([title, line]) => (lines.size > 1 ? `${title}: ${line}` : line))
      .join(" · ")
      .slice(0, 490);
    if (!combined || combined === lastPosted) return;
    lastPosted = combined;
    await api("progress", { jobId, progress: combined }).catch(() => {});
  };
  return {
    watch(title: string, jobDir: string): () => void {
      const file = path.join(jobDir, "PROGRESS.log");
      const timer = setInterval(async () => {
        const raw = await fs.readFile(file, "utf8").catch(() => "");
        const last = raw.trim().split("\n").filter(Boolean).pop();
        if (last && lines.get(title) !== last) {
          lines.set(title, last);
          await post();
        }
      }, 8000);
      return () => {
        clearInterval(timer);
        lines.set(title, "done");
        void post();
      };
    },
  };
}

type ProgressReporter = ReturnType<typeof makeProgressReporter>;

// planShards moved to workerLib.ts (pure + unit-tested; phrases single-sourced
// in shared/adRequests.ts so the studio and the planner can never drift apart).

/** Run ONE Claude session for a deliverable (or one shard of it). */
async function runDeliverable(
  job: ClaimedJob,
  output: StageOutputSpec,
  reporter?: ProgressReporter,
  shard?: { feedback: string; label: string }
) {
  const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), `${job.type}-${job.id}-${output.docType}-`));

  // Operator proof/cutout images: write them to ./refs/ so the render session
  // can view and composite them. The prompt references them by that path.
  let refImagesDir: string | undefined;
  if (job.refImages?.length) {
    refImagesDir = path.join(jobDir, "refs");
    await fs.mkdir(refImagesDir, { recursive: true });
    for (const img of job.refImages) {
      await fs.writeFile(path.join(refImagesDir, img.filename), Buffer.from(img.base64, "base64")).catch(() => {});
    }
  }

  const promptJob = shard ? { ...job, feedback: shard.feedback } : job;
  const prompt = buildDocPrompt(promptJob, output, {
    skillsDir: SKILLS_DIR,
    learningsDir: LEARNINGS_DIR,
    frameworksDir: FRAMEWORKS_DIR,
    refImagesDir,
  });
  const promptFile = path.join(jobDir, "PROMPT.md");
  await fs.writeFile(promptFile, prompt);

  const title = shard ? `${output.title} [${shard.label}]` : output.title;
  console.log(`[job ${job.id}] ${title}: running headless Claude Code (${WORKER_MODEL}, effort ${WORKER_EFFORT}) ...`);
  const stopWatching = reporter?.watch(title, jobDir);
  try {
    await runClaude(
      [
        "-p",
        `Follow the instructions in ${promptFile} exactly.`,
        "--model",
        WORKER_MODEL,
        "--effort",
        WORKER_EFFORT,
        "--dangerously-skip-permissions",
      ],
      jobDir,
      CLAUDE_TIMEOUT_MS
    );
  } finally {
    stopWatching?.();
  }

  const files = await readJobDir(jobDir);
  const parsed = parseDocOutput(files, output);

  // Rendered binaries: the session copies final PNGs into ./assets/ so the
  // app can display them for per-ad review. Collected before jobDir cleanup.
  const assets: Array<{ docType: string; filename: string; mime: string; base64: string }> = [];
  const assetsDir = path.join(jobDir, "assets");
  const assetFiles = await fs.readdir(assetsDir).catch(() => [] as string[]);
  for (const f of assetFiles.sort()) {
    const ext = path.extname(f).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;
    const buf = await fs.readFile(path.join(assetsDir, f)).catch(() => null);
    if (!buf || !buf.length) continue;
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    assets.push({ docType: output.docType, filename: f, mime, base64: buf.toString("base64") });
  }
  if (assets.length) console.log(`[job ${job.id}] ${title}: ${assets.length} rendered assets collected`);

  // jobDir is NOT deleted here: runJob cleans up only after the server
  // confirms the completion, so a failed POST never destroys finished work.
  console.log(`[job ${job.id}] ${title}: done (${parsed.content.length.toLocaleString()} chars)`);
  return { docType: output.docType, assets, jobDir, ...parsed };
}

/**
 * Independent QA + winner-score pass over a statics batch: a SEPARATE fast
 * session (never the builder) views every PNG against the batch spec, the
 * render rules, and the operator's verdict history, and scores each ad.
 * Scores order the review queue; failures are visible before the operator
 * opens a single ad. Fail-open: any error just skips QA.
 */
async function runQaPass(
  job: ClaimedJob,
  assets: Array<{ docType: string; filename: string; mime: string; base64: string; qaScore?: number; qaNote?: string }>,
  batchDoc: string
): Promise<void> {
  const statics = assets.filter((a) => a.docType.startsWith("ad_statics"));
  if (statics.length < 2) return;
  const qaDir = await fs.mkdtemp(path.join(os.tmpdir(), `qa-${job.id}-`));
  try {
    for (const a of statics) {
      await fs.writeFile(path.join(qaDir, a.filename), Buffer.from(a.base64, "base64"));
    }
    await fs.writeFile(path.join(qaDir, "BATCH_SPEC.md"), batchDoc.slice(0, 120_000));
    const verdictsDigest = (job.assetReviews ?? [])
      .slice(-30)
      .map((r) => `- ${r.filename}: ${r.status}${r.feedback ? ` (${r.feedback.slice(0, 120)})` : ""}`)
      .join("\n");
    const prompt = buildQaPrompt({
      assetsDir: qaDir,
      filenames: statics.map((a) => a.filename),
      batchDoc: "",
      frameworksDir: FRAMEWORKS_DIR,
      verdictsDigest,
    });
    const promptFile = path.join(qaDir, "QA_PROMPT.md");
    await fs.writeFile(promptFile, prompt);
    console.log(`[job ${job.id}] QA pass: grading ${statics.length} statics with an independent session`);
    await runClaude(
      ["-p", `Follow the instructions in ${promptFile} exactly.`, "--model", "sonnet", "--dangerously-skip-permissions"],
      qaDir,
      20 * 60 * 1000
    );
    const raw = await fs.readFile(path.join(qaDir, "qa.json"), "utf8").catch(() => undefined);
    const verdicts = parseQaOutput(raw, statics.map((a) => a.filename));
    for (const v of verdicts) {
      const asset = statics.find((a) => a.filename === v.filename);
      if (asset) {
        asset.qaScore = v.score;
        asset.qaNote = v.note;
      }
    }
    const fails = verdicts.filter((v) => v.score <= 30).length;
    console.log(`[job ${job.id}] QA pass: ${verdicts.length} graded${fails ? `, ${fails} flagged as fails` : ""}`);
  } catch (err) {
    console.error(`[job ${job.id}] QA pass skipped:`, (err as Error).message.slice(0, 200));
  } finally {
    await fs.rm(qaDir, { recursive: true, force: true });
  }
}

async function runJob(job: ClaimedJob) {
  console.log(
    `[job ${job.id}] claimed — ${job.stage.label} for ${job.client.name} (${job.client.niche}), ${job.stage.outputs.length} deliverables in parallel`
  );
  const started = Date.now();

  // All deliverables run CONCURRENTLY: separate Claude Code sessions, each
  // focused on one document. Heavy ad renders shard further into parallel
  // sessions of a few ads each, merged back into one deliverable.
  const reporter = makeProgressReporter(job.id);
  const jobDirs: string[] = [];
  const results = await Promise.all(
    job.stage.outputs.map(async (output) => {
      const shards = planShards(job, output);
      if (!shards) {
        const r = await runDeliverable(job, output, reporter);
        jobDirs.push(r.jobDir);
        return r;
      }
      console.log(`[job ${job.id}] ${output.title}: sharding into ${shards.length} parallel sessions`);
      // SALVAGE: one dead shard must not discard the others' finished ads.
      // Succeeded shards merge and ship with a failure manifest; a full
      // wipeout still throws so the job fails honestly.
      const settled = await Promise.allSettled(
        shards.map((feedback, i) =>
          runDeliverable(job, output, reporter, { feedback, label: `${i + 1}/${shards.length}` })
        )
      );
      const parts = settled.filter((s): s is PromiseFulfilledResult<Awaited<ReturnType<typeof runDeliverable>>> => s.status === "fulfilled").map((s) => s.value);
      const failed = settled
        .map((s, i) => (s.status === "rejected" ? { shard: i + 1, reason: String((s.reason as Error)?.message ?? s.reason).slice(0, 200) } : null))
        .filter(Boolean) as Array<{ shard: number; reason: string }>;
      if (!parts.length) {
        throw new Error(`All ${shards.length} shards failed: ${failed.map((f) => f.reason).join(" | ")}`);
      }
      for (const p of parts) jobDirs.push(p.jobDir);
      if (failed.length) {
        console.error(`[job ${job.id}] ${output.title}: salvaged ${parts.length}/${shards.length} shards (failed: ${failed.map((f) => f.shard).join(", ")})`);
      }
      const manifest = failed.length
        ? `\n\n> PARTIAL BATCH: shard${failed.length > 1 ? "s" : ""} ${failed.map((f) => f.shard).join(", ")} of ${shards.length} failed (${failed.map((f) => f.reason).join("; ")}). The ads above are the salvaged shards — rebuild the missing range on demand.`
        : "";
      return {
        docType: output.docType,
        jobDir: parts[0].jobDir,
        content: parts.map((p) => p.content).join("\n\n") + manifest,
        assets: parts.flatMap((p) => p.assets),
        clientLessons: parts.flatMap((p) => p.clientLessons),
        craftLessonsRaw: parts.map((p) => p.craftLessonsRaw).join("\n\n"),
      };
    })
  );

  const docs = Object.fromEntries(results.map((r) => [r.docType, r.content]));
  const clientLessons = Array.from(new Set(results.flatMap((r) => r.clientLessons)));
  const assets: Array<{ docType: string; filename: string; mime: string; base64: string; qaScore?: number; qaNote?: string }> =
    results.flatMap((r) => r.assets);

  // Independent QA + winner scoring before the operator ever sees the batch.
  const staticsDoc = results.find((r) => r.docType.startsWith("ad_statics"))?.content ?? "";
  if (staticsDoc) await runQaPass(job, assets, staticsDoc);

  const confirmed = await completeWithRetry({ jobId: job.id, docs, clientLessons, assets });
  console.log(
    `[job ${job.id}] ${confirmed ? "complete" : "finished (completion spooled)"} in ${Math.round((Date.now() - started) / 60000)}m — ${results.length} docs posted, ${clientLessons.length} client lessons`
  );

  // Only after the server has the work (or it is safely spooled) do the
  // session dirs get cleaned up.
  for (const dir of jobDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  for (const r of results) {
    await saveCraftLessons(r.craftLessonsRaw, job.id, job.client.name);
  }
}

/** Copy a client's approved static ads into their Google Drive Ads folder. */
type ExportJob = { id: number; type: "export_drive"; client: { name: string }; exportImages: Array<{ filename: string; mime: string; base64: string }> };
async function runExport(job: ExportJob) {
  console.log(`[job ${job.id}] export_drive — ${job.exportImages.length} approved ads for ${job.client.name}`);
  const finder = path.join(os.homedir(), "ad-factory", "find-client.sh");
  const { stdout } = await exec("bash", [finder, job.client.name], { timeout: 30_000 });
  const clientDir = stdout.trim().split("\n").pop()?.trim() ?? "";
  if (!clientDir || clientDir.includes("NO MATCH") || !fsSync.existsSync(clientDir)) {
    throw new Error(`Could not resolve Drive folder for "${job.client.name}" (got: ${clientDir || "empty"})`);
  }
  const dest = path.join(clientDir, "Ads", "Approved Static Ads");
  await fs.mkdir(dest, { recursive: true });
  let count = 0;
  for (const img of job.exportImages) {
    if (!/^image\//.test(img.mime)) continue;
    await fs.writeFile(path.join(dest, img.filename), Buffer.from(img.base64, "base64"));
    count++;
  }
  console.log(`[job ${job.id}] exported ${count} ads -> ${dest}`);
  await api("export-done", { jobId: job.id, ok: true, count, path: dest }).catch(() => {});
}

async function tick() {
  const { job } = await api<{ job: (ClaimedJob & { type: string }) | ExportJob | null }>("claim", {});
  if (!job) return;
  try {
    if (job.type === "export_drive") await runExport(job as ExportJob);
    else await runJob(job as ClaimedJob);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[job ${job.id}] FAILED:`, message.slice(0, 500));
    const route = job.type === "export_drive" ? "export-done" : "fail";
    const body = job.type === "export_drive" ? { jobId: job.id, ok: false, error: message } : { jobId: job.id, error: message };
    await api(route, body).catch(() => {});
  }
}

// Sequential loop: one job at a time, keep polling forever.
(async () => {
  // Boot self-check: fail loudly NOW if the claude binary is unusable,
  // instead of failing every job with a cryptic spawn error later.
  try {
    const { stdout } = await exec(CLAUDE_BIN, ["--version"], { timeout: 30_000 });
    console.log(`claude binary: ${CLAUDE_BIN} (${stdout.trim()})`);
  } catch (err) {
    console.error(`FATAL: cannot run claude at "${CLAUDE_BIN}":`, (err as Error).message.slice(0, 200));
    console.error("Set CLAUDE_BIN in .env to the full path of your claude binary.");
    process.exit(1);
  }

  console.log(`Worker up. Polling ${APP_URL} every ${POLL_MS / 1000}s. Model: ${WORKER_MODEL}, effort: ${WORKER_EFFORT}`);
  console.log(`Skills: ${SKILLS_DIR}`);
  console.log(`Learnings: ${LEARNINGS_DIR}`);

  // Any completion that never reached the server last run goes out first.
  await replaySpool();
  let lastSpoolReplay = Date.now();

  // Auto-refresh mining heartbeat: a few pings a day; the server decides
  // which clients' competitor intel is stale and queues re-mines itself.
  const AUTO_INTEL_MS = 6 * 60 * 60 * 1000;
  let lastAutoIntel = 0;

  for (;;) {
    try {
      if (Date.now() - lastAutoIntel > AUTO_INTEL_MS) {
        lastAutoIntel = Date.now();
        const { queued } = await api<{ queued: number[] }>("auto-intel", {}).catch(() => ({ queued: [] as number[] }));
        if (queued.length) console.log(`auto-intel: queued refresh mines -> jobs ${queued.join(", ")}`);
      }
      if (Date.now() - lastSpoolReplay > 5 * 60 * 1000) {
        lastSpoolReplay = Date.now();
        await replaySpool();
      }
      await tick();
    } catch (err) {
      console.error("poll error:", (err as Error).message.slice(0, 300));
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
})();
