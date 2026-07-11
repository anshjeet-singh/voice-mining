import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { AppShell } from "@/components/AppShell";
import { MarkdownDoc } from "@/components/MarkdownDoc";
import {
  AssetGallery,
  DocBoard,
  ENGINES,
  EngineCard,
  type ClientAssetMeta,
  type ClientDoc,
  type StageJob,
} from "@/components/engines";
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  FileText,
  Image,
  Loader2,
  Mail,
  MonitorPlay,
  Sparkles,
  Users,
  Youtube,
} from "lucide-react";

/** Studio sections: the client dashboard's left nav. */
const SECTIONS = [
  { id: "overview", label: "Overview", icon: Sparkles },
  { id: "ads", label: "Ads Engine", icon: Image },
  { id: "shortform", label: "Short-Form Content", icon: MonitorPlay },
  { id: "youtube", label: "YouTube Content", icon: Youtube },
  { id: "emails", label: "Email Engine", icon: Mail },
  { id: "skool", label: "Skool Engine", icon: Users },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const engineByKind = (kind: string) => ENGINES.find((e) => e.kind === kind)!;

/** A titled studio block. */
function StudioBlock({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/30 p-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** Readable doc row for the Overview's foundation library. */
function DocRow({ doc }: { doc: ClientDoc }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border/40 bg-card/30">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 p-2.5 text-left">
        <FileText className="w-3 h-3 text-primary flex-shrink-0" />
        <span className="flex-1 text-xs font-medium text-foreground truncate">{doc.title}</span>
        {open ? (
          <ChevronUp className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="px-2.5 pb-2.5">
          <div className="max-h-[28rem] overflow-y-auto rounded-lg bg-background/40 p-3">
            <MarkdownDoc content={doc.content} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Intel Desk ───────────────────────────────────────────────────────────────

interface IntelReel {
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
        views: Number(r.views) || 0,
        likes: Number(r.likes) || 0,
        comments: Number(r.comments) || 0,
        score: Number(r.score) || 0,
      }));
  } catch {
    return [];
  }
}

/** The Competitor Desk: KPIs, reach, hook taxonomy, script-rail reel cards. */
function IntelDesk({ reels, reportDoc }: { reels: IntelReel[]; reportDoc?: ClientDoc }) {
  const [account, setAccount] = useState<string | null>(null);
  const [openReel, setOpenReel] = useState<number | null>(null);
  const [showReport, setShowReport] = useState(false);

  if (!reels.length) {
    return reportDoc ? (
      <div>
        <p className="text-[11px] text-muted-foreground mb-2">
          Intel report available (older format, no structured data): view it below. New runs render the full desk.
        </p>
        <DocRow doc={reportDoc} />
      </div>
    ) : null;
  }

  const accounts = Array.from(new Set(reels.map((r) => r.account)));
  const byAccount = accounts
    .map((a) => ({ account: a, views: reels.filter((r) => r.account === a).reduce((n, r) => n + r.views, 0) }))
    .sort((a, b) => b.views - a.views);
  const maxAcc = byAccount[0]?.views || 1;

  const styleAgg = new Map<string, { count: number; views: number }>();
  for (const r of reels) {
    const cur = styleAgg.get(r.hookStyle) ?? { count: 0, views: 0 };
    styleAgg.set(r.hookStyle, { count: cur.count + 1, views: cur.views + r.views });
  }
  const taxonomy = Array.from(styleAgg.entries()).sort((a, b) => b[1].views - a[1].views);

  const visible = reels
    .filter((r) => !account || r.account === account)
    .sort((a, b) => b.views - a.views);
  const totalViews = reels.reduce((n, r) => n + r.views, 0);
  const topViews = Math.max(...reels.map((r) => r.views));

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {[
          { n: String(reels.length), l: "reels analyzed" },
          { n: String(accounts.length), l: "accounts" },
          { n: fmt(totalViews), l: "combined views" },
          { n: fmt(topViews), l: "top reel" },
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
        {/* Reach by account */}
        <div className="rounded-lg border border-border/40 bg-background/40 p-3">
          <p className="text-[11px] font-semibold text-foreground mb-2">Reach by account</p>
          <div className="space-y-1.5">
            {byAccount.map((a, i) => (
              <div key={a.account} className="grid grid-cols-[110px_1fr_56px] gap-2 items-center">
                <span className="text-[10px] font-mono text-muted-foreground truncate">@{a.account}</span>
                <div className="h-4 rounded bg-card/60 overflow-hidden">
                  <div
                    className={`h-full rounded ${i === 0 ? "bg-primary" : "bg-foreground/30"}`}
                    style={{ width: `${(a.views / maxAcc) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground text-right tabular-nums">{fmt(a.views)}</span>
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
                <span className="text-[11px] font-mono font-medium text-foreground">{style}</span>
                {i === 0 && (
                  <span className="text-[8px] font-mono uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                    winning
                  </span>
                )}
                <span className="ml-auto text-[10px] font-mono text-muted-foreground tabular-nums">
                  {d.count} reel{d.count > 1 ? "s" : ""} · {fmt(d.views)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Account filter + reel cards */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setAccount(null)}
          className={`px-2.5 py-1 rounded-full text-[10px] font-mono border transition-colors ${
            account === null ? "bg-foreground text-background border-foreground" : "border-border/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          All accounts
        </button>
        {accounts.map((a) => (
          <button
            key={a}
            onClick={() => setAccount(account === a ? null : a)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-mono border transition-colors ${
              account === a ? "bg-foreground text-background border-foreground" : "border-border/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            @{a}
          </button>
        ))}
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">
          {visible.length} / {reels.length} reels
        </span>
      </div>

      <div className="space-y-2">
        {visible.map((r, i) => (
          <div key={`${r.account}-${i}`} className="rounded-lg border border-border/50 bg-background/40 overflow-hidden">
            <button
              onClick={() => setOpenReel(openReel === i ? null : i)}
              className="w-full grid grid-cols-[36px_1fr_auto] gap-3 items-center p-3 text-left hover:bg-card/40"
            >
              <span className={`text-base font-mono font-bold text-center ${i === 0 ? "text-primary" : "text-muted-foreground/40"}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-foreground truncate">{r.topic}</span>
                <span className="block text-[10px] font-mono text-muted-foreground">
                  @{r.account}
                  {r.date ? ` · ${r.date}` : ""} ·{" "}
                  <span className="text-primary">{r.hookStyle}</span> · {r.score}/10
                </span>
              </span>
              <span className="flex items-center gap-4">
                {[
                  { n: fmt(r.views), l: "views" },
                  { n: fmt(r.likes), l: "likes" },
                ].map((st) => (
                  <span key={st.l} className="text-right">
                    <span className="block text-xs font-mono font-semibold text-foreground tabular-nums">{st.n}</span>
                    <span className="block text-[9px] uppercase text-muted-foreground">{st.l}</span>
                  </span>
                ))}
                {openReel === i ? (
                  <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </span>
            </button>
            {openReel === i && (
              <div className="border-t border-border/40 p-4 grid lg:grid-cols-[3fr_2fr] gap-5">
                {/* Script rail */}
                <div className="relative pl-5 space-y-3 before:absolute before:left-[5px] before:top-2 before:bottom-2 before:w-px before:bg-border">
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
                      <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                        {sec.label}
                        {sec.note && <span className="normal-case tracking-normal italic"> · {sec.note}</span>}
                      </p>
                      <p className="text-xs text-foreground/90 leading-relaxed">{sec.text}</p>
                    </div>
                  ))}
                </div>
                {/* Angle + caption */}
                <div className="space-y-3">
                  {r.angle && (
                    <div className="rounded-lg bg-foreground text-background p-3">
                      <p className="text-[9px] font-mono uppercase tracking-wider opacity-60 mb-1">Your angle</p>
                      <p className="text-xs leading-relaxed">{r.angle}</p>
                    </div>
                  )}
                  {r.caption && (
                    <div className="border-l-2 border-border pl-2.5">
                      <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">Caption</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{r.caption}</p>
                    </div>
                  )}
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] font-mono text-primary underline underline-offset-2"
                    >
                      open original ↗
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
          className="text-[10px] font-mono text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {showReport ? "hide" : "view"} full written report
        </button>
      )}
      {showReport && reportDoc && <DocRow doc={reportDoc} />}
    </div>
  );
}

// ─── The Studio ───────────────────────────────────────────────────────────────

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
  const suggested = (data?.suggestedCompetitors ?? []) as string[];

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
  const foundationDocs = documents.filter((d) => d.kind === "foundation" || (d.kind === "deliverable" && !d.docType.endsWith("_extra")));
  const engineDocCount = ENGINES.reduce((n, e) => n + docsFor(e.docType).length, 0);

  if (isLoading || !data) {
    return (
      <AppShell>
        <div className="p-10 flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading studio...
        </div>
      </AppShell>
    );
  }

  const intelBlock = (
    <StudioBlock
      title="Competitor Desk"
      hint="Scrape + transcribe competitor reels: who pulls reach, which hooks win, and the exact gaps to fill"
    >
      {suggested.length > 0 && (
        <p className="text-[10px] font-mono text-muted-foreground mb-2">
          From onboarding: {suggested.map((h) => `@${h}`).join("  ")}
          <span className="opacity-60"> (type handles in the box to mine them)</span>
        </p>
      )}
      <EngineCard engine={engineByKind("content_intel")} job={jobs.content_intel ?? null} clientId={clientId} invalidate={invalidate} />
      <div className="mt-4">
        <IntelDesk reels={intelReels} reportDoc={intelDoc} />
      </div>
    </StudioBlock>
  );

  return (
    <AppShell>
      <div className="flex min-h-screen">
        {/* ── Studio nav ── */}
        <div className="w-56 flex-shrink-0 border-r border-border/40 p-4 space-y-1">
          <button
            onClick={() => navigate(`/clients/${clientId}`)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Build pipeline
          </button>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground px-2 pb-1">{data.client.name}</p>
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            return (
              <button
                key={sec.id}
                onClick={() => setSection(sec.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  section === sec.id
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {sec.label}
              </button>
            );
          })}
        </div>

        {/* ── Section content ── */}
        <div className="flex-1 p-6 lg:p-8 space-y-4 min-w-0">
          {section === "overview" && (
            <>
              <div>
                <h1 className="text-lg font-semibold text-foreground">{data.client.name} Studio</h1>
                <p className="text-xs text-muted-foreground">
                  {data.client.niche} · {data.client.funnelType} funnel
                </p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: "Approved ads in library", value: approvedAds.length },
                  { label: "Engine documents", value: engineDocCount },
                  { label: "Intel reels analyzed", value: intelReels.length },
                  { label: "Foundation + pipeline docs", value: foundationDocs.length },
                ].map((kpi) => (
                  <div key={kpi.label} className="rounded-xl border border-border/50 bg-card/30 p-4">
                    <p className="text-2xl font-semibold text-foreground">{kpi.value}</p>
                    <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                  </div>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {SECTIONS.filter((sec) => sec.id !== "overview").map((sec) => {
                  const Icon = sec.icon;
                  return (
                    <button
                      key={sec.id}
                      onClick={() => setSection(sec.id)}
                      className="rounded-xl border border-border/50 bg-card/30 p-4 text-left hover:border-primary/40 transition-colors"
                    >
                      <Icon className="w-4 h-4 text-primary mb-2" />
                      <p className="text-sm font-medium text-foreground">{sec.label}</p>
                    </button>
                  );
                })}
              </div>
              <StudioBlock title="Foundation + pipeline documents" hint="Everything the build produced: ICP, offers, Skool, funnel, emails">
                <div className="grid md:grid-cols-2 gap-2">
                  {foundationDocs.map((doc) => (
                    <DocRow key={doc.id} doc={doc} />
                  ))}
                </div>
              </StudioBlock>
            </>
          )}

          {section === "ads" && (
            <>
              <h1 className="text-lg font-semibold text-foreground">Ads Engine</h1>
              <div className="grid lg:grid-cols-2 gap-4">
                <StudioBlock title="Generate static ads">
                  <EngineCard engine={engineByKind("more_statics")} job={jobs.more_statics ?? null} clientId={clientId} invalidate={invalidate} />
                </StudioBlock>
                <StudioBlock title="Generate video ad scripts">
                  <EngineCard engine={engineByKind("more_scripts")} job={jobs.more_scripts ?? null} clientId={clientId} invalidate={invalidate} />
                </StudioBlock>
              </div>
              <StudioBlock title="Ad library" hint="Approved ads live here forever. Reject with notes and rebuild: verdicts train every future batch">
                <AssetGallery assets={assets} clientId={clientId} stageId="ads" invalidate={invalidate} canRegenerate />
              </StudioBlock>
              <StudioBlock title="Script pipeline" hint="Video ad script batches: approve what Trent should record, mark posted when live">
                <DocBoard docs={[...docsFor("ad_scripts_extra"), ...docsFor("ad_scripts")]} invalidate={invalidate} />
              </StudioBlock>
            </>
          )}

          {section === "shortform" && (
            <>
              <h1 className="text-lg font-semibold text-foreground">Short-Form Content</h1>
              <StudioBlock title="Generate Instagram reels" hint="Built on the house talking-head structure, the proven hook bank, and fresh competitor intel">
                <EngineCard engine={engineByKind("more_content_ig")} job={jobs.more_content_ig ?? null} clientId={clientId} invalidate={invalidate} />
              </StudioBlock>
              <StudioBlock title="Content pipeline" hint="Draft to approved to posted: the reel production board">
                <DocBoard docs={docsFor("content_ig_extra")} invalidate={invalidate} />
              </StudioBlock>
              {intelBlock}
            </>
          )}

          {section === "youtube" && (
            <>
              <h1 className="text-lg font-semibold text-foreground">YouTube Content</h1>
              <StudioBlock title="Generate long-form scripts" hint="Outlier-modeled packaging, 4-beat hooks, story-arc bodies">
                <EngineCard engine={engineByKind("more_content_yt")} job={jobs.more_content_yt ?? null} clientId={clientId} invalidate={invalidate} />
              </StudioBlock>
              <StudioBlock title="Content pipeline" hint="Draft to approved to posted: the video production board">
                <DocBoard docs={docsFor("content_yt_extra")} invalidate={invalidate} />
              </StudioBlock>
              {intelBlock}
            </>
          )}

          {section === "emails" && (
            <>
              <h1 className="text-lg font-semibold text-foreground">Email Engine</h1>
              <StudioBlock title="Generate email copy" hint="Pick the purpose, add specifics: swipe-file style, ConvertKit-ready">
                <EngineCard engine={engineByKind("more_emails")} job={jobs.more_emails ?? null} clientId={clientId} invalidate={invalidate} />
              </StudioBlock>
              <StudioBlock title="Email pipeline" hint="Approve, then mark posted once loaded into ConvertKit">
                <DocBoard docs={docsFor("emails_extra")} invalidate={invalidate} />
              </StudioBlock>
            </>
          )}

          {section === "skool" && (
            <>
              <h1 className="text-lg font-semibold text-foreground">Skool Engine</h1>
              <StudioBlock title="Generate community posts" hint="Value, engagement, proof, and DM-trigger posts from the proven post bank">
                <EngineCard engine={engineByKind("more_skool")} job={jobs.more_skool ?? null} clientId={clientId} invalidate={invalidate} />
              </StudioBlock>
              <StudioBlock title="Post pipeline" hint="Approve, then mark posted once live in the community">
                <DocBoard docs={docsFor("skool_extra")} invalidate={invalidate} />
              </StudioBlock>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
