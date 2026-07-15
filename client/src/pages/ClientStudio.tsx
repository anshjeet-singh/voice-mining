import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { AppShell } from "@/components/AppShell";
import {
  AssetGallery,
  CopyButton,
  DocBoard,
  DocSections,
  ENGINES,
  EngineCard,
  PrebuiltSequences,
  RefImagePanel,
  type ClientAssetMeta,
  type ClientDoc,
  type RefImageMeta,
  type StageJob,
} from "@/components/engines";
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clapperboard,
  FileText,
  Image,
  Instagram,
  Loader2,
  Mail,
  MonitorPlay,
  Pickaxe,
  Plus,
  Sparkles,
  Users,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/** Studio sections with their color identities (literal classes for Tailwind JIT). */
const SECTIONS = [
  {
    id: "overview", label: "Overview", icon: Sparkles,
    text: "text-foreground", chip: "bg-card/60",
    wash: "", tile: "border-border/50 bg-card/30 hover:border-primary/40",
  },
  {
    id: "ads", label: "Ads Engine", icon: Image,
    text: "text-violet-400", chip: "bg-violet-500/15",
    wash: "bg-gradient-to-b from-violet-500/[0.07] via-transparent to-violet-500/[0.05]", tile: "border-violet-500/25 bg-violet-500/[0.06] hover:border-violet-400/50",
  },
  {
    id: "shortform", label: "Short-Form Content", icon: MonitorPlay,
    text: "text-pink-400", chip: "bg-pink-500/15",
    wash: "bg-gradient-to-b from-pink-500/[0.07] via-transparent to-pink-500/[0.05]", tile: "border-pink-500/25 bg-pink-500/[0.06] hover:border-pink-400/50",
  },
  {
    id: "youtube", label: "YouTube Content", icon: Youtube,
    text: "text-red-400", chip: "bg-red-500/15",
    wash: "bg-gradient-to-b from-red-500/[0.07] via-transparent to-red-500/[0.05]", tile: "border-red-500/25 bg-red-500/[0.06] hover:border-red-400/50",
  },
  {
    id: "funnel", label: "Funnel", icon: Clapperboard,
    text: "text-sky-400", chip: "bg-sky-500/15",
    wash: "bg-gradient-to-b from-sky-500/[0.07] via-transparent to-sky-500/[0.05]", tile: "border-sky-500/25 bg-sky-500/[0.06] hover:border-sky-400/50",
  },
  {
    id: "emails", label: "Email Engine", icon: Mail,
    text: "text-emerald-400", chip: "bg-emerald-500/15",
    wash: "bg-gradient-to-b from-emerald-500/[0.07] via-transparent to-emerald-500/[0.05]", tile: "border-emerald-500/25 bg-emerald-500/[0.06] hover:border-emerald-400/50",
  },
  {
    id: "skool", label: "Skool Engine", icon: Users,
    text: "text-amber-400", chip: "bg-amber-500/15",
    wash: "bg-gradient-to-b from-amber-500/[0.07] via-transparent to-amber-500/[0.05]", tile: "border-amber-500/25 bg-amber-500/[0.06] hover:border-amber-400/50",
  },
] as const;

const sectionById = (id: string) => SECTIONS.find((sc) => sc.id === id)!;

type SectionId = (typeof SECTIONS)[number]["id"];

const engineByKind = (kind: string) => ENGINES.find((e) => e.kind === kind)!;

/** A titled studio block, optionally carrying the section's color identity. */
function StudioBlock({
  title,
  hint,
  children,
  frame,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  frame?: string;
}) {
  return (
    <div className={`rounded-xl border p-5 ${frame || "border-border/50 bg-card/30"}`}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** Section header with the engine's color identity. */
function SectionHeader({ id }: { id: string }) {
  const sec = sectionById(id);
  const Icon = sec.icon;
  return (
    <div className="flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${sec.chip}`}>
        <Icon className={`w-4.5 h-4.5 ${sec.text}`} />
      </div>
      <h1 className="text-lg font-semibold text-foreground">{sec.label}</h1>
    </div>
  );
}

/** Readable doc row for the foundation/community/campaign libraries: copy, copy
 *  a single section, edit inline, and preview. Editable when `invalidate` is set. */
function DocRow({ doc, invalidate }: { doc: ClientDoc; invalidate?: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.content);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMsg, setAiMsg] = useState("");
  const save = trpc.clients.updateDocument.useMutation({
    onSuccess: () => {
      invalidate?.();
      setEditing(false);
      toast.success("Saved");
    },
    onError: (err) => toast.error(err.message),
  });
  const aiEdit = trpc.clients.aiEditDocument.useMutation({
    onSuccess: () => {
      invalidate?.();
      setAiOpen(false);
      setAiMsg("");
      toast.success("Updated");
    },
    onError: (err) => toast.error(err.message),
  });
  return (
    <div className="rounded-lg border border-border/40 bg-card/30">
      <div className="w-full flex items-center gap-2 p-2.5">
        <button onClick={() => setOpen(!open)} className="flex-1 flex items-center gap-2 text-left min-w-0">
          <FileText className="w-3 h-3 text-primary flex-shrink-0" />
          <span className="flex-1 text-xs font-medium text-foreground truncate">{doc.title}</span>
        </button>
        {invalidate && !editing && !aiOpen && (
          <>
            <button
              onClick={() => {
                setAiOpen(true);
                setOpen(true);
              }}
              className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 px-1.5"
            >
              <Sparkles className="w-3 h-3" />
              AI
            </button>
            <button
              onClick={() => {
                setDraft(doc.content);
                setEditing(true);
                setOpen(true);
              }}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground px-1.5"
            >
              Edit
            </button>
          </>
        )}
        <CopyButton text={doc.content} />
        <button onClick={() => setOpen(!open)}>
          {open ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
        </button>
      </div>
      {open && (
        <div className="px-2.5 pb-2.5 space-y-3">
          {aiOpen ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Tell the AI what to change in this document</span>
              </div>
              <textarea
                value={aiMsg}
                onChange={(e) => setAiMsg(e.target.value)}
                rows={4}
                placeholder="e.g. Swap the tagline for: [paste it]. Rewrite the About page as a value stack with dollar anchors. Keep the VSL script."
                className="w-full resize-none rounded-lg border border-border/50 bg-background/60 p-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={aiEdit.isPending || !aiMsg.trim()}
                  onClick={() => aiEdit.mutate({ id: doc.id, feedback: aiMsg.trim() })}
                  className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {aiEdit.isPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1.5" />}
                  {aiEdit.isPending ? "Rewriting this doc..." : "Rewrite this doc"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAiOpen(false);
                    setAiMsg("");
                  }}
                  className="h-7 text-xs"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : editing ? (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full min-h-[24rem] resize-y rounded-lg border border-border/50 bg-background/60 p-3 text-[11px] font-mono leading-relaxed text-foreground focus:outline-none focus:border-primary/50"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={save.isPending || !draft.trim()}
                  onClick={() => save.mutate({ id: doc.id, content: draft })}
                  className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {save.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setDraft(doc.content);
                  }}
                  className="h-7 text-xs"
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <DocSections content={doc.content} title={doc.title} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Intel Desk ───────────────────────────────────────────────────────────────

interface IntelReel {
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
  sections?: Array<{ label: string; text: string; note?: string }>;
  angle?: string;
}

/** A competitor account the miner can scrape, tagged with where we found it. */
interface CompetitorSource {
  platform: "instagram" | "youtube";
  handle: string;
  url: string;
  origin: "research" | "onboarding" | "added";
  /** Resolved channel name for raw YouTube channel ids. */
  label?: string;
}

/** Chip text: resolved channel names beat raw UC... ids, and never a double @. */
const srcDisplay = (s: CompetitorSource) =>
  s.label ?? (/^UC[A-Za-z0-9_-]{10,}$/.test(s.handle) ? "YouTube channel" : `@${cleanHandle(s.handle)}`);

const srcKey = (s: CompetitorSource) => `${s.platform}:${s.handle}`;

const fmt = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : String(n);

/** Parse the structured JSON block the intel contract appends to the report. */
function parseIntelReels(doc: ClientDoc | undefined): IntelReel[] {
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
function stripIntelJson(doc: ClientDoc): ClientDoc {
  return { ...doc, content: doc.content.replace(/```json[\s\S]*?```/g, "").trim() };
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

/** The Competitor Desk: KPIs, reach, hook taxonomy, script-rail piece cards. */
function IntelDesk({ reels, reportDoc }: { reels: IntelReel[]; reportDoc?: ClientDoc }) {
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
        <DocRow doc={stripIntelJson(reportDoc)} />
      </div>
    ) : null;
  }

  const igCount = reels.filter((r) => (r.platform ?? "instagram") === "instagram").length;
  const ytCount = reels.filter((r) => r.platform === "youtube").length;
  const pool = reels.filter((r) => platform === "all" || (r.platform ?? "instagram") === platform);

  const accounts = Array.from(new Set(pool.map((r) => r.account)));
  const byAccount = accounts
    .map((a) => ({ account: a, views: pool.filter((r) => r.account === a).reduce((n, r) => n + r.views, 0) }))
    .sort((a, b) => b.views - a.views);
  const maxAcc = byAccount[0]?.views || 1;

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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {[
          { n: String(pool.length), l: "pieces analyzed" },
          { n: String(accounts.length), l: "sources" },
          { n: fmt(totalViews), l: "combined views" },
          { n: fmt(topViews), l: "top piece" },
        ].map((k) => (
          <div key={k.l} className="rounded-lg border border-border/40 bg-background/40 p-3">
            <p className="text-xl font-semibold text-foreground tabular-nums">{k.n}</p>
            <p className="text-[10px] text-muted-foreground">{k.l}</p>
          </div>
        ))}
        <div className="rounded-lg border border-primary/40 bg-primary/10 p-3">
          <p className="text-sm font-semibold text-primary truncate">{taxonomy[0]?.[0] ?? "-"}</p>
          <p className="text-[10px] text-muted-foreground">winning hook style</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        {/* Reach by source */}
        <div className="rounded-lg border border-border/40 bg-background/40 p-3">
          <p className="text-[11px] font-semibold text-foreground mb-2">Reach by source</p>
          <div className="space-y-1.5">
            {byAccount.map((a, i) => (
              <div key={a.account} className="grid grid-cols-[110px_1fr_56px] gap-2 items-center">
                <span className="text-[11px] text-muted-foreground truncate">@{cleanHandle(a.account)}</span>
                <div className="h-4 rounded bg-card/60 overflow-hidden">
                  <div
                    className={`h-full rounded ${i === 0 ? "bg-primary" : "bg-foreground/30"}`}
                    style={{ width: `${(a.views / maxAcc) * 100}%` }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground text-right tabular-nums">{fmt(a.views)}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Hook taxonomy */}
        <div className="rounded-lg border border-border/40 bg-background/40 p-3">
          <p className="text-[11px] font-semibold text-foreground mb-2">Hook taxonomy (by combined views)</p>
          <div className="space-y-1.5">
            {taxonomy.map(([style, d], i) => (
              <div
                key={style}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
                  i === 0 ? "border-primary/40 bg-primary/10" : "border-border/40"
                }`}
              >
                <span className="text-[11px] font-medium text-foreground">{style}</span>
                {i === 0 && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                    winning
                  </span>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                  {d.count} piece{d.count > 1 ? "s" : ""} · {fmt(d.views)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

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
                {/* Script rail */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    {(r.platform ?? "instagram") === "youtube" && !(r.sections ?? []).some((s) => s.label === "Hook")
                      ? "Packaging breakdown"
                      : "Script breakdown"}
                  </p>
                  <div className="relative pl-5 space-y-4 before:absolute before:left-[5px] before:top-2 before:bottom-2 before:w-px before:bg-border">
                    {(r.sections ?? []).map((sec, si) => (
                      <div key={si} className="relative">
                        <span
                          className={`absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full border-2 ${
                            sec.label === "Hook"
                              ? "bg-primary border-primary"
                              : sec.label === "CTA"
                                ? "bg-foreground border-foreground"
                                : "bg-background border-muted-foreground"
                          }`}
                        />
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
                          {sec.label}
                          {sec.note && (
                            <span className="normal-case tracking-normal font-normal italic text-muted-foreground"> · {sec.note}</span>
                          )}
                        </p>
                        <p className="text-xs text-foreground/90 leading-relaxed mt-0.5">{sec.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Angle + caption */}
                <div className="space-y-3">
                  {r.angle && (
                    <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1.5">Your angle: the gap they left open</p>
                      <p className="text-xs text-foreground leading-relaxed">{r.angle}</p>
                    </div>
                  )}
                  {r.caption && (
                    <div className="rounded-xl border border-border/40 bg-background/40 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Caption</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{r.caption}</p>
                    </div>
                  )}
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-[11px] font-medium text-primary underline underline-offset-2"
                    >
                      Open the original ↗
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
      {showReport && reportDoc && <DocRow doc={stripIntelJson(reportDoc)} />}
    </div>
  );
}

/** Turn whatever the operator pastes (URLs, @handles, comma lists) into sources. */
function parseSourceInput(raw: string): CompetitorSource[] {
  const out: CompetitorSource[] = [];
  for (const token of raw.split(/[\s,]+/).filter(Boolean)) {
    let m = token.match(/youtube\.com\/(@[A-Za-z0-9._-]{2,30})/i);
    if (m) {
      const h = m[1].slice(1).toLowerCase();
      out.push({ platform: "youtube", handle: h, url: `https://youtube.com/@${h}`, origin: "added" });
      continue;
    }
    m = token.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{10,})/i);
    if (m) {
      out.push({ platform: "youtube", handle: m[1], url: `https://youtube.com/channel/${m[1]}`, origin: "added" });
      continue;
    }
    m = token.match(/youtube\.com\/(?:c|user)\/([A-Za-z0-9._-]{2,30})/i);
    if (m) {
      const h = m[1].toLowerCase();
      out.push({ platform: "youtube", handle: h, url: `https://youtube.com/@${h}`, origin: "added" });
      continue;
    }
    m = token.match(/instagram\.com\/([A-Za-z0-9._]{2,30})/i);
    if (m) {
      const h = m[1].toLowerCase();
      out.push({ platform: "instagram", handle: h, url: `https://instagram.com/${h}`, origin: "added" });
      continue;
    }
    // Bare @handle or handle: instagram by default
    m = token.match(/^@?([A-Za-z0-9._]{2,30})$/);
    if (m) {
      const h = m[1].toLowerCase();
      out.push({ platform: "instagram", handle: h, url: `https://instagram.com/${h}`, origin: "added" });
    }
  }
  return out;
}

const ORIGIN_LABEL: Record<CompetitorSource["origin"], string> = {
  research: "URL found · voice mining",
  onboarding: "URL found · onboarding",
  added: "added by you",
};

/** The miner: pick which competitor sources to scrape, then hit Mine. */
function CompetitorMiner({
  found,
  job,
  clientId,
  invalidate,
}: {
  found: CompetitorSource[];
  job: StageJob;
  clientId: number;
  invalidate: () => void;
}) {
  const [added, setAdded] = useState<CompetitorSource[]>([]);
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [input, setInput] = useState("");

  const all = [...found, ...added.filter((a) => !found.some((f) => srcKey(f) === srcKey(a)))];
  const selected = all.filter((s) => !deselected.has(srcKey(s)));

  const generate = trpc.clients.generateStage.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Mining queued. Your Mac worker will pick it up");
    },
    onError: (err) => toast.error(err.message),
  });
  const status = job?.status ?? null;
  const busy = status === "queued" || status === "running";

  const toggle = (s: CompetitorSource) =>
    setDeselected((prev) => {
      const next = new Set(prev);
      const k = srcKey(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const addFromInput = () => {
    const parsed = parseSourceInput(input);
    if (!parsed.length) {
      toast.error("Paste Instagram or YouTube URLs, or @handles");
      return;
    }
    setAdded((prev) => [...prev, ...parsed.filter((p) => !prev.some((x) => srcKey(x) === srcKey(p)) && !found.some((f) => srcKey(f) === srcKey(p)))]);
    setInput("");
  };

  const mine = () => {
    const ig = selected.filter((s) => s.platform === "instagram").map((s) => s.handle);
    const yt = selected
      .filter((s) => s.platform === "youtube")
      .map((s) => (s.handle.startsWith("UC") ? s.handle : `@${s.handle}`));
    const request =
      `Run competitor content intel.` +
      (ig.length ? ` INSTAGRAM accounts: ${ig.join(", ")}.` : "") +
      (yt.length ? ` YOUTUBE channels: ${yt.join(", ")}.` : "") +
      ` Mine DEEP on every source: 10 reels per Instagram account blending its top performers with its newest posts, and 10 recent long-form videos per YouTube channel.` +
      ` If the total source count is under 10, DISCOVER more top competitors in this niche (research report competitor intel + web search) until you have at least 10 sources across both platforms, and mine those too.`;
    generate.mutate({ clientId, stage: "content_intel", feedback: request });
  };

  if (busy) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/20 p-4 flex items-center gap-2.5">
        <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold text-foreground">Mining competitor content</p>
          <p className="text-[11px] text-muted-foreground">
            {status === "queued" ? "Waiting for your Mac worker" : job?.progress || "Scraping and transcribing..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/40 bg-card/20 p-4">
      {all.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {all.map((s) => {
            const on = !deselected.has(srcKey(s));
            return (
              <button
                key={srcKey(s)}
                onClick={() => toggle(s)}
                title={`${s.url} · ${ORIGIN_LABEL[s.origin]}`}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
                  on ? "border-primary/40 bg-primary/10" : "border-border/40 bg-card/40 opacity-45 hover:opacity-80"
                }`}
              >
                <PlatformIcon platform={s.platform} className={`w-3.5 h-3.5 flex-shrink-0 ${on ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-[11px] font-medium text-foreground leading-tight">{srcDisplay(s)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground mb-3">
          No competitor URLs found in the research or onboarding yet. Paste them below.
        </p>
      )}

      <div className="flex items-center gap-2 mb-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addFromInput()}
          placeholder="Paste Instagram / YouTube URLs or @handles..."
          className="flex-1 h-8 rounded-lg border border-border/40 bg-background/40 px-2.5 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
        />
        <Button size="sm" variant="outline" onClick={addFromInput} className="h-8 text-xs">
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
      </div>

      <Button
        size="sm"
        disabled={generate.isPending || selected.length === 0}
        onClick={mine}
        className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs"
      >
        {generate.isPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Pickaxe className="w-3.5 h-3.5 mr-1.5" />}
        Mine {selected.length} source{selected.length === 1 ? "" : "s"}
      </Button>
      {status === "failed" && job?.error && (
        <p className="mt-2 text-[11px] text-destructive">Last run failed: {job.error.slice(0, 200)}</p>
      )}
    </div>
  );
}

// ─── The Studio ───────────────────────────────────────────────────────────────

/** Scraped accounts sometimes arrive with their own @: never render @@. */
const cleanHandle = (h: string) => h.replace(/^@+/, "");

/**
 * Sub-avatars from the ICP doc as { name, hint } where the hint says who they
 * actually are (occupation, income, situation). Reads the '## Sub-Avatars'
 * section's child headings and 'Sub-Avatar N: Name' headings, splitting a name
 * from its descriptor on the first dash/colon; when the heading is a bare name,
 * the descriptor comes from the first substantive line of the section body.
 */
interface Avatar {
  name: string;
  hint?: string;
}
// Field labels that live UNDER an avatar (never avatar names themselves).
const AVATAR_FIELD_LABEL =
  /^(pains?|pain\s*points?|desires?|dream\s*outcomes?|objections?|awareness(\s*level)?|situation|profile|snapshot|who\s+they\s+are|demographics?|psychographics?|goals?|fears?|frustrations?|triggers?|beliefs?|context)$/i;
function parseSubAvatars(doc?: ClientDoc): Avatar[] {
  if (!doc) return [];
  const tidy = (s: string) => s.replace(/\*\*/g, "").replace(/[:.]\s*$/, "").trim();
  const splitNameHint = (raw: string): Avatar => {
    const t = tidy(raw);
    const m = t.match(/^(.{2,40}?)\s*[—–:\-(]\s*(.+?)\)?$/);
    if (m) return { name: tidy(m[1]).slice(0, 40), hint: tidy(m[2]).slice(0, 72) };
    return { name: t.slice(0, 40) };
  };
  const out: Avatar[] = [];
  const lines = doc.content.split("\n");
  let inSection = false;
  let sectionLevel = 0;
  // Once we descend into an avatar's OWN subsection, its body bullets are
  // Pains/Desires/Objections — NOT more avatars. Stop bullet-parsing there.
  let inAvatarBody = false;
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      if (/sub[- ]?avatars?\b/i.test(text) && !/^sub[- ]?avatar\s*\d/i.test(text)) {
        inSection = true;
        sectionLevel = level;
        inAvatarBody = false;
        continue;
      }
      if (inSection && level <= sectionLevel) {
        inSection = false;
        inAvatarBody = false;
      }
      const named = text.match(/^(?:sub[- ]?)?avatar\s*\d*\s*[:–-]\s*(.+)$/i);
      if (named || (inSection && level > sectionLevel)) {
        const av = splitNameHint(named ? named[1] : text);
        if (!av.hint) {
          for (let j = i + 1; j < lines.length && j < i + 8; j++) {
            if (/^#{1,4}\s/.test(lines[j])) break;
            const body = lines[j].replace(/^[-*\d.\s]+/, "").replace(/\*\*/g, "").trim();
            if (body.length > 12) {
              av.hint = body.replace(/^(who they are|profile|snapshot)[:\s]+/i, "").split(/(?<=[.!?])\s/)[0].slice(0, 72);
              break;
            }
          }
        }
        out.push(av);
        // a heading inside the section = an avatar's own subsection begins
        if (inSection && level > sectionLevel) inAvatarBody = true;
      }
    } else if (inSection && !inAvatarBody) {
      // avatars listed as top-level bold bullets directly under '## Sub-Avatars'
      const bullet = lines[i].match(/^\s*(?:[-*]|\d+\.)\s+\*\*([^*]+)\*\*\s*[:—–-]?\s*(.*)$/);
      if (bullet) out.push({ name: tidy(bullet[1]).slice(0, 40), hint: bullet[2] ? tidy(bullet[2]).slice(0, 72) : undefined });
    }
  }
  const seen = new Set<string>();
  return out
    .filter((a) => a.name && !AVATAR_FIELD_LABEL.test(a.name.trim()) && !seen.has(a.name) && seen.add(a.name))
    .slice(0, 6);
}

/**
 * The Overview AI box: the operator tells the worker what to fix in the
 * foundation (a missing avatar, a sharper offer, a positioning tweak) and it
 * requeues the foundation stage with that note. This is how you correct the
 * ICP/offers/brand without leaving the Overview.
 */
// Copy/script doc-sets the AI can rewrite with feedback. NOT the rendered ad
// creatives — those live on the reject button in the Ads engine.
const AI_TARGETS = [
  { key: "foundation", label: "Foundation" }, // ICP, Offers, Brand, Course
  { key: "skool", label: "Skool" }, // Free + Paid community
  { key: "emails", label: "Emails" },
  { key: "more_scripts", label: "Ad scripts" },
  { key: "more_content_ig", label: "Short-Form" },
  { key: "more_content_yt", label: "YouTube" },
  { key: "more_landers", label: "Funnel" },
] as const;
type AiTarget = (typeof AI_TARGETS)[number]["key"];

// Prefix that forces the worker to distill a systemic preference into
// worker/learnings/<skill>.md so it applies to EVERY future client, not just this one.
const PERMANENT_RULE_PREFIX =
  "[PERMANENT RULE — this is a SYSTEMIC operator preference that is true for EVERY client, not just this one (e.g. formatting, structure, voice). You MUST distill it into craft_lessons.md for the relevant skill so it is applied on all future runs.]\n\n";

function FoundationRefine({
  clientId,
  invalidate,
  jobs,
}: {
  clientId: number;
  invalidate: () => void;
  jobs: Record<string, { status?: string | null; progress?: string | null } | null>;
}) {
  const [target, setTarget] = useState<AiTarget>("foundation");
  const [msg, setMsg] = useState("");
  const [teach, setTeach] = useState(false);
  const gen = trpc.clients.generateStage.useMutation({
    onSuccess: () => {
      invalidate();
      setMsg("");
      toast.success(teach ? "On it, and I'll teach this to every future build" : "On it. Cashflow Coaches AI is updating that set");
      setTeach(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const job = jobs[target];
  const busy = job?.status === "queued" || job?.status === "running" || gen.isPending;
  return (
    <div className="rounded-xl border border-primary/25 bg-gradient-to-r from-primary/[0.07] to-transparent p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </div>
        <p className="text-sm font-semibold text-foreground">Cashflow Coaches AI</p>
      </div>
      {busy ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground">
            {job?.status === "queued" || gen.isPending ? "Queued, waiting for your Mac worker" : job?.progress || "Working on it..."}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
            <span className="text-[11px] text-muted-foreground mr-0.5">Update</span>
            {AI_TARGETS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTarget(t.key)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  target === t.key
                    ? "bg-primary/20 text-primary border border-primary/40"
                    : "bg-card/60 text-muted-foreground border border-border/40 hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            rows={3}
            placeholder="Tell the AI what to fix, update, or create..."
            className="w-full resize-none rounded-lg border border-border/50 bg-background/50 p-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50"
          />
          <label className="mt-2 flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={teach} onChange={() => setTeach((v) => !v)} className="w-3.5 h-3.5 accent-primary cursor-pointer" />
            <span className="text-[11px] text-muted-foreground">
              Make this a <span className="text-foreground font-medium">permanent rule</span> for every future build (not just this client)
            </span>
          </label>
          <button
            disabled={!msg.trim()}
            onClick={() => gen.mutate({ clientId, stage: target, feedback: (teach ? PERMANENT_RULE_PREFIX : "") + msg.trim() })}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-primary/90 px-5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3 h-3" />
            Create
          </button>
        </>
      )}
    </div>
  );
}

/** The client's own live follower/subscriber counts, with inline handle setup. */
function ClientSocials({
  clientId,
  client,
  invalidate,
}: {
  clientId: number;
  client: { instagramHandle?: string | null; youtubeHandle?: string | null };
  invalidate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [ig, setIg] = useState(client.instagramHandle ?? "");
  const [yt, setYt] = useState(client.youtubeHandle ?? "");
  const hasHandles = !!(client.instagramHandle || client.youtubeHandle);

  const stats = trpc.clients.socialStats.useQuery({ clientId }, { enabled: hasHandles, staleTime: 60 * 60 * 1000 });
  const save = trpc.clients.setSocials.useMutation({
    onSuccess: () => {
      invalidate();
      setEditing(false);
      stats.refetch();
      toast.success("Socials saved");
    },
    onError: (err) => toast.error(err.message),
  });

  // Handles are captured at onboarding: the Overview only shows the live stats
  // once they exist, no "add" prompt cluttering the page.
  if (!hasHandles && !editing) return null;

  if (editing) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/30 p-4 space-y-2.5">
        <p className="text-sm font-semibold text-foreground">Client socials</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-2.5">
            <Instagram className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input
              value={ig}
              onChange={(e) => setIg(e.target.value)}
              placeholder="instagram handle or URL"
              className="flex-1 h-9 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-2.5">
            <Youtube className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input
              value={yt}
              onChange={(e) => setYt(e.target.value)}
              placeholder="youtube @handle or URL"
              className="flex-1 h-9 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={() => save.mutate({ clientId, instagramHandle: ig, youtubeHandle: yt })}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-7 text-xs"
          >
            {save.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 text-xs">
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-foreground">Client socials</p>
        <button onClick={() => setEditing(true)} className="text-[11px] text-muted-foreground hover:text-foreground">
          Edit
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {(stats.data ?? []).map((s) => (
          <a
            key={s.platform}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-border/40 bg-background/40 p-3 flex items-center gap-3 hover:border-border transition-colors"
          >
            {s.platform === "youtube" ? (
              <Youtube className="w-5 h-5 text-red-400 flex-shrink-0" />
            ) : (
              <Instagram className="w-5 h-5 text-pink-400 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">@{cleanHandle(s.handle)}</p>
              {s.error ? (
                <p className="text-[10px] text-muted-foreground">Couldn't load ({s.error})</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  <span className="text-foreground font-semibold tabular-nums">{fmt(s.followers ?? 0)}</span>{" "}
                  {s.platform === "youtube" ? "subscribers" : "followers"}
                  {s.posts != null && ` · ${fmt(s.posts)} posts`}
                  {s.extra != null && s.extraLabel && ` · ${fmt(s.extra)} ${s.extraLabel}`}
                </p>
              )}
            </div>
          </a>
        ))}
        {stats.isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground p-3">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-[11px]">Loading live stats...</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Stage documents live with their engines; only Foundation stays on Overview. */
const FOUNDATION_DOC_TYPES = ["icp_snapshot", "offers", "brand_positioning", "course_outline"];
const SKOOL_DOC_TYPES = ["skool_free_community", "skool_paid_community", "skool_lead_magnets"];
const EMAIL_DOC_TYPES = ["email_sequence_14day", "email_postbooking", "email_noshow_followup", "email_prewebinar", "email_postwebinar", "sms_set"];
const ADS_DOC_TYPES = ["ad_scripts", "ad_statics", "ad_campaign_plan"];

export default function ClientStudio() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [section, setSection] = useState<SectionId>("overview");

  const { data, isLoading } = trpc.clients.get.useQuery(
    { id: clientId },
    { enabled: Number.isInteger(clientId) && clientId > 0 }
  );

  const jobs = (data?.jobs ?? {}) as Record<string, StageJob>;
  const documents = (data?.documents ?? []) as ClientDoc[];
  const assets = (data?.assets ?? []) as ClientAssetMeta[];
  const refImages = (data?.refImages ?? []) as RefImageMeta[];
  const competitorSources = (data?.competitorSources ?? []) as CompetitorSource[];
  const researchReportId = data?.researchReportId ?? null;

  const hasActiveJob = Object.values(jobs).some((j) => j?.status === "queued" || j?.status === "running");
  useEffect(() => {
    if (!hasActiveJob) return;
    const t = setInterval(() => utils.clients.get.invalidate({ id: clientId }), 5000);
    return () => clearInterval(t);
  }, [hasActiveJob, clientId, utils]);

  const invalidate = () => utils.clients.get.invalidate({ id: clientId });

  const docsFor = (docType: string) => documents.filter((d) => d.docType === docType);
  const approvedAds = useMemo(() => assets.filter((a) => a.status === "approved"), [assets]);
  const intelDoc = docsFor("content_intel_extra").sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )[0];
  const intelReels = useMemo(() => parseIntelReels(intelDoc), [intelDoc]);
  const avatars = useMemo(() => parseSubAvatars(documents.find((d) => d.docType === "icp_snapshot")), [documents]);

  const engineDocCount = ENGINES.reduce((n, e) => n + docsFor(e.docType).length, 0);
  const postedCount = documents.filter((d) => d.docType.endsWith("_extra") && d.status === "posted").length;
  const emailCount =
    docsFor("emails_extra").length +
    ["email_sequence_14day", "email_postbooking", "email_noshow_followup", "email_prewebinar", "email_postwebinar", "sms_set"].reduce(
      (n, t) => n + docsFor(t).length,
      0
    );

  if (isLoading || !data) {
    return (
      <AppShell>
        <div className="p-10 flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading studio...
        </div>
      </AppShell>
    );
  }

  const sec = sectionById(section);

  const intelFreshness = intelDoc
    ? `Fed by competitor intel: ${intelReels.length} pieces, updated ${new Date(intelDoc.updatedAt).toLocaleDateString()} (auto-refreshes twice a week)`
    : "No competitor intel yet: mine the desk on Overview and every batch here gets sharper";

  return (
    <AppShell>
      <div className="flex min-h-screen">
        {/* ── Studio nav ── */}
        <div className="w-60 flex-shrink-0 border-r border-border/40 p-4 space-y-1">
          <button
            onClick={() => navigate(`/clients/${clientId}`)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Build pipeline
          </button>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground px-2 pb-1">{data.client.name}</p>
          {SECTIONS.map((sc) => {
            const Icon = sc.icon;
            return (
              <button
                key={sc.id}
                onClick={() => setSection(sc.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  section === sc.id ? `${sc.chip} ${sc.id === "overview" ? "text-foreground" : sc.text}` : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {sc.label}
              </button>
            );
          })}
        </div>

        {/* ── Section content ── */}
        <div className={`flex-1 p-6 lg:p-8 space-y-4 min-w-0 ${sec.wash}`}>
          {section === "overview" && (
            <>
              <div className="rounded-2xl border border-border/50 bg-gradient-to-r from-primary/10 via-card/40 to-transparent p-6">
                <h1 className="text-xl font-semibold text-foreground">{data.client.name}</h1>
                <p className="text-xs text-muted-foreground">{data.client.niche} · {data.client.funnelType} funnel</p>
                <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: "Approved ads", value: approvedAds.length },
                    { label: "Content pieces", value: engineDocCount },
                    { label: "Emails", value: emailCount },
                    { label: "Posted / live", value: postedCount },
                  ].map((kpi) => (
                    <div key={kpi.label} className="rounded-xl bg-background/40 border border-border/40 p-3.5">
                      <p className="text-2xl font-semibold text-foreground tabular-nums">{kpi.value}</p>
                      <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Research: the fuel line everything draws from */}
              {researchReportId && (
                <button
                  onClick={() => navigate(`/report/${researchReportId}?client=${clientId}`)}
                  className="w-full rounded-xl border border-primary/25 bg-gradient-to-r from-primary/[0.08] to-transparent p-4 flex items-center gap-3 text-left hover:border-primary/50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Voice mining research</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      The market intelligence every engine draws from: pains, hooks, scripts, competitor intel
                    </p>
                  </div>
                  <span className="text-xs font-medium text-primary flex-shrink-0">Open the report →</span>
                </button>
              )}

              {/* AI: update any doc-set (Foundation / Skool / Emails / Ads) from the Overview */}
              <FoundationRefine
                clientId={clientId}
                invalidate={invalidate}
                jobs={jobs as unknown as Record<string, { status?: string | null; progress?: string | null } | null>}
              />

              {/* The client's own live socials */}
              <ClientSocials clientId={clientId} client={data.client} invalidate={invalidate} />

              {/* Avatars: the ICP broken into who we actually sell to (drives every audience picker) */}
              {avatars.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">Avatars</h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                    {avatars.map((a) => (
                      <div key={a.name} className="rounded-xl border border-border/40 bg-card/20 p-3">
                        <p className="text-xs font-semibold text-foreground">{a.name}</p>
                        {a.hint && <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{a.hint}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Foundation: who we're selling to, what we sell. Everything else lives in its engine */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Foundation</h3>
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {FOUNDATION_DOC_TYPES.flatMap((t) => docsFor(t)).map((d) => (
                    <DocRow key={d.id} doc={d} invalidate={invalidate} />
                  ))}
                </div>
              </div>

              {/* Competitor Desk */}
              <div id="competitor-desk">
                <StudioBlock
                  title="Competitor Desk"
                  hint="Mine the top competitors from your voice mining data: Instagram reels and YouTube videos, transcribed and broken down. Every content batch you generate reads this automatically, and it re-mines itself twice a week"
                >
                  <CompetitorMiner
                    found={competitorSources}
                    job={jobs.content_intel ?? null}
                    clientId={clientId}
                    invalidate={invalidate}
                  />
                  <div className="mt-4">
                    <IntelDesk reels={intelReels} reportDoc={intelDoc} />
                  </div>
                </StudioBlock>
              </div>
            </>
          )}

          {section === "ads" && (
            <>
              <SectionHeader id="ads" />
              {(jobs.ads?.status === "queued" || jobs.ads?.status === "running") && (
                <div className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-4 flex items-center gap-3">
                  <Loader2 className="w-4 h-4 text-violet-400 animate-spin flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Rebuilding rejected ads</p>
                    <p className="text-[11px] text-muted-foreground">
                      {jobs.ads?.status === "queued" ? "Waiting for your Mac worker" : jobs.ads?.progress || "Working..."}
                    </p>
                  </div>
                </div>
              )}
              <div className="grid lg:grid-cols-2 gap-4">
                <StudioBlock title="Generate static ads" frame="border-violet-500/25 bg-violet-500/[0.05]">
                  <EngineCard engine={engineByKind("more_statics")} job={jobs.more_statics ?? null} clientId={clientId} invalidate={invalidate} avatars={avatars} />
                </StudioBlock>
                <StudioBlock title="Generate video ad scripts" frame="border-violet-500/25 bg-violet-500/[0.05]">
                  <EngineCard engine={engineByKind("more_scripts")} job={jobs.more_scripts ?? null} clientId={clientId} invalidate={invalidate} avatars={avatars} />
                </StudioBlock>
              </div>
              <StudioBlock title="Proof images" hint="Client cutouts, approval screenshots, testimonials. The engine composites and annotates these into rendered statics instead of using placeholders" frame="border-violet-500/25 bg-violet-500/[0.05]">
                <RefImagePanel clientId={clientId} images={refImages} invalidate={invalidate} />
              </StudioBlock>
              <StudioBlock title="Ad library" hint="Approved ads live here forever; rejections with notes train every future batch. Push the approved set into the client's Google Drive Ads folder in one click" frame="border-violet-500/25 bg-violet-500/[0.05]">
                <AssetGallery assets={assets} clientId={clientId} stageId="ads" invalidate={invalidate} canRegenerate exportJob={(data.exportJob ?? null) as StageJob} />
              </StudioBlock>
              <StudioBlock title="Script pipeline" hint="One card per script: approve what gets recorded, mark posted when live" frame="border-violet-500/25 bg-violet-500/[0.05]">
                <DocBoard docs={[...docsFor("ad_scripts_extra")]} invalidate={invalidate} clientId={clientId} docType="ad_scripts_extra" />
              </StudioBlock>
              <StudioBlock title="Campaign documents" hint="The creative batch spec and the campaign plan from the build" frame="border-violet-500/25 bg-violet-500/[0.05]">
                <div className="space-y-1.5">
                  {ADS_DOC_TYPES.flatMap((t) => docsFor(t)).map((d) => (
                    <DocRow key={d.id} doc={d} invalidate={invalidate} />
                  ))}
                </div>
              </StudioBlock>
            </>
          )}

          {section === "funnel" && (
            <>
              <SectionHeader id="funnel" />
              <StudioBlock
                title="Generate landing pages"
                hint="Pick the audience and offer. Fills our brand templates with this client's copy and returns the two GHL-ready page code blocks plus every recording script"
                frame="border-sky-500/25 bg-sky-500/[0.05]"
              >
                <EngineCard engine={engineByKind("more_landers")} job={jobs.more_landers ?? null} clientId={clientId} invalidate={invalidate} avatars={avatars} />
              </StudioBlock>
              <StudioBlock
                title="Asset pipeline"
                hint="Every funnel file lands here: the VSL landing code, the post-booking code, and the recording script for the client. Approve, then mark posted once it's live. Write your own too"
                frame="border-sky-500/25 bg-sky-500/[0.05]"
              >
                <DocBoard docs={docsFor("lander_extra")} invalidate={invalidate} clientId={clientId} docType="lander_extra" />
              </StudioBlock>
            </>
          )}

          {section === "shortform" && (
            <>
              <SectionHeader id="shortform" />
              <StudioBlock title="Generate Instagram reels" hint={intelFreshness} frame="border-pink-500/25 bg-pink-500/[0.05]">
                <EngineCard engine={engineByKind("more_content_ig")} job={jobs.more_content_ig ?? null} clientId={clientId} invalidate={invalidate} avatars={avatars} />
              </StudioBlock>
              <StudioBlock title="Reel pipeline" hint="One card per reel: draft, approve, posted. Write your own too" frame="border-pink-500/25 bg-pink-500/[0.05]">
                <DocBoard docs={docsFor("content_ig_extra")} invalidate={invalidate} clientId={clientId} docType="content_ig_extra" />
              </StudioBlock>
            </>
          )}

          {section === "youtube" && (
            <>
              <SectionHeader id="youtube" />
              <StudioBlock title="Generate long-form scripts" hint={intelFreshness} frame="border-red-500/25 bg-red-500/[0.05]">
                <EngineCard engine={engineByKind("more_content_yt")} job={jobs.more_content_yt ?? null} clientId={clientId} invalidate={invalidate} avatars={avatars} />
              </StudioBlock>
              <StudioBlock title="Video pipeline" hint="One card per script: approve what gets filmed, mark posted when live" frame="border-red-500/25 bg-red-500/[0.05]">
                <DocBoard docs={docsFor("content_yt_extra")} invalidate={invalidate} clientId={clientId} docType="content_yt_extra" />
              </StudioBlock>
            </>
          )}

          {section === "emails" && (
            <>
              <SectionHeader id="emails" />
              <StudioBlock
                title={data.client.funnelType === "webinar" ? "Webinar sequences" : "Call funnel sequences"}
                hint="One click writes the whole sequence in your swipe-file style. It lands as a card in the pipeline below"
                frame="border-emerald-500/25 bg-emerald-500/[0.05]"
              >
                <PrebuiltSequences
                  funnelType={data.client.funnelType === "webinar" ? "webinar" : "call"}
                  job={jobs.more_emails ?? null}
                  clientId={clientId}
                  invalidate={invalidate}
                />
              </StudioBlock>
              <StudioBlock
                title="VSL sequences"
                hint="For the VSL funnel: opt-in, booked pre-call nurture, no-show recovery, post-call follow-ups. One click generates all four, or pick one. Aggressive cadence, case-study dense"
                frame="border-emerald-500/25 bg-emerald-500/[0.05]"
              >
                <PrebuiltSequences funnelType="vsl" job={jobs.more_emails ?? null} clientId={clientId} invalidate={invalidate} />
              </StudioBlock>
              <StudioBlock title="Or write a custom email" hint="Pick the purpose, add specifics: swipe-file style, ConvertKit-ready" frame="border-emerald-500/25 bg-emerald-500/[0.05]">
                <EngineCard engine={engineByKind("more_emails")} job={jobs.more_emails ?? null} clientId={clientId} invalidate={invalidate} avatars={avatars} />
              </StudioBlock>
              <StudioBlock
                title="Email pipeline"
                hint="One card per email or sequence: the build's approved sequences start in Approved, mark posted once loaded into ConvertKit"
                frame="border-emerald-500/25 bg-emerald-500/[0.05]"
              >
                <DocBoard
                  docs={[
                    ...docsFor("emails_extra"),
                    // The build's sequence set was approved at the stage gate: it starts in the Approved column
                    ...EMAIL_DOC_TYPES.flatMap((t) => docsFor(t)).map((d) => ({
                      ...d,
                      status: !d.status || d.status === "draft" ? "approved" : d.status,
                    })),
                  ]}
                  invalidate={invalidate}
                  clientId={clientId}
                  docType="emails_extra"
                />
              </StudioBlock>
            </>
          )}

          {section === "skool" && (
            <>
              <SectionHeader id="skool" />
              <StudioBlock title="Generate community posts" hint="Value, engagement, proof, and DM-trigger posts from the proven post bank" frame="border-amber-500/25 bg-amber-500/[0.05]">
                <EngineCard engine={engineByKind("more_skool")} job={jobs.more_skool ?? null} clientId={clientId} invalidate={invalidate} />
              </StudioBlock>
              <StudioBlock title="Post pipeline" hint="One card per post: approve, then mark posted once live in the community" frame="border-amber-500/25 bg-amber-500/[0.05]">
                <DocBoard docs={docsFor("skool_extra")} invalidate={invalidate} clientId={clientId} docType="skool_extra" />
              </StudioBlock>
              <StudioBlock title="Community setup" hint="What the Skool actually is: the free and paid community structure, names, and pinned content" frame="border-amber-500/25 bg-amber-500/[0.05]">
                <div className="space-y-1.5">
                  {SKOOL_DOC_TYPES.flatMap((t) => docsFor(t)).map((d) => (
                    <DocRow key={d.id} doc={d} invalidate={invalidate} />
                  ))}
                </div>
              </StudioBlock>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
