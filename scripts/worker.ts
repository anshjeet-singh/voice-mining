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
  parseCraftLessons,
  parseDocOutput,
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

/**
 * Shard heavy ad renders into PARALLEL Claude sessions. One session rendering
 * 15 statics (view references, build, visual-QA each) is the slowest thing the
 * worker does; 3-4 sessions doing 4-5 ads each cut wall time to a quarter.
 * Returns per-shard feedback overrides, or null when the job shouldn't shard.
 */
function planShards(job: ClaimedJob, output: StageOutputSpec): string[] | null {
  if (!["ad_scripts", "ad_statics", "ad_statics_extra"].includes(output.docType)) return null;
  const fb = job.feedback ?? "";

  // Case 1: rebuild-rejected — each rejected ad is independent, split the list
  if (/REBUILD ONLY/i.test(fb)) {
    const lines = fb.split("\n");
    const items = lines.filter((l) => l.trim().startsWith("- "));
    if (items.length < 4) return null;
    const header = lines.find((l) => /REBUILD ONLY/i.test(l)) ?? "REBUILD ONLY these rejected static ads:";
    const approvedLine = lines.find((l) => l.trim().startsWith("Approved (do not change)")) ?? "";
    const per = 3;
    const shards: string[] = [];
    for (let i = 0; i < items.length; i += per) {
      const chunk = items.slice(i, i + per);
      const n = Math.floor(i / per) + 1;
      const k = Math.ceil(items.length / per);
      shards.push(
        [
          header,
          ...chunk,
          approvedLine,
          `PARALLEL SHARD ${n} of ${k}: other sessions are rebuilding the rest of the rejected list. Rebuild ONLY the ${chunk.length} ads above (keep their exact filenames) and write doc entries ONLY for them.`,
        ]
          .filter(Boolean)
          .join("\n")
      );
    }
    return shards;
  }

  // Case 2: fresh on-demand batch — split the count into ranges
  const m = fb.match(/Generate EXACTLY (\d+) NEW static ads/i);
  if (m) {
    const total = Number(m[1]);
    if (total < 8) return null;
    const per = 5;
    const k = Math.ceil(total / per);
    const shards: string[] = [];
    for (let i = 0; i < k; i++) {
      const start = i * per + 1;
      const end = Math.min((i + 1) * per, total);
      const n = end - start + 1;
      shards.push(
        fb.replace(/Generate EXACTLY \d+ NEW static ads/i, `Generate EXACTLY ${n} NEW static ads`) +
          ` PARALLEL SHARD ${i + 1} of ${k}: other sessions are building the rest of this batch. Number YOUR ads ${start}-${end} (use that range in filenames so shards never collide). To keep the combined batch diverse, split the eligible reference catalog categories alphabetically into ${k} contiguous slices and clone ONLY from slice ${i + 1}. Produce ONLY your ${n} ads and doc entries ONLY for them.`
      );
    }
    return shards;
  }

  return null;
}

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

  await fs.rm(jobDir, { recursive: true, force: true });
  console.log(`[job ${job.id}] ${title}: done (${parsed.content.length.toLocaleString()} chars)`);
  return { docType: output.docType, assets, ...parsed };
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
  const results = await Promise.all(
    job.stage.outputs.map(async (output) => {
      const shards = planShards(job, output);
      if (!shards) return runDeliverable(job, output, reporter);
      console.log(`[job ${job.id}] ${output.title}: sharding into ${shards.length} parallel sessions`);
      const parts = await Promise.all(
        shards.map((feedback, i) =>
          runDeliverable(job, output, reporter, { feedback, label: `${i + 1}/${shards.length}` })
        )
      );
      return {
        docType: output.docType,
        content: parts.map((p) => p.content).join("\n\n"),
        assets: parts.flatMap((p) => p.assets),
        clientLessons: parts.flatMap((p) => p.clientLessons),
        craftLessonsRaw: parts.map((p) => p.craftLessonsRaw).join("\n\n"),
      };
    })
  );

  const docs = Object.fromEntries(results.map((r) => [r.docType, r.content]));
  const clientLessons = Array.from(new Set(results.flatMap((r) => r.clientLessons)));
  const assets = results.flatMap((r) => r.assets);

  await api("complete", { jobId: job.id, docs, clientLessons, assets });
  console.log(
    `[job ${job.id}] complete in ${Math.round((Date.now() - started) / 60000)}m — ${results.length} docs posted, ${clientLessons.length} client lessons`
  );

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
      await tick();
    } catch (err) {
      console.error("poll error:", (err as Error).message.slice(0, 300));
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
})();
