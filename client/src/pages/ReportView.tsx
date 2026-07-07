import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { AppShell } from "@/components/AppShell";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  Download,
  FileText,
  Link2,
  Loader2,
  Mail,
  Megaphone,
  RefreshCw,
  Share2,
  Sparkles,
  Swords,
  TrendingUp,
  Users,
  Video,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  normalizeHooks,
  type AdCopyIdea,
  type CompetitorIntel,
  type DeepMarketIntelligence,
  type DMMessage,
  type EmailMessage,
  type SkoolPostWithDMWorkflow,
  type TalkingHeadScript,
  type YouTubeIdea,
} from "@shared/reportContent";
import { IntelligenceTab, toAnalysisView } from "@/components/report/IntelligenceTab";
import { HooksTab } from "@/components/report/HooksTab";
import { AdsTab } from "@/components/report/AdsTab";
import { SkoolTab } from "@/components/report/SkoolTab";
import { ScriptsTab } from "@/components/report/ScriptsTab";
import { EmailTab } from "@/components/report/EmailTab";
import { CompetitorTab } from "@/components/report/CompetitorTab";

const TABS = [
  { id: "intelligence", label: "Market Intelligence", icon: TrendingUp },
  { id: "hooks", label: "Viral Hooks", icon: Zap },
  { id: "adcopy", label: "Ads", icon: Megaphone },
  { id: "skool", label: "Skool Posts", icon: Users },
  { id: "scripts", label: "Video Scripts", icon: Video },
  { id: "email", label: "Email Sequence", icon: Mail },
  { id: "competitors", label: "Competitor Intel", icon: Swords },
];

// ─── Share Button ─────────────────────────────────────────────────────────────

function ShareButton({ reportId }: { reportId: number }) {
  const [copied, setCopied] = useState(false);
  const { data: share } = trpc.share.getForReport.useQuery({ reportId });
  const utils = trpc.useUtils();
  const createMutation = trpc.share.create.useMutation({
    onSuccess: ({ token }) => {
      utils.share.getForReport.invalidate({ reportId });
      copyShareUrl(token);
    },
    onError: (err) => toast.error(err.message ?? "Failed to create share link"),
  });

  const copyShareUrl = (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    toast.success("Share link copied. Anyone with it can view this report for 30 days.");
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => (share ? copyShareUrl(share.token) : createMutation.mutate({ reportId }))}
      disabled={createMutation.isPending}
      className="border-border/50 text-muted-foreground hover:text-foreground"
    >
      {createMutation.isPending ? (
        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
      ) : copied ? (
        <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
      ) : share ? (
        <Link2 className="w-3.5 h-3.5 mr-1.5" />
      ) : (
        <Share2 className="w-3.5 h-3.5 mr-1.5" />
      )}
      {copied ? "Link Copied" : share ? "Copy Share Link" : "Share Report"}
    </Button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReportView() {
  const { id } = useParams<{ id: string }>();
  const reportId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("intelligence");

  const utils = trpc.useUtils();
  const { data: report, isLoading } = trpc.reports.get.useQuery({ id: reportId });

  // Fetch the underlying search analysis for sentiment/themes/verbatim quotes
  const { data: analysis } = trpc.analysis.getResult.useQuery(
    { searchId: report?.searchId ?? 0 },
    { enabled: !!report?.searchId }
  );

  const regenerateMutation = trpc.reports.regenerate.useMutation({
    onSuccess: () => {
      utils.reports.get.invalidate({ id: reportId });
      toast.success("Report regenerated with latest AI analysis");
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to regenerate report");
    },
  });

  const exportReport = () => {
    if (!report) return;
    const mi2 = (report.marketIntelligence ?? {}) as DeepMarketIntelligence;
    const hooks2 = normalizeHooks(report.viralHooks);
    const ads2 = (report.adCopyIdeas ?? []) as AdCopyIdea[];
    const posts2 = (report.skoolPosts ?? []) as SkoolPostWithDMWorkflow[];
    const scripts2 = (report.talkingHeadScripts ?? []) as TalkingHeadScript[];
    const emails2 = (report.emailSequence ?? { sequenceName: "", emails: [] }) as { sequenceName: string; emails: EmailMessage[] };
    const ideas2 = (report.youtubeIdeas ?? []) as YouTubeIdea[];
    const intel2 = (report.competitorIntel ?? null) as CompetitorIntel | null;

    const esc = (s: string) => s?.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") ?? "";
    const section = (title: string, body: string) =>
      `<div class="section"><h2>${esc(title)}</h2>${body}</div>`;
    const item = (label: string, value: string) =>
      `<div class="item"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span></div>`;
    const block = (text: string) =>
      `<div class="block">${esc(text).replace(/\n/g, "<br/>")}</div>`;

    let body = `<div class="header"><h1>${esc(report.name)}</h1><p>Voice Mining Report &mdash; ${new Date(report.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p></div>`;

    if (mi2.executiveSummary) body += section("Executive Summary", block(mi2.executiveSummary));

    if (mi2.topDesires?.length) body += section("Top Desires", mi2.topDesires.map((p: string) => `<li>${esc(p)}</li>`).join(""));
    if (mi2.topFears?.length) body += section("Top Fears", mi2.topFears.map((p: string) => `<li>${esc(p)}</li>`).join(""));
    if (mi2.dominantBeliefs?.length) body += section("Dominant Beliefs", mi2.dominantBeliefs.map((p: string) => `<li>${esc(p)}</li>`).join(""));
    if (mi2.emotionalTriggers?.length) body += section("Emotional Triggers", mi2.emotionalTriggers.map((p: string) => `<li>${esc(p)}</li>`).join(""));
    if (mi2.languagePatterns?.length) body += section("Language Patterns", mi2.languagePatterns.map((p: string) => `<li>${esc(p)}</li>`).join(""));
    if (mi2.verbatimPhrases?.length) body += section("Verbatim Phrases", mi2.verbatimPhrases.map((p: string) => `<li>${esc(p)}</li>`).join(""));

    if (hooks2.length) body += section("Viral Hooks", hooks2.map((h, i) =>
      `<li><strong>${i + 1}.</strong> ${esc(h.hook)}${h.whyThisWorks ? `<br/><span class="sub">Why it works: ${esc(h.whyThisWorks)}</span>` : ""}</li>`
    ).join(""));

    if (ads2.length) body += section("Ads", ads2.map((ad, i) =>
      `<div class="card"><h3>Ad ${i + 1} &mdash; ${esc(ad.format ?? "")} [${esc(ad.awarenessLevel ?? "")}]${typeof ad.painAgitationScore === "number" ? ` &mdash; Pain agitation ${ad.painAgitationScore}/10` : ""}</h3>${item("Headline", ad.headline ?? "")}${block(ad.body ?? "")}${item("CTA", ad.cta ?? "")}</div>`
    ).join(""));

    if (posts2.length) body += section("Skool Posts", posts2.map((post, i) =>
      `<div class="card"><h3>Post ${i + 1}${post.commentKeyword ? ` [${esc(post.commentKeyword)}]` : " [Link CTA]"}${post.postFormat ? ` &mdash; ${esc(post.postFormat)}` : ""}</h3>${block(post.postCopy ?? "")}${
        post.dmWorkflow?.length
          ? `<h4>DM Workflow</h4>` + (post.dmWorkflow as DMMessage[]).map((dm) =>
            `<div class="dm"><strong>DM ${dm.dmNumber} (${esc(dm.timing)}):</strong><br/>${esc(dm.copy).replace(/\n/g, "<br/>")}</div>`
          ).join("")
          : ""
      }</div>`
    ).join(""));

    if (scripts2.length) body += section("Video Scripts", scripts2.map((s, i) =>
      `<div class="card"><h3>Script ${i + 1}: ${esc(s.title)}${s.estimatedLengthSeconds ? ` (~${s.estimatedLengthSeconds}s)` : ""}</h3>${[
        ["Pattern Interrupt", s.patternInterrupt ?? ""], ["Hook", s.hook], ["Mind Read", s.mindRead], ["Twist / Tease", s.twistTease],
        ["CTA Before Payoff", s.ctaBeforePayoff], ["Payoff", s.payoff], ["Closing CTA", s.closingCta]
      ].filter(([, v]) => v).map(([l, v]) => `<div class="script-row"><span class="label">${esc(l as string)}</span><span class="value">${esc(v as string)}</span></div>`).join("")}${
        s.bRollSuggestions?.length
          ? `<h4>B-Roll</h4>` + s.bRollSuggestions.map((b) => `<div class="dm"><strong>${esc(b.section)}:</strong> ${esc(b.visual)}</div>`).join("")
          : ""
      }<div class="keyword-box">Comment Keyword: <strong>${esc(s.commentKeyword)}</strong></div></div>`
    ).join(""));

    if (ideas2.length) body += section("YouTube Ideas", ideas2.map((idea, i) =>
      `<div class="card"><h3>${i + 1}. ${esc(idea.title)}${idea.searchVolumeTier ? ` [${esc(idea.searchVolumeTier)} volume]` : ""}</h3><div class="sub">${esc(idea.description)}</div>${
        idea.hook ? `${item("First 30s", idea.hook)}` : ""
      }${idea.thumbnailConcept ? item("Thumbnail", idea.thumbnailConcept) : ""}${
        idea.tags?.length ? item("Tags", idea.tags.join(", ")) : ""
      }</div>`
    ).join(""));

    if (emails2.emails?.length) body += section(`Email Sequence: ${esc(emails2.sequenceName)}`, emails2.emails.map((email) =>
      `<div class="card"><h3>Day ${email.dayNumber}: ${esc(email.subject)}${typeof email.openRatePrediction === "number" ? ` &mdash; open score ${email.openRatePrediction}/10` : ""}</h3><div class="sub">Preview: ${esc(email.previewText)}</div>${
        email.splitTestSubject ? `<div class="sub">Split test: ${esc(email.splitTestSubject)}</div>` : ""
      }${block(email.body ?? "")}${
        email.signOff ? `<div class="signoff">${esc(email.signOff).replace(/\n/g, "<br/>")}</div>` : ""
      }</div>`
    ).join(""));

    if (intel2?.competitors?.length) body += section("Competitor Intel", intel2.competitors.map((c) =>
      `<div class="card"><h3>${esc(c.name)}</h3>${item("Their angle", c.angle)}${item("Their weakness", c.weakness)}${item("Gap you can own", c.gap)}${item("Pricing", c.pricingSignals)}</div>`
    ).join("") + (intel2.positioningStatement ? block(`Positioning statement: ${intel2.positioningStatement}`) : ""));

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(report.name)} - Voice Mining Report</title><style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Georgia, serif; font-size: 11pt; color: #1a1a1a; background: #fff; padding: 40px; max-width: 900px; margin: 0 auto; }
      .header { margin-bottom: 32px; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; }
      .header h1 { font-size: 22pt; font-weight: bold; margin-bottom: 4px; }
      .header p { font-size: 10pt; color: #555; }
      .section { margin-bottom: 28px; page-break-inside: avoid; }
      .section h2 { font-size: 13pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-bottom: 12px; color: #111; }
      .section li { margin-left: 20px; margin-bottom: 4px; font-size: 10.5pt; line-height: 1.5; }
      .block { font-size: 10.5pt; line-height: 1.6; white-space: pre-wrap; margin-bottom: 8px; }
      .card { border: 1px solid #e0e0e0; border-radius: 6px; padding: 14px; margin-bottom: 12px; page-break-inside: avoid; }
      .card h3 { font-size: 11pt; font-weight: bold; margin-bottom: 8px; }
      .card h4 { font-size: 10pt; font-weight: bold; margin: 10px 0 6px; color: #444; }
      .item { display: flex; gap: 8px; margin-bottom: 4px; font-size: 10pt; }
      .label { font-weight: bold; min-width: 100px; color: #444; }
      .value { flex: 1; }
      .script-row { display: flex; gap: 8px; margin-bottom: 6px; font-size: 10pt; }
      .keyword-box { margin-top: 10px; padding: 8px 12px; background: #f5f5f5; border-radius: 4px; font-size: 10pt; }
      .dm { margin-bottom: 8px; font-size: 10pt; line-height: 1.5; padding-left: 12px; border-left: 2px solid #ccc; }
      .sub { font-size: 9.5pt; color: #666; margin-bottom: 6px; }
      .signoff { margin-top: 12px; padding-top: 10px; border-top: 1px solid #eee; font-size: 10pt; color: #555; }
      @media print { body { padding: 0; } .section { page-break-inside: avoid; } }
    </style></head><body>${body}</body></html>`;

    const win = window.open("", "_blank");
    if (!win) { toast.error("Pop-up blocked. Please allow pop-ups for this site."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
    toast.success("PDF export opened. Use your browser's Save as PDF option.");
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!report) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-32 text-center px-4">
          <AlertCircle className="w-8 h-8 text-muted-foreground mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-1">Report not found</h2>
          <Button variant="ghost" onClick={() => navigate("/reports")} className="mt-4">
            Back to Reports
          </Button>
        </div>
      </AppShell>
    );
  }

  const mi = (report.marketIntelligence ?? {}) as DeepMarketIntelligence;
  const viralHooks = normalizeHooks(report.viralHooks);
  const adCopy = (report.adCopyIdeas ?? []) as AdCopyIdea[];
  const skoolPosts = (report.skoolPosts ?? []) as SkoolPostWithDMWorkflow[];
  const scripts = (report.talkingHeadScripts ?? []) as TalkingHeadScript[];
  const youtubeIdeas = (report.youtubeIdeas ?? []) as YouTubeIdea[];
  const emailSeq = (report.emailSequence ?? { sequenceName: "Email Sequence", emails: [] }) as { sequenceName: string; emails: EmailMessage[] };
  const competitorIntel = (report.competitorIntel ?? null) as CompetitorIntel | null;
  const analysisView = toAnalysisView(analysis);

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate("/reports")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Reports
          </button>
        </div>

        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-primary" />
              <span className="text-xs text-primary font-medium uppercase tracking-wider">
                Voice Mining Report
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">{report.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {new Date(report.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <ShareButton reportId={reportId} />
            <Button
              size="sm"
              variant="outline"
              onClick={() => regenerateMutation.mutate({ id: reportId })}
              disabled={regenerateMutation.isPending}
              className="border-border/50 text-muted-foreground hover:text-foreground"
            >
              {regenerateMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              {regenerateMutation.isPending ? "Regenerating..." : "Regenerate"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={exportReport}
              className="border-border/50 text-muted-foreground hover:text-foreground"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export PDF
            </Button>
          </div>
        </div>

        {/* Executive Summary */}
        {mi.executiveSummary && (
          <div className="p-5 rounded-xl border border-primary/20 bg-primary/5 mb-6">
            <div className="flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">
                  Executive Summary
                </p>
                <p className="text-sm text-foreground/90 leading-relaxed">{mi.executiveSummary}</p>
              </div>
            </div>
          </div>
        )}
        {!mi.executiveSummary && (
          <div className="p-5 rounded-xl border border-amber-400/20 bg-amber-400/5 mb-6">
            <div className="flex items-start gap-3">
              <RefreshCw className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">Report needs regeneration</p>
                <p className="text-sm text-foreground/70">This report was generated before the latest AI upgrade. Click <strong>Regenerate</strong> above to get the full report with all tabs populated.</p>
              </div>
            </div>
          </div>
        )}

        {/* Sticky tab bar — stays visible while scrolling */}
        <div className="sticky top-0 z-20 -mx-2 px-2 py-2 bg-background/95 backdrop-blur-sm mb-4">
          <div className="flex gap-1 p-1 rounded-xl bg-card/50 border border-border/30 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                    activeTab === tab.id
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === "intelligence" && (
          <IntelligenceTab mi={mi} analysis={analysisView} reportId={reportId} />
        )}
        {activeTab === "hooks" && (
          <HooksTab hooks={viralHooks} reportId={reportId} reportName={report.name} />
        )}
        {activeTab === "adcopy" && (
          <AdsTab ads={adCopy} reportId={reportId} reportName={report.name} />
        )}
        {activeTab === "skool" && (
          <SkoolTab posts={skoolPosts} reportId={reportId} reportName={report.name} />
        )}
        {activeTab === "scripts" && (
          <ScriptsTab scripts={scripts} youtubeIdeas={youtubeIdeas} reportId={reportId} reportName={report.name} />
        )}
        {activeTab === "email" && (
          <EmailTab emailSeq={emailSeq} reportId={reportId} reportName={report.name} />
        )}
        {activeTab === "competitors" && (
          <CompetitorTab intel={competitorIntel} reportId={reportId} />
        )}
      </div>
    </AppShell>
  );
}
