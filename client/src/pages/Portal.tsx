import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useParams } from "wouter";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import { MarkdownDoc } from "@/components/MarkdownDoc";
import { RecordingChecklist } from "@/components/RecordingChecklist";
import { CopyButton, stripHtmlBlock } from "@/components/engines";
import { IntelDesk, parseIntelReels } from "@/components/IntelDesk";
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
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clapperboard,
  Download,
  FileText,
  Image as ImageIcon,
  Instagram,
  LayoutDashboard,
  Loader2,
  LogOut,
  Megaphone,
  Search,
  Sparkles,
  TrendingUp,
  X,
  Youtube,
} from "lucide-react";
import { toast } from "sonner";

/**
 * The client portal (app.cashflowcoaches.io/portal): a client signs in with
 * the email + password their coach created and sees THEIR work, read-only.
 * Research first, then the competitor desk (the operator's exact desk),
 * then the working surfaces: to-dos, ad library, and the content pipelines
 * (Draft → To record → In editing → Posted — the same columns the operator
 * sees, because they are the same columns). No generate buttons anywhere.
 */

type PortalHome = inferRouterOutputs<AppRouter>["portal"]["home"];
type PortalAd = PortalHome["ads"][number];
type PortalContentDoc = PortalHome["content"]["shortform"][number];

const TABS = [
  { id: "research", label: "Market Research", icon: Search },
  { id: "competitors", label: "Competitor Research", icon: TrendingUp },
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "todo", label: "To-Do", icon: Clapperboard },
  { id: "ads", label: "Ad Library", icon: Megaphone },
  { id: "shortform", label: "Short-Form", icon: Instagram },
  { id: "youtube", label: "YouTube", icon: Youtube },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Same stages, labels, and tints as the operator's recordable DocBoard. */
const PIPE_STAGES = [
  { id: "draft", label: "Drafts", tint: "bg-slate-500/[0.07] border-slate-500/25" },
  { id: "recording", label: "To record", tint: "bg-amber-500/[0.07] border-amber-500/25" },
  { id: "editing", label: "In editing", tint: "bg-sky-500/[0.07] border-sky-500/25" },
  { id: "posted", label: "Posted", tint: "bg-emerald-500/[0.07] border-emerald-500/25" },
] as const;

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
  const toRecord = rec ? rec.items.filter((i) => !i.recordedAt).length : 0;
  const allContent = [...home.content.shortform, ...home.content.youtube];
  const inEditing = allContent.filter((d) => d.stage === "editing").length;
  const posted = allContent.filter((d) => d.stage === "posted").length;
  const reels = parseIntelReels(home.intelContent ? { content: home.intelContent } : null);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Stat value={String(home.ads.length)} label="Approved ads" />
        <Stat value={String(toRecord)} label="Videos to record" />
        <Stat value={String(inEditing)} label="In editing" />
        <Stat value={String(posted)} label="Content posted" />
      </div>

      {/* The two research surfaces this build stands on */}
      <div className="grid sm:grid-cols-2 gap-2.5">
        <button
          onClick={() => goTo("research")}
          className="rounded-xl border border-border/50 bg-card/30 px-4 py-3.5 text-left hover:border-primary/40 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <Search className="w-3.5 h-3.5 text-primary" />
            <p className="text-sm font-semibold text-foreground">Market research</p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {home.hasReport
              ? "The voice-of-market report your campaigns are built on. Open it."
              : "Your market research report is in production."}
          </p>
        </button>
        <button
          onClick={() => goTo("competitors")}
          className="rounded-xl border border-border/50 bg-card/30 px-4 py-3.5 text-left hover:border-primary/40 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            <p className="text-sm font-semibold text-foreground">Competitor research</p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {reels.length
              ? `${reels.length} winning pieces from your market, broken down hook by hook.`
              : "The first competitor sweep of your market is on its way."}
          </p>
        </button>
      </div>

      {toRecord > 0 && (
        <button
          onClick={() => goTo("todo")}
          className="w-full rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-3 flex items-center gap-3 text-left hover:bg-primary/10 transition-colors"
        >
          <Clapperboard className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="flex-1 text-sm text-foreground">
            {toRecord} video{toRecord === 1 ? "" : "s"} waiting on you to record
          </span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      )}

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
          <div
            key={ad.id}
            className="group rounded-xl overflow-hidden border border-border/50 bg-card/30 hover:border-primary/40 transition-colors"
          >
            <button onClick={() => setOpenIdx(i)} className="block w-full aspect-[4/5] overflow-hidden" title={ad.filename}>
              <img
                src={`/api/portal/assets/${ad.id}`}
                alt={adLabel(ad)}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
              />
            </button>
            <div className="px-3 py-2.5 flex items-center gap-2">
              <button onClick={() => setOpenIdx(i)} className="flex-1 text-left text-xs font-medium text-foreground truncate">
                {adLabel(ad)}
              </button>
              <a
                href={`/api/portal/assets/${ad.id}?download`}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="Download PNG"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
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
  const { data: rec } = trpc.recording.get.useQuery(
    { token: home.recordingToken ?? "" },
    { enabled: !!home.recordingToken }
  );
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
      {(rec?.items.length ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground mb-4">
          Each card is one video, scripted word for word. Open it to read the full script, film it, tick it off, and
          paste your recording link. Ticked scripts move to In editing on your pipelines automatically.
        </p>
      )}
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

/** The operator's Competitor Desk, exactly — same component, read-only data. */
function CompetitorsTab({ home }: { home: PortalHome }) {
  const reels = parseIntelReels(home.intelContent ? { content: home.intelContent } : null);
  if (!home.intelContent) {
    return (
      <div className="text-center py-20">
        <TrendingUp className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">The first competitor sweep of your market is on its way.</p>
      </div>
    );
  }
  return (
    <IntelDesk
      reels={reels}
      reportDoc={{ title: "Competitor intel report", content: home.intelContent }}
    />
  );
}

/**
 * A content pipeline, client-side: the operator's exact columns. The only
 * action the client has is the one that is theirs — "I recorded this".
 */
function PipelineTab({ docs, emptyNote }: { docs: PortalContentDoc[]; emptyNote: string }) {
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState<number | null>(null);
  const advance = trpc.portal.advanceDoc.useMutation({
    onSuccess: () => {
      utils.portal.home.invalidate();
      utils.recording.get.invalidate();
      toast.success("Nice. Moved to In editing.");
    },
    onError: (err) => toast.error(err.message),
  });

  if (!docs.length) {
    return (
      <div className="text-center py-20">
        <Clapperboard className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">{emptyNote}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-4">
        Every piece moves left to right: your coach drafts, you record, they edit, it posts. Scripts in "To record" are
        also on your To-Do list.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {PIPE_STAGES.map((col) => {
          const items = docs.filter((d) => d.stage === col.id);
          return (
            <div key={col.id} className={`rounded-xl border p-2.5 min-h-28 ${col.tint}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70 px-1 pb-2">
                {col.label} <span className="text-muted-foreground font-normal">· {items.length}</span>
              </p>
              <div className="space-y-2">
                {items.map((doc) => (
                  <div key={doc.id} className="rounded-lg border border-border/60 bg-background/70 shadow-sm">
                    <button
                      onClick={() => setExpanded(expanded === doc.id ? null : doc.id)}
                      className="w-full flex items-center gap-2 p-2.5 text-left"
                    >
                      <FileText className="w-3 h-3 text-primary flex-shrink-0" />
                      <span className="flex-1 text-[11px] font-medium text-foreground leading-snug">{doc.title}</span>
                      {expanded === doc.id ? (
                        <ChevronUp className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      )}
                    </button>
                    <div className="flex items-center gap-1 px-2.5 pb-2">
                      {col.id === "recording" && (
                        <button
                          disabled={advance.isPending}
                          onClick={() => advance.mutate({ docId: doc.id })}
                          className="h-5 px-2 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 flex items-center gap-1"
                          title="Filmed it? Move it to editing"
                        >
                          <Check className="w-2.5 h-2.5" />
                          Recorded
                        </button>
                      )}
                      <span className="flex-1" />
                      <CopyButton text={stripHtmlBlock(doc.content)} className="px-1.5" />
                    </div>
                    {expanded === doc.id && (
                      <div className="px-3 pb-3 border-t border-border/40 pt-3">
                        <MarkdownDoc content={stripHtmlBlock(doc.content)} />
                      </div>
                    )}
                  </div>
                ))}
                {!items.length && <p className="text-[10px] text-muted-foreground/50 px-1">Empty</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PortalShell({ clientName, onSignOut }: { clientName: string; onSignOut: () => void }) {
  const params = useParams<{ tab?: TabId }>();
  const [, navigate] = useLocation();
  const tab: TabId = TABS.some((t) => t.id === params.tab) ? (params.tab as TabId) : "research";
  const goTo = (t: TabId) => navigate(t === "research" ? "/portal" : `/portal/${t}`);

  const { data: home, isLoading } = trpc.portal.home.useQuery();
  const logout = trpc.portal.logout.useMutation({ onSuccess: onSignOut });

  const activeLabel = TABS.find((t) => t.id === tab)?.label ?? "Market Research";

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
              {tab === "research" && <ResearchTab />}
              {tab === "competitors" && <CompetitorsTab home={home} />}
              {tab === "overview" && <OverviewTab home={home} goTo={goTo} />}
              {tab === "todo" && <TodoTab home={home} />}
              {tab === "ads" && <AdLibraryTab home={home} />}
              {tab === "shortform" && (
                <PipelineTab
                  docs={home.content.shortform}
                  emptyNote="Your short-form pipeline fills up as reels are scripted."
                />
              )}
              {tab === "youtube" && (
                <PipelineTab
                  docs={home.content.youtube}
                  emptyNote="Your YouTube pipeline fills up as videos are scripted."
                />
              )}
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
    return <PortalLogin onSignedIn={() => utils.portal.invalidate()} />;
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
