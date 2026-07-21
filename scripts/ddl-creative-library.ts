/**
 * One-off additive DDL (2026-07-21): the compounding creative-research
 * library (creative_intel + creative_intel_serves). Additive only.
 */
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const conn = await mysql.createConnection(url);

  await conn.query(`CREATE TABLE IF NOT EXISTS creative_intel (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source VARCHAR(20) NOT NULL DEFAULT 'foreplay',
    sourceId VARCHAR(100) NOT NULL,
    niche VARCHAR(300) NOT NULL,
    advertiser VARCHAR(200) NULL,
    displayFormat VARCHAR(30) NULL,
    headline VARCHAR(500) NULL,
    copy TEXT NULL,
    transcript LONGTEXT NULL,
    ctaType VARCHAR(60) NULL,
    imageUrl VARCHAR(1000) NULL,
    productCategory VARCHAR(200) NULL,
    live INT NOT NULL DEFAULT 0,
    runningDays INT NOT NULL DEFAULT 0,
    timesSeen INT NOT NULL DEFAULT 1,
    firstSeenAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lastSeenAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sourceId (sourceId),
    KEY idx_niche (niche)
  )`);
  console.log("creative_intel ready");

  await conn.query(`CREATE TABLE IF NOT EXISTS creative_intel_serves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    intelId INT NOT NULL,
    clientId INT NOT NULL,
    servedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_client (clientId, servedAt)
  )`);
  console.log("creative_intel_serves ready");

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
