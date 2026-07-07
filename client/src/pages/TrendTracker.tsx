import { useState, useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Flame, Gauge, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ─── Momentum badge colours ───────────────────────────────────────────────────

const momentumColour: Record<string, string> = {
  Rising: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Emerging: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Stable: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  Declining: "bg-red-500/20 text-red-400 border-red-500/30",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TrendTracker() {
  const [selectedKeyword, setSelectedKeyword] = useState<string>("");

  // Keywords from the user's past searches
  const { data: userKeywords = [], isLoading: loadingKeywords } =
    trpc.trends.getUserKeywords.useQuery();

  // All keywords that already have snapshots
  const { data: snapshotKeywords = [] } = trpc.trends.getKeywords.useQuery();

  // Momentum scores + top rising topics across all tracked keywords
  const { data: momentum } = trpc.trends.momentum.useQuery();

  // Merge both lists, deduplicated
  const allKeywords = useMemo(() => {
    const merged = Array.from(
      new Set([...userKeywords, ...snapshotKeywords])
    ).sort();
    return merged;
  }, [userKeywords, snapshotKeywords]);

  // Auto-select first keyword once loaded
  const effectiveKeyword =
    selectedKeyword || (allKeywords.length > 0 ? allKeywords[0] : "");

  const utils = trpc.useUtils();
  const manualRefresh = trpc.trends.manualRefresh.useMutation({
    onSuccess: () => {
      utils.trends.getSnapshots.invalidate();
      utils.trends.getKeywords.invalidate();
      toast.success("Trend snapshot refreshed!");
    },
    onError: (err) => toast.error(err.message ?? "Refresh failed"),
  });

  // Last 7 snapshots for the selected keyword
  const { data: snapshots = [], isLoading: loadingSnapshots } =
    trpc.trends.getSnapshots.useQuery(
      { keyword: effectiveKeyword, days: 7 },
      { enabled: !!effectiveKeyword }
    );

  // Latest snapshot for detail view
  const latestSnapshot = snapshots[0] ?? null;

  // Build chart data — oldest first
  const chartData = useMemo(() => {
    const sorted = [...snapshots].sort((a, b) =>
      a.snapshotDate.localeCompare(b.snapshotDate)
    );
    return sorted.map((s) => {
      const topics = (s.trendingTopics ?? []) as Array<{
        name: string;
        score: number;
        momentum: string;
      }>;
      const rising = topics.filter((t) => t.momentum === "Rising").length;
      const emerging = topics.filter((t) => t.momentum === "Emerging").length;
      const stable = topics.filter((t) => t.momentum === "Stable").length;
      const avgScore =
        topics.length > 0
          ? Math.round(topics.reduce((sum, t) => sum + (t.score ?? 0), 0) / topics.length)
          : 0;
      return {
        date: s.snapshotDate.slice(5), // MM-DD
        Rising: rising,
        Emerging: emerging,
        Stable: stable,
        "Avg Score": avgScore,
      };
    });
  }, [snapshots]);

  const hasSnapshots = snapshots.length > 0;

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">Trend Tracker</h1>
            <p className="text-sm text-zinc-400 mt-1">
              What's gaining momentum for your keywords.
            </p>
          </div>

          {/* Keyword selector + Refresh button */}
          <div className="flex items-center gap-2">
            {effectiveKeyword && (
              <Button
                size="sm"
                variant="outline"
                disabled={manualRefresh.isPending}
                onClick={() => manualRefresh.mutate({ keyword: effectiveKeyword })}
                className="border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 flex-shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${manualRefresh.isPending ? "animate-spin" : ""}`} />
                {manualRefresh.isPending ? "Refreshing..." : "Refresh Now"}
              </Button>
            )}
          <div className="w-64">
            {loadingKeywords ? (
              <div className="h-10 bg-zinc-800 rounded-md animate-pulse" />
            ) : allKeywords.length === 0 ? (
              <div className="text-sm text-zinc-500 italic">
                Run a search first to track trends
              </div>
            ) : (
              <Select
                value={effectiveKeyword}
                onValueChange={setSelectedKeyword}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue placeholder="Select keyword..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {allKeywords.map((kw) => (
                    <SelectItem
                      key={kw}
                      value={kw}
                      className="text-white hover:bg-zinc-800"
                    >
                      {kw}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          </div>
        </div>

        {/* Trending Now — top rising topics across all keywords */}
        {(momentum?.trendingNow.length ?? 0) > 0 && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Flame className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Trending Now</h2>
              <span className="text-xs text-zinc-500">top rising topics across all your keywords</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(momentum?.trendingNow ?? []).map((topic, i) => (
                <button
                  key={`${topic.keyword}-${topic.name}`}
                  onClick={() => setSelectedKeyword(topic.keyword)}
                  className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-emerald-500/40 transition-all text-left"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-mono text-zinc-500">#{i + 1}</span>
                    <Badge className={momentumColour[topic.momentum] ?? momentumColour.Stable}>
                      {topic.momentum}
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold text-white mb-1">{topic.name}</p>
                  <p className="text-xs text-zinc-400 line-clamp-2">{topic.description}</p>
                  <p className="text-xs text-zinc-500 mt-2">
                    from <span className="text-emerald-400">{topic.keyword}</span> · score {topic.score}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Momentum scores per keyword */}
        {(momentum?.keywords.length ?? 0) > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Gauge className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-white">Keyword Momentum</h2>
              <span className="text-xs text-zinc-500">0-100, based on recent snapshot velocity</span>
            </div>
            <div className="space-y-3">
              {(momentum?.keywords ?? []).map(({ keyword, momentum: score, snapshotCount }) => (
                <button
                  key={keyword}
                  onClick={() => setSelectedKeyword(keyword)}
                  className="w-full text-left group"
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className={`text-sm font-medium transition-colors ${effectiveKeyword === keyword ? "text-white" : "text-zinc-400 group-hover:text-white"}`}>
                      {keyword}
                    </span>
                    <span className={`text-sm font-semibold ${score >= 60 ? "text-emerald-400" : score >= 30 ? "text-yellow-400" : "text-zinc-500"}`}>
                      {score}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${score >= 60 ? "bg-emerald-400" : score >= 30 ? "bg-yellow-400" : "bg-zinc-600"}`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-600 mt-0.5">{snapshotCount} snapshot{snapshotCount === 1 ? "" : "s"}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No keyword selected */}
        {!effectiveKeyword && !loadingKeywords && (
          <EmptyState
            title="No searches yet"
            description="Run a Voice Mining search first. Your keywords will show up here."
          />
        )}

        {/* Loading */}
        {effectiveKeyword && loadingSnapshots && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-zinc-800 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Awaiting first refresh */}
        {effectiveKeyword && !loadingSnapshots && !hasSnapshots && (
          <EmptyState
            title={`No snapshots yet for "${effectiveKeyword}"`}
            description="Hit Refresh Now to pull the first one. It takes about a minute."
          />
        )}

        {/* Data view */}
        {hasSnapshots && (
          <>
            {/* 7-day trend chart */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-base font-semibold">
                  7-Day Trend Activity: {effectiveKeyword}
                </CardTitle>
                <p className="text-xs text-zinc-500">
                  Number of Rising / Emerging / Stable topics per day
                </p>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 4, right: 16, left: -16, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorRising" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorEmerging" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorStable" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#eab308" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "#71717a", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#71717a", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#18181b",
                          border: "1px solid #3f3f46",
                          borderRadius: "8px",
                          color: "#fff",
                          fontSize: 12,
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="Rising"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#colorRising)"
                      />
                      <Area
                        type="monotone"
                        dataKey="Emerging"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fill="url(#colorEmerging)"
                      />
                      <Area
                        type="monotone"
                        dataKey="Stable"
                        stroke="#eab308"
                        strokeWidth={1.5}
                        fill="url(#colorStable)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Latest snapshot detail */}
            {latestSnapshot && (
              <>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white">
                    Latest Snapshot
                  </h2>
                  <span className="text-xs text-zinc-500">
                    {latestSnapshot.snapshotDate}
                  </span>
                </div>

                {/* Trending topics */}
                <div>
                  <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
                    Trending Topics
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {((latestSnapshot.trendingTopics ?? []) as Array<{
                      name: string;
                      description: string;
                      score: number;
                      momentum: string;
                    }>).map((topic, i) => (
                      <div
                        key={i}
                        className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-3"
                      >
                        {/* Score ring */}
                        <div className="flex-shrink-0 w-10 h-10 rounded-full border-2 border-zinc-700 flex items-center justify-center text-xs font-bold text-white">
                          {topic.score}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-semibold text-white">
                              {topic.name}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-xs ${momentumColour[topic.momentum] ?? "bg-zinc-700 text-zinc-300"}`}
                            >
                              {topic.momentum}
                            </Badge>
                          </div>
                          <p className="text-xs text-zinc-400 leading-relaxed">
                            {topic.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Trending phrases */}
                <div>
                  <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
                    Trending Phrases
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {((latestSnapshot.trendingPhrases ?? []) as string[]).map(
                      (phrase, i) => (
                        <span
                          key={i}
                          className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs px-3 py-1.5 rounded-full"
                        >
                          {phrase}
                        </span>
                      )
                    )}
                  </div>
                </div>

                {/* Emerging questions */}
                <div>
                  <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
                    Emerging Questions
                  </h3>
                  <div className="space-y-2">
                    {((latestSnapshot.emergingQuestions ?? []) as string[]).map(
                      (q, i) => (
                        <div
                          key={i}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 flex items-start gap-3"
                        >
                          <span className="text-zinc-600 text-xs font-mono mt-0.5 flex-shrink-0">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="text-sm text-zinc-300">{q}</span>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Snapshot history */}
                {snapshots.length > 1 && (
                  <div>
                    <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
                      Snapshot History
                    </h3>
                    <div className="space-y-2">
                      {snapshots.slice(1).map((snap, i) => {
                        const topics = (snap.trendingTopics ?? []) as Array<{
                          name: string;
                          score: number;
                          momentum: string;
                        }>;
                        const rising = topics.filter(
                          (t) => t.momentum === "Rising"
                        ).length;
                        const emerging = topics.filter(
                          (t) => t.momentum === "Emerging"
                        ).length;
                        return (
                          <div
                            key={i}
                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 flex items-center justify-between gap-4"
                          >
                            <span className="text-sm text-zinc-400">
                              {snap.snapshotDate}
                            </span>
                            <div className="flex gap-3 text-xs">
                              <span className="text-emerald-400">
                                {rising} Rising
                              </span>
                              <span className="text-blue-400">
                                {emerging} Emerging
                              </span>
                              <span className="text-zinc-500">
                                {topics.length} total topics
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-3xl">
        📡
      </div>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="text-sm text-zinc-400 max-w-md leading-relaxed">{description}</p>
    </div>
  );
}
