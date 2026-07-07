import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { AppShell } from "@/components/AppShell";
import { insightTexts } from "@shared/reportContent";
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  ChevronLeft,
  Loader2,
  Quote,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";

const CATEGORY_CONFIG = {
  pain_points: {
    label: "Pain Points",
    color: "text-red-400",
    bg: "bg-red-400/10 border-red-400/20",
    dot: "bg-red-400",
  },
  desires: {
    label: "Desires",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/20",
    dot: "bg-emerald-400",
  },
  objections: {
    label: "Objections",
    color: "text-yellow-400",
    bg: "bg-yellow-400/10 border-yellow-400/20",
    dot: "bg-yellow-400",
  },
  fears: {
    label: "Fears",
    color: "text-orange-400",
    bg: "bg-orange-400/10 border-orange-400/20",
    dot: "bg-orange-400",
  },
  buying_triggers: {
    label: "Buying Triggers",
    color: "text-purple-400",
    bg: "bg-purple-400/10 border-purple-400/20",
    dot: "bg-purple-400",
  },
  emotional_language: {
    label: "Emotional Language",
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/20",
    dot: "bg-blue-400",
  },
  trending_phrases: {
    label: "Trending Phrases",
    color: "text-cyan-400",
    bg: "bg-cyan-400/10 border-cyan-400/20",
    dot: "bg-cyan-400",
  },
};

const SENTIMENT_COLORS = [
  "oklch(0.70 0.15 150)",
  "oklch(0.60 0.22 25)",
  "oklch(0.55 0.010 265)",
];

export default function SearchResults() {
  const { id } = useParams<{ id: string }>();
  const searchId = parseInt(id ?? "0");
  const [, navigate] = useLocation();

  const { data: search, isLoading: searchLoading } = trpc.mining.get.useQuery(
    { id: searchId },
    {
      refetchInterval: (query) => {
        const s = query.state.data;
        if (!s) return false;
        return s.status === "mining" || s.status === "analyzing" ? 2000 : false;
      },
    }
  );

  const { data: analysis, isLoading: analysisLoading } = trpc.analysis.getResult.useQuery(
    { searchId },
    { enabled: search?.status === "complete" }
  );

  const { data: existingReport } = trpc.reports.getBySearch.useQuery(
    { searchId },
    {
      enabled: search?.status === "complete",
      // Poll until the report appears (auto-generated in background)
      refetchInterval: (query) => (query.state.data ? false : 3000),
    }
  );

  // Auto-redirect to report as soon as it is ready
  useEffect(() => {
    if (existingReport?.id) {
      navigate(`/report/${existingReport.id}`);
    }
  }, [existingReport?.id]);

  // Live scraping preview: accumulate each distinct progress message into a log
  const [progressLog, setProgressLog] = useState<Array<{ time: string; message: string }>>([]);
  useEffect(() => {
    const message = search?.progressMessage;
    if (!message) return;
    setProgressLog((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].message === message) return prev;
      const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      return [...prev, { time, message }];
    });
  }, [search?.progressMessage]);

  if (searchLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full py-32">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!search) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-32 text-center px-4">
          <AlertCircle className="w-8 h-8 text-muted-foreground mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-1">Search not found</h2>
          <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mt-4">
            Back to Dashboard
          </Button>
        </div>
      </AppShell>
    );
  }

  const isProcessing = search.status === "mining" || search.status === "analyzing";
  const isFailed = search.status === "failed";
  const isComplete = search.status === "complete";

  const sentimentData = analysis
    ? [
        { name: "Positive", value: analysis.sentimentBreakdown.positive },
        { name: "Negative", value: analysis.sentimentBreakdown.negative },
        { name: "Neutral", value: analysis.sentimentBreakdown.neutral },
      ]
    : [];

  const themeData = analysis?.topThemes.map((t) => ({
    subject: t.name.length > 12 ? t.name.slice(0, 12) + "…" : t.name,
    value: t.frequency,
  })) ?? [];

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Dashboard
          </button>
        </div>

        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight mb-1">
              {search.keyword}
            </h1>
            {search.niche && (
              <p className="text-sm text-muted-foreground">{search.niche}</p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(search.platforms as string[]).map((p) => (
                <span
                  key={p}
                  className="px-2 py-0.5 rounded-full text-xs border border-border/40 text-muted-foreground"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Progress — shown while mining/analyzing */}
        {isProcessing && (
          <div className="mb-8 p-5 rounded-xl border border-primary/20 bg-primary/5">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
              <span className="text-sm font-medium text-foreground">
                {search.progressMessage ?? "Processing..."}
              </span>
            </div>
            <div className="w-full h-1.5 bg-border/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-700"
                style={{ width: `${search.progress}%` }}
              />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs text-muted-foreground">
                {search.status === "mining"
                  ? "Deep-scraping Reddit threads, YouTube comments, Hacker News, Trustpilot reviews, Google, DuckDuckGo, Quora, forums, news..."
                  : "AI generating market intelligence + viral hooks + ads + scripts + emails"}
              </span>
              <span className="text-xs text-primary font-medium">{search.progress}%</span>
            </div>

            {/* Live progress log */}
            {progressLog.length > 0 && (
              <div className="mt-4 pt-4 border-t border-primary/10">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Live Log</p>
                <div className="space-y-1.5 font-mono">
                  {progressLog.map((entry, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs">
                      <span className="text-muted-foreground/40 flex-shrink-0">{entry.time}</span>
                      <span className={i === progressLog.length - 1 ? "text-primary" : "text-muted-foreground"}>
                        {entry.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Complete — waiting for report to be ready (auto-redirect will fire) */}
        {isComplete && !existingReport && (
          <div className="mb-8 p-5 rounded-xl border border-primary/20 bg-primary/5">
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
              <span className="text-sm font-medium text-foreground">
                Finalising your report — redirecting shortly...
              </span>
            </div>
          </div>
        )}

        {/* Failed */}
        {isFailed && (
          <div className="mb-8 p-5 rounded-xl border border-destructive/20 bg-destructive/5">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-destructive" />
              <span className="text-sm text-destructive">
                Analysis failed. Please try creating a new search.
              </span>
            </div>
          </div>
        )}

        {/* Results — shown briefly before auto-redirect fires */}
        {isComplete && analysis && (
          <div className="space-y-6">
            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Sentiment */}
              <div className="p-5 rounded-xl border border-border/50 bg-card/30">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Sentiment Breakdown
                </h3>
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie
                        data={sentimentData}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={55}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {sentimentData.map((_, i) => (
                          <Cell key={i} fill={SENTIMENT_COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "oklch(0.14 0.010 265)",
                          border: "1px solid oklch(0.22 0.010 265)",
                          borderRadius: "8px",
                          color: "oklch(0.96 0.005 265)",
                          fontSize: "12px",
                        }}
                        formatter={(v) => [`${v}%`, ""]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 flex-1">
                    {sentimentData.map((item, i) => (
                      <div key={item.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ background: SENTIMENT_COLORS[i] }}
                          />
                          <span className="text-xs text-muted-foreground">{item.name}</span>
                        </div>
                        <span className="text-xs font-medium text-foreground">{item.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Themes Radar */}
              {themeData.length > 0 && (
                <div className="p-5 rounded-xl border border-border/50 bg-card/30">
                  <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Top Themes
                  </h3>
                  <ResponsiveContainer width="100%" height={120}>
                    <RadarChart data={themeData}>
                      <PolarGrid stroke="oklch(0.30 0.010 265)" />
                      <PolarAngleAxis
                        dataKey="subject"
                        tick={{ fontSize: 9, fill: "oklch(0.60 0.010 265)" }}
                      />
                      <Radar
                        dataKey="value"
                        stroke="oklch(0.65 0.20 265)"
                        fill="oklch(0.65 0.20 265)"
                        fillOpacity={0.2}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Insight Categories */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {(
                [
                  { key: "pain_points", items: insightTexts(analysis.painPoints) },
                  { key: "desires", items: insightTexts(analysis.desires) },
                  { key: "objections", items: insightTexts(analysis.objections) },
                  { key: "fears", items: insightTexts(analysis.fears) },
                  { key: "buying_triggers", items: analysis.buyingTriggers },
                  { key: "emotional_language", items: analysis.emotionalLanguage },
                ] as const
              ).map(({ key, items }) => {
                const config = CATEGORY_CONFIG[key];
                if (!items?.length) return null;
                return (
                  <div
                    key={key}
                    className={`p-4 rounded-xl border ${config.bg}`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                      <h4 className={`text-xs font-semibold uppercase tracking-wider ${config.color}`}>
                        {config.label}
                      </h4>
                      <span className="text-xs text-muted-foreground ml-auto">{items.length}</span>
                    </div>
                    <ul className="space-y-1.5">
                      {items.slice(0, 5).map((item, i) => (
                        <li key={i} className="text-xs text-foreground/80 leading-relaxed">
                          {item}
                        </li>
                      ))}
                      {items.length > 5 && (
                        <li className="text-xs text-muted-foreground">+{items.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>

            {/* Verbatim Quotes */}
            {analysis.verbatimQuotes?.length > 0 && (
              <div className="p-5 rounded-xl border border-border/50 bg-card/30">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Quote className="w-4 h-4 text-primary" />
                  Verbatim Quotes
                </h3>
                <div className="space-y-3">
                  {analysis.verbatimQuotes.slice(0, 4).map((q, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-0.5 bg-primary/30 rounded-full flex-shrink-0" />
                      <div>
                        <p className="text-sm text-foreground/80 italic leading-relaxed">
                          "{q.text}"
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {q.platform} · {q.category}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trending Phrases */}
            {analysis.trendingPhrases?.length > 0 && (
              <div className="p-5 rounded-xl border border-border/50 bg-card/30">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  Trending Phrases
                </h3>
                <div className="flex flex-wrap gap-2">
                  {analysis.trendingPhrases.map((phrase, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 rounded-full text-xs border border-cyan-400/20 bg-cyan-400/10 text-cyan-300"
                    >
                      {phrase}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pending state */}
        {search.status === "pending" && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">Analysis queued</h3>
            <p className="text-xs text-muted-foreground">Starting shortly...</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
