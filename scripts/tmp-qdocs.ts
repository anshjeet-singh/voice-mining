import mysql from "mysql2/promise";
async function main() {
  const c = await mysql.createConnection(process.env.DATABASE_URL!);
  const [docs] = await c.query(
    "SELECT id, docType, title, LEFT(content, 80) preview FROM client_documents WHERE clientId = 2 AND docType IN ('funnel_asset_extra','ad_scripts_extra','video_scripts') ORDER BY id DESC LIMIT 5"
  );
  console.log(JSON.stringify(docs, null, 1));
  await c.end();
}
main();
