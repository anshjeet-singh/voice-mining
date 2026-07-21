/**
 * One-off additive DDL (2026-07-21): Meta upload copy columns on
 * client_assets so every ad ships with its words. Additive only.
 */
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const conn = await mysql.createConnection(url);
  const cols: Array<[string, string]> = [
    ["copyPrimary", "VARCHAR(1000) NULL"],
    ["copyHeadline", "VARCHAR(200) NULL"],
    ["copyDescription", "VARCHAR(200) NULL"],
  ];
  for (const [name, def] of cols) {
    const [rows] = await conn.query("SHOW COLUMNS FROM client_assets LIKE ?", [name]);
    if ((rows as unknown[]).length === 0) {
      await conn.query(`ALTER TABLE client_assets ADD COLUMN ${name} ${def}`);
      console.log(`added client_assets.${name}`);
    } else console.log(`client_assets.${name} exists`);
  }
  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
