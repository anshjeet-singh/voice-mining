/**
 * One-off additive DDL for the performance loop + self-healing queue
 * (2026-07-21, sprints 1-2). Run with DATABASE_URL set. Additive raw SQL
 * only — drizzle db:push is unsafe on this DB.
 */
import mysql from "mysql2/promise";

const ASSET_COLS: Array<[string, string]> = [
  ["format", "VARCHAR(100) NULL"],
  ["reference", "VARCHAR(300) NULL"],
  ["subAvatar", "VARCHAR(200) NULL"],
  ["angle", "VARCHAR(400) NULL"],
  ["awareness", "VARCHAR(50) NULL"],
  ["hookCategory", "VARCHAR(100) NULL"],
  ["qaScore", "INT NULL"],
  ["qaNote", "VARCHAR(500) NULL"],
  ["metaSpend", "FLOAT NULL"],
  ["metaCtr", "FLOAT NULL"],
  ["metaCpl", "FLOAT NULL"],
  ["metaImportedAt", "TIMESTAMP NULL"],
];

const JOB_COLS: Array<[string, string]> = [
  ["claimToken", "VARCHAR(32) NULL"],
  ["heartbeatAt", "TIMESTAMP NULL"],
];

async function addColumns(conn: mysql.Connection, table: string, cols: Array<[string, string]>) {
  for (const [name, def] of cols) {
    const [rows] = await conn.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [name]);
    if ((rows as unknown[]).length === 0) {
      await conn.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
      console.log(`added ${table}.${name}`);
    } else {
      console.log(`${table}.${name} exists`);
    }
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const conn = await mysql.createConnection(url);
  await addColumns(conn, "client_assets", ASSET_COLS);
  await addColumns(conn, "jobs", JOB_COLS);
  await conn.end();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
