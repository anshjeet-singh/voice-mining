import { useState } from "react";
import { MarkdownDoc } from "@/components/MarkdownDoc";
import { CopyButton } from "@/components/engines";
import { ChevronDown, ChevronUp, FileText, Instagram, Youtube } from "lucide-react";

/**
 * The Competitor Desk: KPIs, reach by source, hook taxonomy, and script-rail
 * piece cards, parsed from the content_intel report's ```json block.
 *
 * SHARED between the operator's Studio Overview and the client portal's
 * Competitor Research tab — the client sees EXACTLY the operator's desk,
 * minus the miner (generation stays operator-side).
 */

export interface IntelReel {
  platform?: "instagram" | "youtube";
  account: string;
  url?: string;
  views: number;
  likes: number;
  comments: number;
  score: number;
  date?: string;
  topic: string;
  hookStyle: string;
  caption?: string;
  /** Full verbatim transcript (newer intel runs; null for captionless YT). */
  transcript?: string | null;
  sections?: Array<{ label: string; text: string; note?: string }>;
  /** 3 plain-language bullets on what made the piece win (newer runs). */
  whyItWorked?: string[];
  /** One-sentence "your next video" suggestion (newer runs). */
  videoIdea?: string;
  angle?: string;
}

/** YT pieces without captions carry packaging analysis, not a transcript. */
function isPackagingOnly(r: IntelReel): boolean {
  return (r.platform ?? "instagram") === "youtube" && !(r.sections ?? []).some((s) => s.label === "Hook");
}

/** The piece's transcript: the dedicated field, else the verbatim sections joined. */
function pieceTranscript(r: IntelReel): string | null {
  if (r.transcript) return r.transcript;
  if (isPackagingOnly(r)) return null;
  const joined = (r.sections ?? []).map((s) => s.text).join("\n\n");
  return joined.trim() ? joined : null;
}

/** Why it worked: the dedicated bullets, else the per-beat analysis notes. */
function whyBullets(r: IntelReel): string[] {
  if (r.whyItWorked?.length) return r.whyItWorked.slice(0, 3);
  return (r.sections ?? [])
    .filter((s) => s.note)
    .slice(0, 3)
    .map((s) => `${s.label}: ${s.note}`);
}

const cleanHandle = (h: string) => h.replace(/^@+/, "");

const fmt = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : String(n);

/** Parse the structured JSON block the intel contract appends to the report. */
export function parseIntelReels(doc: { content: string } | null | undefined): IntelReel[] {
  if (!doc) return [];
  const m = doc.content.match(/```json\s*([\s\S]*?)```/);
  if (!m) return [];
  try {
    const data = JSON.parse(m[1]);
    if (!Array.isArray(data)) return [];
    return data
      .filter((r) => r && typeof r.topic === "string")
      .map((r) => ({
        ...r,
        platform: r.platform === "youtube" ? "youtube" : "instagram",
        views: Number(r.views) || 0,
        likes: Number(r.likes) || 0,
        comments: Number(r.comments) || 0,
        score: Number(r.score) || 0,
      }));
  } catch {
    return [];
  }
}

/** The written report without the machine-readable JSON block at the end. */
export function stripIntelJson(content: string): string {
  return content.replace(/```json[\s\S]*?```/g, "").trim();
}

const INTEL_SORTS = [
  { key: "views", label: "Views" },
  { key: "likes", label: "Likes" },
  { key: "relevance", label: "Relevance" },
  { key: "newest", label: "Newest" },
] as const;
type IntelSort = (typeof INTEL_SORTS)[number]["key"];

const PlatformIcon = ({ platform, className }: { platform?: string; className?: string }) =>
  platform === "youtube" ? <Youtube className={className} /> : <Instagram className={className} />;

/** Read-only expandable view of the written intel report (no operator actions). */
function ReportRow({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border/50 bg-card/30">
      <div className="flex items-center gap-2 px-4 py-3">
        <button className="flex-1 flex items-center gap-2 text-left min-w-0" onClick={() => setOpen(!open)}>
          <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">{title}</span>
        </button>
        <CopyButton text={content} label="Copy" className="flex-shrink-0" />
        <button onClick={() => setOpen(!open)} className="flex-shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      {open && (
        <div className="px-5 pb-5 border-t border-border/40 pt-4">
          <MarkdownDoc content={content} />
        </div>
      )}
    </div>
  );
}

export function IntelDesk({ reels, reportDoc }: { reels: IntelReel[]; reportDoc?: { title: string; content: string } }) {
  const [platform, setPlatform] = useState<"all" | "instagram" | "youtube">("all");
  const [account, setAccount] = useState<string | null>(null);
  const [sort, setSort] = useState<IntelSort>("views");
  const [openReel, setOpenReel] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  if (!reels.length) {
    return reportDoc ? (
      <div>
        <p className="text-[11px] text-muted-foreground mb-2">
          Intel report available (older format, no structured data): view it below. New runs render the full desk.
        </p>
        <ReportRow title={reportDoc.title} content={stripIntelJson(reportDoc.content)} />
      </div>
    ) : null;
  }

  const igCount = reels.filter((r) => (r.platform ?? "instagram") === "instagram").length;
  const ytCount = reels.filter((r) => r.platform === "youtube").length;
  const pool = reels.filter((r) => platform === "all" || (r.platform ?? "instagram") === platform);

  const accounts = Array.from(new Set(pool.map((r) => r.account)));

  const styleAgg = new Map<string, { count: number; views: number }>();
  for (const r of pool) {
    const cur = styleAgg.get(r.hookStyle) ?? { count: 0, views: 0 };
    styleAgg.set(r.hookStyle, { count: cur.count + 1, views: cur.views + r.views });
  }
  const taxonomy = Array.from(styleAgg.entries()).sort((a, b) => b[1].views - a[1].views);

  const sortFn: Record<IntelSort, (a: IntelReel, b: IntelReel) => number> = {
    views: (a, b) => b.views - a.views,
    likes: (a, b) => b.likes - a.likes,
    relevance: (a, b) => b.score - a.score,
    newest: (a, b) => (b.date ?? "").localeCompare(a.date ?? ""),
  };
  const visible = pool.filter((r) => !account || r.account === account).sort(sortFn[sort]);
  const totalViews = pool.reduce((n, r) => n + r.views, 0);
  const topViews = pool.length ? Math.max(...pool.map((r) => r.views)) : 0;

  const reelKey = (r: IntelReel) => `${r.platform ?? "instagram"}:${r.account}:${r.url ?? r.topic}`;

  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
      active ? "bg-foreground text-background border-foreground" : "border-border/50 text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        How to use this: find a winner below, read why it worked, copy the caption, and use the transcript as the base
        for your own version.
      </p>

      {/* Platform tabs + sort */}
      <div className="flex flex-wrap items-center gap-1.5">
        {([
          { key: "all", label: `All (${reels.length})` },
          { key: "instagram", label: `Instagram (${igCount})` },
          { key: "youtube", label: `YouTube (${ytCount})` },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setPlatform(t.key);
              setAccount(null);
            }}
            className={chip(platform === t.key)}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Sort</span>
          {INTEL_SORTS.map((s) => (
            <button key={s.key} onClick={() => setSort(s.key)} className={chip(sort === s.key)}>
              {s.label}
            </button>
          ))}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          { n: String(pool.length), l: "winning pieces" },
          { n: fmt(totalViews), l: "combined views" },
          { n: fmt(topViews), l: "biggest piece" },
        ].map((k) => (
          <div key={k.l} className="rounded-lg border border-border/40 bg-background/40 p-3">
            <p className="text-xl font-semibold text-foreground tabular-nums">{k.n}</p>
            <p className="text-[11px] text-muted-foreground">{k.l}</p>
          </div>
        ))}
        <div className="rounded-lg border border-primary/40 bg-primary/10 p-3">
          <p className="text-sm font-semibold text-primary truncate">{taxonomy[0]?.[0] ?? "-"}</p>
          <p className="text-[11px] text-muted-foreground">winning hook style</p>
        </div>
      </div>

      {/* Hook styles, winning first — which openers this market rewards */}
      {taxonomy.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Hooks that win here:</span>
          {taxonomy.slice(0, 6).map(([style, d], i) => (
            <span
              key={style}
              className={`px-2.5 py-1 rounded-full text-[11px] border ${
                i === 0 ? "border-primary/40 bg-primary/10 text-primary font-semibold" : "border-border/40 text-muted-foreground"
              }`}
            >
              {style} · {d.count}
            </span>
          ))}
        </div>
      )}

      {/* Source filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => setAccount(null)} className={chip(account === null)}>
          All sources
        </button>
        {accounts.map((a) => (
          <button key={a} onClick={() => setAccount(account === a ? null : a)} className={chip(account === a)}>
            @{cleanHandle(a)}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {visible.length} / {pool.length} pieces
        </span>
      </div>

      <div className="space-y-2">
        {visible.map((r, i) => (
          <div key={reelKey(r)} className="rounded-lg border border-border/50 bg-background/40 overflow-hidden">
            <button
              onClick={() => setOpenReel(openReel === reelKey(r) ? null : reelKey(r))}
              className="w-full grid grid-cols-[36px_1fr_auto] gap-3 items-center p-3 text-left hover:bg-card/40"
            >
              <span className={`text-base font-bold text-center tabular-nums ${i === 0 ? "text-primary" : "text-muted-foreground/40"}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-foreground truncate">{r.topic}</span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <PlatformIcon platform={r.platform} className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">
                    @{cleanHandle(r.account)}
                    {r.date ? ` · ${r.date}` : ""} ·{" "}
                    <span className="text-primary">{r.hookStyle}</span> · {r.score}/10
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-4">
                {[
                  { n: fmt(r.views), l: "views" },
                  { n: fmt(r.likes), l: "likes" },
                ].map((st) => (
                  <span key={st.l} className="text-right">
                    <span className="block text-xs font-semibold text-foreground tabular-nums">{st.n}</span>
                    <span className="block text-[9px] uppercase text-muted-foreground">{st.l}</span>
                  </span>
                ))}
                {openReel === reelKey(r) ? (
                  <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </span>
            </button>
            {openReel === reelKey(r) && (
              <div className="border-t border-border/40 bg-card/20 p-5 grid lg:grid-cols-[3fr_2fr] gap-6">
                {/* What to take from it: why it won + the words themselves */}
                <div className="space-y-4">
                  {whyBullets(r).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Why this worked
                      </p>
                      <ul className="space-y-1.5">
                        {whyBullets(r).map((b, bi) => (
                          <li key={bi} className="flex items-start gap-2.5 text-sm text-foreground/90 leading-relaxed">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {pieceTranscript(r) ? (
                    <div className="rounded-xl border border-border/40 bg-background/40 p-4">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Transcript — your starting script
                        </p>
                        <CopyButton text={pieceTranscript(r) ?? ""} label="Copy transcript" />
                      </div>
                      <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{pieceTranscript(r)}</p>
                      <p className="text-[11px] text-muted-foreground mt-3">
                        Don't post it word for word — swap in your story, your numbers, your offer.
                      </p>
                    </div>
                  ) : (
                    (r.sections ?? []).length > 0 && (
                      <div className="rounded-xl border border-border/40 bg-background/40 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          No transcript on this one — here's the packaging
                        </p>
                        <div className="space-y-2">
                          {(r.sections ?? []).map((sec, si) => (
                            <p key={si} className="text-sm text-foreground/90 leading-relaxed">
                              <span className="font-semibold">{sec.label}: </span>
                              {sec.text}
                            </p>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                </div>
                {/* What to do with it */}
                <div className="space-y-3">
                  {(r.videoIdea || r.angle) && (
                    <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-1.5">Your next video</p>
                      <p className="text-sm text-foreground leading-relaxed">{r.videoIdea ?? r.angle}</p>
                    </div>
                  )}
                  {r.caption && (
                    <div className="rounded-xl border border-border/40 bg-background/40 p-4">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Caption</p>
                        <CopyButton text={r.caption} label="Copy caption" />
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{r.caption}</p>
                    </div>
                  )}
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-sm font-medium text-primary underline underline-offset-2"
                    >
                      Watch the original ↗
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {reportDoc && (
        <button
          onClick={() => setShowReport(!showReport)}
          className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {showReport ? "Hide" : "View"} the full written report
        </button>
      )}
      {showReport && reportDoc && <ReportRow title={reportDoc.title} content={stripIntelJson(reportDoc.content)} />}
    </div>
  );
}
