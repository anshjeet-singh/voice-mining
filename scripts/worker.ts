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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
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
const POLL_MS = 5_000;
const CLAUDE_TIMEOUT_MS = 30 * 60 * 1000; // deliverables are long runs

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

/** Run ONE deliverable in its own temp dir with its own headless Claude Code. */
async function runDeliverable(job: ClaimedJob, output: StageOutputSpec) {
  const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), `${job.type}-${job.id}-${output.docType}-`));
  const prompt = buildDocPrompt(job, output, {
    skillsDir: SKILLS_DIR,
    learningsDir: LEARNINGS_DIR,
    frameworksDir: FRAMEWORKS_DIR,
  });
  const promptFile = path.join(jobDir, "PROMPT.md");
  await fs.writeFile(promptFile, prompt);

  console.log(`[job ${job.id}] ${output.title}: running headless Claude Code (${WORKER_MODEL}, effort ${WORKER_EFFORT}) ...`);
  await exec(
    "claude",
    [
      "-p",
      `Follow the instructions in ${promptFile} exactly.`,
      "--model",
      WORKER_MODEL,
      "--effort",
      WORKER_EFFORT,
      "--dangerously-skip-permissions",
    ],
    { cwd: jobDir, timeout: CLAUDE_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 }
  );

  const files = await readJobDir(jobDir);
  const parsed = parseDocOutput(files, output);
  await fs.rm(jobDir, { recursive: true, force: true });
  console.log(`[job ${job.id}] ${output.title}: done (${parsed.content.length.toLocaleString()} chars)`);
  return { docType: output.docType, ...parsed };
}

async function runJob(job: ClaimedJob) {
  console.log(
    `[job ${job.id}] claimed — ${job.stage.label} for ${job.client.name} (${job.client.niche}), ${job.stage.outputs.length} deliverables in parallel`
  );
  const started = Date.now();

  // All deliverables run CONCURRENTLY: separate Claude Code sessions, each
  // focused on one document. Cuts wall time by the number of deliverables.
  const results = await Promise.all(job.stage.outputs.map((output) => runDeliverable(job, output)));

  const docs = Object.fromEntries(results.map((r) => [r.docType, r.content]));
  const clientLessons = Array.from(new Set(results.flatMap((r) => r.clientLessons)));

  await api("complete", { jobId: job.id, docs, clientLessons });
  console.log(
    `[job ${job.id}] complete in ${Math.round((Date.now() - started) / 60000)}m — ${results.length} docs posted, ${clientLessons.length} client lessons`
  );

  for (const r of results) {
    await saveCraftLessons(r.craftLessonsRaw, job.id, job.client.name);
  }
}

async function tick() {
  const { job } = await api<{ job: ClaimedJob | null }>("claim", {});
  if (!job) return;
  try {
    await runJob(job);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[job ${job.id}] FAILED:`, message.slice(0, 500));
    await api("fail", { jobId: job.id, error: message }).catch(() => {});
  }
}

console.log(`Worker up. Polling ${APP_URL} every ${POLL_MS / 1000}s. Skills: ${SKILLS_DIR}`);
console.log(`Learnings: ${LEARNINGS_DIR}`);

// Sequential loop: one job at a time, keep polling forever.
(async () => {
  for (;;) {
    try {
      await tick();
    } catch (err) {
      console.error("poll error:", (err as Error).message.slice(0, 300));
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
})();
