/**
 * One-off additive DDL for the client portal logins (2026-07-22). Additive
 * raw SQL only — drizzle db:push is unsafe on this DB (trips on
 * analysis_results constraint drift).
 *
 * DATABASE_URL is resolved from the env, falling back to the Render
 * env-vars API using RENDER_API_KEY/RENDER_SERVICE_ID from the repo .env
 * (house rule: the DB URL is never stored locally).
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

function loadRepoEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^"|"$/g, "");
    }
  } catch {
    // no .env — rely on process.env
  }
  return out;
}

async function resolveDatabaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = loadRepoEnv();
  const apiKey = process.env.RENDER_API_KEY ?? env.RENDER_API_KEY;
  const serviceId = process.env.RENDER_SERVICE_ID ?? env.RENDER_SERVICE_ID;
  if (!apiKey || !serviceId) throw new Error("DATABASE_URL (or RENDER_API_KEY + RENDER_SERVICE_ID) required");
  const resp = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars?limit=50`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) throw new Error(`Render env-vars API failed (${resp.status})`);
  const rows = (await resp.json()) as Array<{ envVar: { key: string; value: string } }>;
  const found = rows.find((r) => r.envVar.key === "DATABASE_URL")?.envVar.value;
  if (!found) throw new Error("DATABASE_URL not present on the Render service");
  return found;
}

async function main() {
  const url = await resolveDatabaseUrl();
  const conn = await mysql.createConnection(url);

  await conn.query(`CREATE TABLE IF NOT EXISTS client_portal_logins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    clientId INT NOT NULL,
    email VARCHAR(320) NOT NULL UNIQUE,
    passwordHash VARCHAR(300) NOT NULL,
    lastLoginAt TIMESTAMP NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log("client_portal_logins ready");

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
