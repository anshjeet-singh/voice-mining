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
import { HOOK_TYPE_CONFIG, AWARENESS_CONFIG, BulletList, TagList, POST_FORMAT_CONFIG } from "@/components/report/reportShared";

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
 * Read-only public view of a shared report. No auth, no save/copy-to-vault,
 * with a "Get Your Own Report" CTA at the bottom.
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
          Share links stay live for 30 days. Ask the person who sent it to share a fresh link, or run your own report.
        </p>
        <Button onClick={() => navigate("/")} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Sparkles className="w-4 h-4 mr-2" />
          Get Your Own Report
        </Button>
      </div>
    );
  }

  const { report } = data;
  const mi = (report.marketIntelligence ?? {}) as DeepMarketIntelligence;
  const hooks = normalizeHooks(report.viralHooks);
  const ads = (report.adCopyIdeas ?? []) as AdCopyIdea[];
  const posts = (report.skoolPosts ?? []) as SkoolPostWithDMWorkflow[];
  const scripts = (report.talkingHeadScripts ?? []) as TalkingHeadScript[];
  const ideas = (report.youtubeIdeas ?? []) as YouTubeIdea[];
  const emailSeq = (report.emailSequence ?? { sequenceName: "", emails: [] }) as { sequenceName: string; emails: EmailMessage[] };
  const intel = (report.competitorIntel ?? null) as CompetitorIntel | null;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border/30 bg-card/20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="font-semibold text-foreground tracking-tight">VoiceMining</span>
          </div>
          <Button
            size="sm"
            onClick={() => navigate("/")}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Get Your Own Report
          </Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Report header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-xs text-primary font-medium uppercase tracking-wider">Shared Voice Mining Report</span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">{report.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date(report.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        {mi.executiveSummary && (
          <div className="p-5 rounded-xl border border-primary/20 bg-primary/5 mb-6">
            <div className="flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Executive Summary</p>
                <p className="text-sm text-foreground/90 leading-relaxed">{mi.executiveSummary}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="sticky top-0 z-20 -mx-2 px-2 py-2 bg-background/95 backdrop-blur-sm mb-4">
          <div className="flex gap-1 p-1 rounded-xl bg-card/50 border border-border/30 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                    activeTab === tab.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Read-only content */}
        {activeTab === "intelligence" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Competitor Patterns", data: mi.competitorPatterns, dot: "bg-yellow-400", color: "text-yellow-400" },
                { label: "Emerging Opportunities", data: mi.emergingOpportunities, dot: "bg-emerald-400", color: "text-emerald-400" },
                { label: "Market Shifts", data: mi.marketShifts, dot: "bg-blue-400", color: "text-blue-400" },
              ].map(({ label, data: items, dot, color }) => (
                <div key={label} className="p-4 rounded-xl border border-border/40 bg-card/30">
                  <h4 className={`text-xs font-semibold mb-3 ${color}`}>{label}</h4>
                  <BulletList items={items ?? []} dotColor={dot} />
                </div>
              ))}
            </div>
            <div className="p-5 rounded-xl border border-border/40 bg-card/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Core Desires</p>
              <TagList items={mi.topDesires ?? []} color="bg-emerald-400/10 border-emerald-400/20 text-emerald-300" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-5">Core Fears</p>
              <TagList items={mi.topFears ?? []} color="bg-red-400/10 border-red-400/20 text-red-300" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-5">Verbatim Phrases</p>
              <BulletList items={mi.verbatimPhrases ?? []} />
            </div>
          </div>
        )}

        {activeTab === "hooks" && (
          <div className="space-y-3">
            {hooks.map((hook, i) => {
              const cfg = HOOK_TYPE_CONFIG[hook.hookType] ?? HOOK_TYPE_CONFIG.curiosity;
              return (
                <div key={i} className="p-4 rounded-xl border border-border/40 bg-card/30">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>{cfg.label}</span>
                  <p className="text-sm text-foreground leading-relaxed mt-2">{hook.hook}</p>
                  {hook.whyThisWorks && (
                    <p className="text-xs text-muted-foreground/70 mt-1.5 italic">Why this works: {hook.whyThisWorks}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "adcopy" && (
          <div className="space-y-4">
            {ads.map((ad, i) => {
              const awareness = AWARENESS_CONFIG[ad.awarenessLevel] ?? AWARENESS_CONFIG.problem_aware;
              return (
                <div key={i} className="p-5 rounded-xl border border-border/40 bg-card/30">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="text-sm font-semibold text-foreground capitalize">{ad.format.replace(/_/g, " ")} Ad {i + 1}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${awareness.bg} ${awareness.color}`}>{awareness.label}</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground mb-2">{ad.headline}</p>
                  <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line mb-3">{ad.body}</p>
                  <p className="text-sm text-primary font-medium">{ad.cta}</p>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "skool" && (
          <div className="space-y-4">
            {posts.map((post, i) => {
              const fmt = post.postFormat ? POST_FORMAT_CONFIG[post.postFormat] : null;
              return (
                <div key={i} className="p-5 rounded-xl border border-border/40 bg-card/30">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">Post {i + 1} [{post.commentKeyword}]</span>
                    {fmt && <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${fmt.color}`}>{fmt.label}</span>}
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{post.postCopy}</p>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "scripts" && (
          <div className="space-y-4">
            {ideas.map((idea, i) => (
              <div key={`yt-${i}`} className="p-5 rounded-xl border border-border/40 bg-card/30">
                <p className="text-sm font-semibold text-foreground mb-1">{idea.title}</p>
                <p className="text-xs text-muted-foreground">{idea.description}</p>
              </div>
            ))}
            {scripts.map((script, i) => (
              <div key={`s-${i}`} className="p-5 rounded-xl border border-border/40 bg-card/30 space-y-3">
                <p className="text-sm font-semibold text-foreground">{script.title}</p>
                {[
                  ["Pattern Interrupt", script.patternInterrupt],
                  ["Hook", script.hook],
                  ["Mind Read", script.mindRead],
                  ["Twist / Tease", script.twistTease],
                  ["CTA", script.ctaBeforePayoff],
                  ["Payoff", script.payoff],
                  ["Closing CTA", script.closingCta],
                ].filter(([, v]) => v).map(([label, text]) => (
                  <div key={label} className="pl-4 border-l-2 border-l-primary/40">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
                    <p className="text-sm text-foreground/90 leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {activeTab === "email" && (
          <div className="space-y-4">
            {(emailSeq.emails ?? []).map((email, i) => (
              <div key={i} className="p-5 rounded-xl border border-border/40 bg-card/30">
                <p className="text-xs text-muted-foreground mb-1">Day {email.dayNumber}</p>
                <p className="text-sm font-semibold text-foreground mb-2">{email.subject}</p>
                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{email.body.replace(/<[^>]+>/g, "")}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === "competitors" && (
          <div className="space-y-4">
            {intel ? (
              intel.competitors.map((c, i) => (
                <div key={i} className="p-5 rounded-xl border border-border/40 bg-card/30">
                  <p className="text-sm font-semibold text-foreground mb-2">{c.name}</p>
                  <p className="text-xs text-muted-foreground mb-1"><span className="font-semibold">Angle:</span> {c.angle}</p>
                  <p className="text-xs text-red-300/90 mb-1"><span className="font-semibold">Weakness:</span> {c.weakness}</p>
                  <p className="text-xs text-emerald-300/90"><span className="font-semibold">Gap:</span> {c.gap}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No competitor intel in this report.</p>
            )}
          </div>
        )}

        {/* Bottom CTA */}
        <div className="mt-12 p-8 rounded-2xl border border-primary/20 bg-primary/5 text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Want this for your own market?</h2>
          <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
            VoiceMining scrapes real conversations across 10 platforms and turns them into hooks, ads, posts, scripts, and emails in your market's exact words.
          </p>
          <Button
            size="lg"
            onClick={() => navigate("/")}
            className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Get Your Own Report
          </Button>
        </div>
      </div>
    </div>
  );
}
