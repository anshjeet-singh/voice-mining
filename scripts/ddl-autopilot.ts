/**
 * One-off additive DDL for sprints 3-4 (2026-07-21): clients.autoRun +
 * social_stats_snapshots. Run with DATABASE_URL set. Additive only.
 */
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const conn = await mysql.createConnection(url);

  const [cols] = await conn.query("SHOW COLUMNS FROM clients LIKE 'autoRun'");
  if ((cols as unknown[]).length === 0) {
    await conn.query("ALTER TABLE clients ADD COLUMN autoRun INT NOT NULL DEFAULT 0");
    console.log("added clients.autoRun");
  } else console.log("clients.autoRun exists");

  await conn.query(`CREATE TABLE IF NOT EXISTS social_stats_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    clientId INT NOT NULL,
    platform VARCHAR(20) NOT NULL,
    handle VARCHAR(200) NOT NULL,
    followers INT NULL,
    posts INT NULL,
    extra INT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log("social_stats_snapshots ready");

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
