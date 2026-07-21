/**
 * One-off additive DDL for the recording queue (2026-07-21). Run with
 * DATABASE_URL set. Additive raw SQL only — drizzle db:push is unsafe on
 * this DB (trips on analysis_results constraint drift).
 */
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const conn = await mysql.createConnection(url);

  const [cols] = await conn.query("SHOW COLUMNS FROM clients LIKE 'recordingToken'");
  if ((cols as unknown[]).length === 0) {
    await conn.query("ALTER TABLE clients ADD COLUMN recordingToken VARCHAR(64) NULL");
    console.log("added clients.recordingToken");
  } else {
    console.log("clients.recordingToken already exists");
  }

  await conn.query(`CREATE TABLE IF NOT EXISTS client_recording_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    clientId INT NOT NULL,
    docId INT NOT NULL,
    recordedAt TIMESTAMP NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log("client_recording_items ready");

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
