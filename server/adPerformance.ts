/**
 * The performance loop's pure logic: parse a pasted Meta Ads Manager export,
 * match rows to rendered ad filenames, parse per-ad DNA out of a batch doc,
 * and format the MARKET TRUTH section for worker claims. No I/O here.
 */

export interface MetaRow {
  adName: string;
  spend: number | null;
  ctr: number | null;
  cpl: number | null;
}

/** Split one CSV/TSV line respecting double quotes. */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === delim && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const num = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = parseFloat(s.replace(/[$,%\s]/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * Parse a pasted Ads Manager export (CSV or tab-separated). Column names vary
 * by account language/version, so headers are fuzzy-matched: ad name, amount
 * spent, CTR, cost per result/lead.
 */
export function parseMetaCsv(text: string): MetaRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const header = splitLine(lines[0], delim).map((h) => h.toLowerCase());

  const col = (...needles: string[]) =>
    header.findIndex((h) => needles.some((n) => h.includes(n)));
  const nameIdx = col("ad name", "ad_name", "adname");
  if (nameIdx === -1) return [];
  const spendIdx = col("amount spent", "spend");
  const ctrIdx = col("ctr");
  const cplIdx = col("cost per result", "cost per lead", "cost per", "cpl");

  const rows: MetaRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, delim);
    const adName = cells[nameIdx];
    if (!adName) continue;
    rows.push({
      adName,
      spend: spendIdx >= 0 ? num(cells[spendIdx]) : null,
      ctr: ctrIdx >= 0 ? num(cells[ctrIdx]) : null,
      cpl: cplIdx >= 0 ? num(cells[cplIdx]) : null,
    });
  }
  return rows;
}

const canon = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.(png|jpe?g|webp)$/i, "")
    .replace(/[^a-z0-9]+/g, "");

/**
 * Match a Meta ad name to a rendered filename. Operators name Meta ads after
 * the exported files (sometimes with extra prefixes), so canonical-substring
 * containment either way is the match; longest filename wins ties.
 */
export function matchAssetFilename(adName: string, filenames: string[]): string | null {
  const a = canon(adName);
  if (!a) return null;
  let best: string | null = null;
  for (const f of filenames) {
    const c = canon(f);
    if (!c) continue;
    if (a.includes(c) || c.includes(a)) {
      if (!best || c.length > canon(best).length) best = f;
    }
  }
  return best;
}

export interface AdSpec {
  format?: string;
  reference?: string;
  subAvatar?: string;
  angle?: string;
  awareness?: string;
  hookCategory?: string;
  copyPrimary?: string;
  copyHeadline?: string;
  copyDescription?: string;
}

const SPEC_LABELS: Array<[keyof AdSpec, RegExp]> = [
  ["format", /^\*{0,2}format\*{0,2}\s*[:—-]\s*(.+)$/i],
  ["reference", /^\*{0,2}reference\*{0,2}\s*[:—-]\s*(.+)$/i],
  ["subAvatar", /^\*{0,2}sub[- ]?avatar\*{0,2}\s*[:—-]\s*(.+)$/i],
  ["angle", /^\*{0,2}angle\*{0,2}\s*[:—-]\s*(.+)$/i],
  ["awareness", /^\*{0,2}awareness(?:\s+level)?\*{0,2}\s*[:—-]\s*(.+)$/i],
  ["hookCategory", /^\*{0,2}hook(?:\s+category|\s+archetype)?\*{0,2}\s*[:—-]\s*(.+)$/i],
  ["copyPrimary", /^\*{0,2}primary\s+text\*{0,2}\s*[:—-]\s*(.+)$/i],
  ["copyHeadline", /^\*{0,2}headline\*{0,2}\s*[:—-]\s*(.+)$/i],
  ["copyDescription", /^\*{0,2}description\*{0,2}\s*[:—-]\s*(.+)$/i],
];

/**
 * Parse each ad's DNA from the batch doc: the doc names each filename, and
 * labeled spec lines follow it. Best-effort — a miss just leaves nulls.
 */
export function parseAdSpecs(doc: string, filenames: string[]): Record<string, AdSpec> {
  const out: Record<string, AdSpec> = {};
  if (!doc || !filenames.length) return out;
  // Slice the doc into per-ad chunks at each filename mention, in doc order.
  const positions = filenames
    .map((f) => ({ f, at: doc.indexOf(f) }))
    .filter((p) => p.at >= 0)
    .sort((a, b) => a.at - b.at);
  for (let i = 0; i < positions.length; i++) {
    const { f, at } = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1].at : Math.min(doc.length, at + 6000);
    const chunk = doc.slice(at, end);
    const spec: AdSpec = {};
    for (const rawLine of chunk.split("\n")) {
      const line = rawLine.replace(/^[-*•]\s*/, "").trim();
      for (const [key, re] of SPEC_LABELS) {
        if (spec[key]) continue;
        const m = line.match(re);
        if (m) spec[key] = m[1].replace(/\*+/g, "").trim().slice(0, key === "copyPrimary" ? 980 : 380);
      }
    }
    if (Object.keys(spec).length) out[f] = spec;
  }
  return out;
}

export interface PerformanceAsset {
  filename: string;
  status: string;
  metaSpend: number | null;
  metaCtr: number | null;
  metaCpl: number | null;
  format?: string | null;
  hookCategory?: string | null;
  awareness?: string | null;
  subAvatar?: string | null;
}

/**
 * Which catalog references actually produce winners: group the client's ads
 * by their declared reference and average the real CTR of each group. The
 * render session reads this to lean on winner-backed references and treat
 * loser-backed ones as radioactive. Returns "" without performance data.
 */
export function formatReferencePerformance(
  assets: Array<{ reference?: string | null; metaCtr: number | null; filename: string }>
): string {
  const groups = new Map<string, number[]>();
  for (const a of assets) {
    if (!a.reference || a.metaCtr == null) continue;
    groups.set(a.reference, [...(groups.get(a.reference) ?? []), a.metaCtr]);
  }
  if (!groups.size) return "";
  const rows = Array.from(groups.entries()).map(([ref, ctrs]) => ({
    ref,
    n: ctrs.length,
    avg: ctrs.reduce((s, c) => s + c, 0) / ctrs.length,
  }));
  rows.sort((a, b) => b.avg - a.avg);
  const overall = rows.reduce((s, r) => s + r.avg * r.n, 0) / rows.reduce((s, r) => s + r.n, 0);
  return rows
    .map(
      (r) =>
        `- ${r.ref}: ${r.n} ad${r.n > 1 ? "s" : ""} with results, avg CTR ${r.avg.toFixed(2)}% — ${
          r.avg >= overall ? "WINNER-BACKED (lean on this reference)" : "UNDERPERFORMING (avoid unless varying a proven winner)"
        }`
    )
    .join("\n");
}

/**
 * The MARKET TRUTH claim section: real spend results per ad, best CTR first.
 * Returns "" when no ad has performance data yet.
 */
export function formatMarketTruth(assets: PerformanceAsset[]): string {
  const withData = assets.filter((a) => a.metaSpend != null || a.metaCtr != null || a.metaCpl != null);
  if (!withData.length) return "";
  withData.sort((a, b) => (b.metaCtr ?? -1) - (a.metaCtr ?? -1));
  const lines = withData.map((a) => {
    const bits = [
      a.metaSpend != null ? `spent $${a.metaSpend}` : null,
      a.metaCtr != null ? `CTR ${a.metaCtr}%` : null,
      a.metaCpl != null ? `CPL $${a.metaCpl}` : null,
      a.format ? `format: ${a.format}` : null,
      a.hookCategory ? `hook: ${a.hookCategory}` : null,
      a.awareness ? `awareness: ${a.awareness}` : null,
      a.subAvatar ? `avatar: ${a.subAvatar}` : null,
    ].filter(Boolean);
    return `- ${a.filename} (${a.status}): ${bits.join(", ")}`;
  });
  return lines.join("\n");
}
