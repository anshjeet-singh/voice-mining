/**
 * Pinned Render deploy for the current HEAD (house rule: GitHub push does not
 * reliably auto-deploy, always trigger via API). Reads RENDER_API_KEY and
 * RENDER_SERVICE_ID from the repo .env, POSTs a deploy pinned to the given
 * commit (default: HEAD), then polls /api/healthz until the live commit
 * matches or ~6 minutes pass.
 *
 *   npx tsx scripts/deploy.ts [commitSha]
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

function loadRepoEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^"|"$/g, "");
    }
  } catch {
    // rely on process.env
  }
  return out;
}

async function main() {
  const env = loadRepoEnv();
  const apiKey = process.env.RENDER_API_KEY ?? env.RENDER_API_KEY;
  const serviceId = process.env.RENDER_SERVICE_ID ?? env.RENDER_SERVICE_ID;
  const appUrl = (process.env.APP_URL ?? env.APP_URL ?? "https://app.cashflowcoaches.io").replace(/\/$/, "");
  if (!apiKey || !serviceId) throw new Error("RENDER_API_KEY + RENDER_SERVICE_ID required (repo .env)");

  const sha = process.argv[2] ?? execSync("git rev-parse HEAD").toString().trim();
  console.log(`deploying ${sha.slice(0, 10)} to ${serviceId}...`);

  const resp = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ commitId: sha }),
  });
  if (!resp.ok) throw new Error(`deploy request failed (${resp.status}): ${await resp.text()}`);
  const deploy = (await resp.json()) as { id: string; status: string };
  console.log(`deploy ${deploy.id} ${deploy.status}`);

  const deadline = Date.now() + 6 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 15000));
    try {
      const health = (await (await fetch(`${appUrl}/api/healthz`)).json()) as { commit?: string };
      process.stdout.write(`live commit: ${String(health.commit).slice(0, 10)}\n`);
      if (health.commit === sha) {
        console.log("deploy verified live");
        return;
      }
    } catch {
      process.stdout.write("healthz not reachable yet\n");
    }
  }
  throw new Error("deploy did not verify within 6 minutes — check the Render dashboard");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
