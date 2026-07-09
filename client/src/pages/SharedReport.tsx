import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Clock,
  FileText,
  Loader2,
  Mail,
  Megaphone,
  Sparkles,
  Swords,
  TrendingUp,
  Users,
  Video,
  Zap,
} from "lucide-react";
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

/**
 * Public view of a shared report. Renders the SAME tab components as the
 * owner's ReportView so the client sees the exact same report, pixel for
 * pixel. reportId=0 puts every tab in read-only mode (no regenerate).
 */
export default function SharedReport() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("intelligence");

  const { data, isLoading, error } = trpc.share.getPublic.useQuery(
    { token: token ?? "" },
    { enabled: !!token, retry: false }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center px-4">
        <Clock className="w-8 h-8 text-muted-foreground mb-3" />
        <h2 className="text-lg font-semibold text-foreground mb-1">This share link has expired</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm">
          Share links stay live for 30 days. Ask the person who sent it to share a fresh link.
        </p>
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
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border/30 bg-card/20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="font-semibold text-foreground tracking-tight">VoiceMining</span>
        </div>
      </header>

      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Report header, same layout as the owner view */}
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

        {/* Sticky tab bar, same as owner view */}
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

        {/* Identical tab components; reportId=0 hides owner-only actions */}
        {activeTab === "intelligence" && (
          <IntelligenceTab mi={mi} analysis={analysisView} reportId={0} />
        )}
        {activeTab === "hooks" && <HooksTab hooks={hooks} reportId={0} reportName={report.name} />}
        {activeTab === "adcopy" && <AdsTab ads={ads} reportId={0} reportName={report.name} />}
        {activeTab === "skool" && <SkoolTab posts={posts} reportId={0} reportName={report.name} />}
        {activeTab === "scripts" && (
          <ScriptsTab scripts={scripts} youtubeIdeas={ideas} reportId={0} reportName={report.name} />
        )}
        {activeTab === "email" && <EmailTab emailSeq={emailSeq} reportId={0} reportName={report.name} />}
        {activeTab === "competitors" && <CompetitorTab intel={intel} reportId={0} />}
      </div>
    </div>
  );
}
