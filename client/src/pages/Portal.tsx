import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useParams } from "wouter";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import { MarkdownDoc } from "@/components/MarkdownDoc";
import { MarketPulse, parsePulsePieces } from "@/components/MarketPulse";
import { RecordingChecklist } from "@/components/RecordingChecklist";
import { CopyButton, extractHtml, stripHtmlBlock, HtmlPreview } from "@/components/engines";
import { IntelligenceTab, toAnalysisView } from "@/components/report/IntelligenceTab";
import { HooksTab } from "@/components/report/HooksTab";
import { AdsTab } from "@/components/report/AdsTab";
import { SkoolTab } from "@/components/report/SkoolTab";
import { ScriptsTab } from "@/components/report/ScriptsTab";
import { EmailTab } from "@/components/report/EmailTab";
import { CompetitorTab } from "@/components/report/CompetitorTab";
import {
  normalizeHooks,
  type AdCopyIdea,
  type CompetitorIntel,
  type DeepMarketIntelligence,
  type EmailMessage,
  type SkoolPostWithDMWorkflow,
  type TalkingHeadScript,
  type YouTubeIdea,
} from "@shared/reportContent";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clapperboard,
  Download,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  LayoutDashboard,
  Loader2,
  LogOut,
  Megaphone,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";

/**
 * The client portal (app.cashflowcoaches.io/portal): a client signs in with
 * the email + password their coach created and sees THEIR work, read-only.
 * Ad library with downloads and the Meta copy, recording to-dos, the research
 * report, the competitor desk, and every approved document. No generate
 * buttons anywhere — the engines stay on the operator's side.
 */

type PortalHome = inferRouterOutputs<AppRouter>["portal"]["home"];
type PortalAd = PortalHome["ads"][number];
type PortalDoc = PortalHome["documents"][number];

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "ads", label: "Ad Library", icon: Megaphone },
  { id: "todo", label: "To-Do", icon: Clapperboard },
  { id: "research", label: "Research", icon: Search },
  { id: "pulse", label: "Market Pulse", icon: TrendingUp },
  { id: "docs", label: "Documents", icon: FolderOpen },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Folder grouping for the Documents tab, mapped from docType families. */
const DOC_FOLDERS: Array<{ label: string; match: (docType: string) => boolean }> = [
  {
    label: "Strategy & foundation",
    match: (t) => ["icp_snapshot", "offers", "brand_positioning", "course_outline"].includes(t),
  },
  { label: "Community", match: (t) => t.startsWith("skool") },
  { label: "Emails & SMS", match: (t) => t.startsWith("email") || t === "sms_set" || t === "emails_extra" },
  { label: "Content", match: (t) => t.startsWith("content_") },
  {
    label: "Scripts & funnel pages",
    match: (t) =>
      ["ad_video_scripts", "ad_scripts_extra", "video_scripts", "funnel_asset_extra", "lander_extra"].includes(t) ||
      t.startsWith("funnel_"),
  },
];

/** "TK_Ad03_Notes_hook-swap.png" -> "Ad 03 · Notes" fallback to the format chip. */
function adLabel(ad: PortalAd): string {
  const m = ad.filename.match(/Ad\s?_?(\d+)/i);
  const num = m ? `Ad ${m[1]}` : ad.filename.replace(/\.[a-z]+$/i, "");
  return ad.format ? `${num} · ${ad.format}` : num;
}

function PortalLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = trpc.portal.login.useMutation({
    onSuccess: onSignedIn,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    login.mutate({ email: email.trim(), password });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <span className="font-semibold text-foreground tracking-tight text-lg">Cashflow Coaches</span>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/30 p-6">
          <h1 className="text-base font-semibold text-foreground mb-1">Client portal</h1>
          <p className="text-xs text-muted-foreground mb-5">
            Your ads, scripts, and growth work in one place. Sign in with the details from your coach.
          </p>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="portal-email" className="block text-xs font-medium text-muted-foreground mb-1.5">
                Email
              </label>
              <input
                id="portal-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60"
                placeholder="you@business.com"
              />
            </div>
            <div>
              <label htmlFor="portal-password" className="block text-xs font-medium text-muted-foreground mb-1.5">
                Password
              </label>
              <input
                id="portal-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60"
                placeholder="Your password"
              />
            </div>
            {login.error && <p className="text-xs text-red-400">{login.error.message}</p>}
            <button
              type="submit"
              disabled={login.isPending || !email.trim() || !password}
              className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {login.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign in
            </button>
          </form>
        </div>
        <p className="text-[11px] text-muted-foreground text-center mt-4">
          Lost your password? Message your coach and they'll reset it.
        </p>
      </div>
    </div>
  );
}

/** One stat tile in the Overview hero band. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/30 px-4 py-3">
      <p className="text-xl font-semibold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function OverviewTab({ home, goTo }: { home: PortalHome; goTo: (tab: TabId) => void }) {
  const { data: rec } = trpc.recording.get.useQuery(
    { token: home.recordingToken ?? "" },
    { enabled: !!home.recordingToken }
  );
  const [openReport, setOpenReport] = useState<number | null>(0);
  const recDone = rec ? rec.items.filter((i) => i.recordedAt).length : 0;
  const recTotal = rec?.items.length ?? 0;
  const pulseCount = parsePulsePieces(home.intelContent).length;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Stat value={String(home.ads.length)} label="Approved ads" />
        <Stat value={recTotal ? `${recDone}/${recTotal}` : "0"} label="Videos recorded" />
        <Stat value={String(home.documents.length)} label="Documents delivered" />
        <Stat value={String(pulseCount)} label="Market pulse pieces" />
      </div>

      {home.ads.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-semibold text-foreground">Latest ads</h2>
            <button className="text-[11px] text-primary hover:underline" onClick={() => goTo("ads")}>
              Open the ad library
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {home.ads.slice(0, 6).map((ad) => (
              <button
                key={ad.id}
                onClick={() => goTo("ads")}
                className="rounded-lg overflow-hidden border border-border/50 bg-card/30 aspect-[4/5] hover:border-primary/40 transition-colors"
                title={ad.filename}
              >
                <img src={`/api/portal/assets/${ad.id}`} alt={adLabel(ad)} loading="lazy" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </section>
      )}

      {recTotal > 0 && recDone < recTotal && (
        <button
          onClick={() => goTo("todo")}
          className="w-full rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-3 flex items-center gap-3 text-left hover:bg-primary/10 transition-colors"
        >
          <Clapperboard className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="flex-1 text-sm text-foreground">
            {recTotal - recDone} video{recTotal - recDone === 1 ? "" : "s"} waiting on you to record
          </span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      )}

      {home.weeklyReports.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-2">Weekly reports</h2>
          <div className="space-y-2">
            {home.weeklyReports.map((r, i) => (
              <div key={i} className="rounded-xl border border-border/60 bg-card/30">
                <button
                  className="w-full flex items-center gap-2 px-4 py-3 text-left"
                  onClick={() => setOpenReport(openReport === i ? null : i)}
                >
                  <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 text-sm font-medium text-foreground">{r.title}</span>
                  {openReport === i ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
                {openReport === i && (
                  <div className="px-5 pb-5 border-t border-border/40 pt-4">
                    <MarkdownDoc content={r.content} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {!home.ads.length && !home.weeklyReports.length && (
        <p className="text-sm text-muted-foreground text-center py-16">
          Your workspace is being set up. The first deliverables land here soon.
        </p>
      )}
    </div>
  );
}

/** One copy block inside the ad lightbox: label + text + copy button. */
function CopyBlock({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <CopyButton text={text} label="Copy" />
      </div>
      <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function AdLibraryTab({ home }: { home: PortalHome }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const ads = home.ads;

  useEffect(() => {
    if (openIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIdx(null);
      if (e.key === "ArrowRight") setOpenIdx((i) => (i === null ? i : Math.min(i + 1, ads.length - 1)));
      if (e.key === "ArrowLeft") setOpenIdx((i) => (i === null ? i : Math.max(i - 1, 0)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIdx, ads.length]);

  if (!ads.length) {
    return (
      <div className="text-center py-20">
        <ImageIcon className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Your first ad batch is in production. It lands here once approved.</p>
      </div>
    );
  }

  const open = openIdx !== null ? ads[openIdx] : null;

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-4">
        Every ad here is approved and ready to run. Open one to download the image and copy its text for Meta.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        {ads.map((ad, i) => (
          <button
            key={ad.id}
            onClick={() => setOpenIdx(i)}
            className="group rounded-xl overflow-hidden border border-border/50 bg-card/30 text-left hover:border-primary/40 transition-colors"
          >
            <div className="aspect-[4/5] overflow-hidden">
              <img
                src={`/api/portal/assets/${ad.id}`}
                alt={adLabel(ad)}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
              />
            </div>
            <div className="px-3 py-2.5 flex items-center gap-2">
              <span className="flex-1 text-xs font-medium text-foreground truncate">{adLabel(ad)}</span>
              <a
                href={`/api/portal/assets/${ad.id}?download`}
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="Download PNG"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            </div>
          </button>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpenIdx(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[90vh] rounded-2xl border border-border/60 bg-card overflow-hidden flex flex-col sm:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:w-1/2 bg-background/60 flex items-center justify-center p-4 min-h-0">
              <img
                src={`/api/portal/assets/${open.id}`}
                alt={adLabel(open)}
                className="max-h-[40vh] sm:max-h-[80vh] w-auto object-contain rounded-lg"
              />
            </div>
            <div className="sm:w-1/2 p-5 overflow-y-auto space-y-3">
              <div className="flex items-center gap-2">
                <p className="flex-1 text-sm font-semibold text-foreground truncate">{adLabel(open)}</p>
                <button
                  onClick={() => setOpenIdx(null)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <a
                href={`/api/portal/assets/${open.id}?download`}
                className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
              >
                <Download className="w-3.5 h-3.5" />
                Download PNG
              </a>
              <CopyBlock label="Primary text" text={open.copyPrimary} />
              <CopyBlock label="Headline" text={open.copyHeadline} />
              <CopyBlock label="Description" text={open.copyDescription} />
              {!open.copyPrimary && !open.copyHeadline && (
                <p className="text-xs text-muted-foreground">
                  No upload text attached to this ad. Ask your coach if you need it.
                </p>
              )}
              <div className="flex items-center justify-between pt-1">
                <button
                  disabled={openIdx === 0}
                  onClick={() => setOpenIdx((i) => (i === null ? i : Math.max(i - 1, 0)))}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>
                <span className="text-[11px] text-muted-foreground">
                  {(openIdx ?? 0) + 1} of {ads.length}
                </span>
                <button
                  disabled={openIdx === ads.length - 1}
                  onClick={() => setOpenIdx((i) => (i === null ? i : Math.min(i + 1, ads.length - 1)))}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TodoTab({ home }: { home: PortalHome }) {
  if (!home.recordingToken) {
    return (
      <div className="text-center py-20">
        <Clapperboard className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Nothing on your list yet. Scripts land here when they're ready to record.</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-4">
        Each card is one video, scripted word for word. Open it, film it, tick it off, and paste your recording link so
        your coach can grab the footage.
      </p>
      <RecordingChecklist token={home.recordingToken} />
    </div>
  );
}

const REPORT_TABS = [
  { id: "intelligence", label: "Market Intelligence" },
  { id: "hooks", label: "Viral Hooks" },
  { id: "adcopy", label: "Ads" },
  { id: "skool", label: "Skool Posts" },
  { id: "scripts", label: "Video Scripts" },
  { id: "email", label: "Email Sequence" },
  { id: "competitors", label: "Competitor Intel" },
];

function ResearchTab() {
  const { data, isLoading } = trpc.portal.report.useQuery();
  const [active, setActive] = useState("intelligence");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="text-center py-20">
        <Search className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Your market research report is still in production.</p>
      </div>
    );
  }

  const { report, analysis } = data;
  const mi = (report.marketIntelligence ?? {}) as DeepMarketIntelligence;
  const hooks = normalizeHooks(report.viralHooks);
  const ads = (report.adCopyIdeas ?? []) as AdCopyIdea[];
  const posts = (report.skoolPosts ?? []) as SkoolPostWithDMWorkflow[];
  const scripts = (report.talkingHeadScripts ?? []) as TalkingHeadScript[];
  const ideas = (report.youtubeIdeas ?? []) as YouTubeIdea[];
  const emailSeq = (report.emailSequence ?? { sequenceName: "Email Sequence", emails: [] }) as {
    sequenceName: string;
    emails: EmailMessage[];
  };
  const intel = (report.competitorIntel ?? null) as CompetitorIntel | null;
  const analysisView = toAnalysisView(analysis);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{report.name}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          The voice-of-market research your campaigns are built on.
        </p>
      </div>
      {mi.executiveSummary && (
        <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 mb-4">
          <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Executive summary</p>
          <p className="text-sm text-foreground/90 leading-relaxed">{mi.executiveSummary}</p>
        </div>
      )}
      <div className="sticky top-0 z-20 -mx-2 px-2 py-2 bg-background/95 backdrop-blur-sm mb-4">
        <div className="flex gap-1 p-1 rounded-xl bg-card/50 border border-border/30 overflow-x-auto">
          {REPORT_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                active === t.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {active === "intelligence" && <IntelligenceTab mi={mi} analysis={analysisView} reportId={0} />}
      {active === "hooks" && <HooksTab hooks={hooks} reportId={0} reportName={report.name} />}
      {active === "adcopy" && <AdsTab ads={ads} reportId={0} reportName={report.name} />}
      {active === "skool" && <SkoolTab posts={posts} reportId={0} reportName={report.name} />}
      {active === "scripts" && <ScriptsTab scripts={scripts} youtubeIdeas={ideas} reportId={0} reportName={report.name} />}
      {active === "email" && <EmailTab emailSeq={emailSeq} reportId={0} reportName={report.name} />}
      {active === "competitors" && <CompetitorTab intel={intel} reportId={0} />}
    </div>
  );
}

function PulseTab({ home }: { home: PortalHome }) {
  const hasPulse = parsePulsePieces(home.intelContent).length > 0;
  if (!hasPulse) {
    return (
      <div className="text-center py-20">
        <TrendingUp className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          The first competitor sweep of your market is on its way.
        </p>
      </div>
    );
  }
  return <MarketPulse intelContent={home.intelContent} intelUpdatedAt={home.intelUpdatedAt} limit={20} />;
}

function DocRow({ doc }: { doc: PortalDoc }) {
  const [open, setOpen] = useState(false);
  const html = extractHtml(doc.content);
  return (
    <div className="rounded-xl border border-border/50 bg-card/30">
      <div className="flex items-center gap-2 px-4 py-3">
        <button className="flex-1 flex items-center gap-2 text-left min-w-0" onClick={() => setOpen(!open)}>
          <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">{doc.title}</span>
        </button>
        <CopyButton text={stripHtmlBlock(doc.content)} label="Copy" className="flex-shrink-0" />
        <button onClick={() => setOpen(!open)} className="flex-shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      {open && (
        <div className="px-5 pb-5 border-t border-border/40 pt-4 space-y-4">
          {html && <HtmlPreview html={html} filename={`${doc.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.html`} />}
          <MarkdownDoc content={stripHtmlBlock(doc.content)} />
        </div>
      )}
    </div>
  );
}

function DocumentsTab({ home }: { home: PortalHome }) {
  const groups = useMemo(() => {
    const used = new Set<number>();
    const out = DOC_FOLDERS.map((f) => {
      const docs = home.documents.filter((d) => {
        if (used.has(d.id) || !f.match(d.docType)) return false;
        used.add(d.id);
        return true;
      });
      return { label: f.label, docs };
    }).filter((g) => g.docs.length > 0);
    const rest = home.documents.filter((d) => !used.has(d.id));
    if (rest.length) out.push({ label: "More", docs: rest });
    return out;
  }, [home.documents]);

  if (!groups.length) {
    return (
      <div className="text-center py-20">
        <FolderOpen className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Approved documents land here as your build progresses.</p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {groups.map((g) => (
        <section key={g.label}>
          <h2 className="text-sm font-semibold text-foreground mb-2">{g.label}</h2>
          <div className="space-y-2">
            {g.docs.map((d) => (
              <DocRow key={d.id} doc={d} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PortalShell({ clientName, onSignOut }: { clientName: string; onSignOut: () => void }) {
  const params = useParams<{ tab?: TabId }>();
  const [, navigate] = useLocation();
  const tab: TabId = TABS.some((t) => t.id === params.tab) ? (params.tab as TabId) : "overview";
  const goTo = (t: TabId) => navigate(t === "overview" ? "/portal" : `/portal/${t}`);

  const { data: home, isLoading } = trpc.portal.home.useQuery();
  const logout = trpc.portal.logout.useMutation({ onSuccess: onSignOut });

  const activeLabel = TABS.find((t) => t.id === tab)?.label ?? "Overview";

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 border-r border-border/40 px-4 py-6 sticky top-0 h-screen flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="font-semibold text-foreground tracking-tight text-sm">Cashflow Coaches</span>
        </div>
        <p className="px-2 text-[11px] text-muted-foreground mb-6 truncate">{clientName}</p>
        <nav className="space-y-1 flex-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => goTo(t.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
        <button
          onClick={() => logout.mutate()}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </aside>

      {/* Mobile header + tab bar */}
      <div className="lg:hidden sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border/40">
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
          <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">Cashflow Coaches</p>
            <p className="text-[10px] text-muted-foreground truncate">{clientName}</p>
          </div>
          <button onClick={() => logout.mutate()} className="p-2 text-muted-foreground" title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-1 px-3 pb-2 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => goTo(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                tab === t.id ? "bg-primary/15 text-primary" : "text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 min-w-0">
        <div className="max-w-5xl mx-auto px-5 lg:px-8 py-7 lg:py-9">
          <div className="mb-6">
            <h1 className="text-lg font-semibold text-foreground tracking-tight">{activeLabel}</h1>
            {tab === "overview" && home && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Welcome back. Here's where your {home.niche} build stands.
              </p>
            )}
          </div>
          {isLoading || !home ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          ) : (
            <>
              {tab === "overview" && <OverviewTab home={home} goTo={goTo} />}
              {tab === "ads" && <AdLibraryTab home={home} />}
              {tab === "todo" && <TodoTab home={home} />}
              {tab === "research" && <ResearchTab />}
              {tab === "pulse" && <PulseTab home={home} />}
              {tab === "docs" && <DocumentsTab home={home} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default function Portal() {
  const utils = trpc.useUtils();
  const { data: me, isLoading } = trpc.portal.me.useQuery();

  useEffect(() => {
    document.title = "Client Portal · Cashflow Coaches";
    return () => {
      document.title = "VoiceMining";
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (!me) {
    return (
      <PortalLogin
        onSignedIn={() => {
          utils.portal.invalidate();
          toast.success("Welcome back");
        }}
      />
    );
  }

  return (
    <PortalShell
      clientName={me.clientName}
      onSignOut={() => {
        utils.portal.invalidate();
      }}
    />
  );
}
