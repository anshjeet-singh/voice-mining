import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { AppShell } from "@/components/AppShell";
import { insightTexts } from "@shared/reportContent";
import {
  AlertCircle,
  BarChart2,
  GitCompare,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const COMPARISON_COLORS = [
  "oklch(0.72 0.18 285)",
  "oklch(0.65 0.16 200)",
  "oklch(0.70 0.15 150)",
  "oklch(0.68 0.17 340)",
  "oklch(0.72 0.16 55)",
];

export default function NicheComparison() {
  const [, navigate] = useLocation();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const { data: searches, isLoading: searchesLoading } = trpc.mining.list.useQuery();
  const completedSearches = searches?.filter((s) => s.status === "complete") ?? [];

  const { data: comparisonData, isLoading: comparing } = trpc.comparison.compare.useQuery(
    { searchIds: selectedIds },
    { enabled: selectedIds.length >= 2 }
  );

  const toggleSearch = (id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) {
        return [...prev.slice(1), id];
      }
      return [...prev, id];
    });
  };

  // Build sentiment comparison chart data
  const sentimentChartData = comparisonData
    ? [
        {
          name: "Positive",
          ...Object.fromEntries(
            comparisonData
              .filter(Boolean)
              .map((d) => [
                d!.search.keyword,
                d!.analysis?.sentimentBreakdown.positive ?? 0,
              ])
          ),
        },
        {
          name: "Negative",
          ...Object.fromEntries(
            comparisonData
              .filter(Boolean)
              .map((d) => [
                d!.search.keyword,
                d!.analysis?.sentimentBreakdown.negative ?? 0,
              ])
          ),
        },
        {
          name: "Neutral",
          ...Object.fromEntries(
            comparisonData
              .filter(Boolean)
              .map((d) => [
                d!.search.keyword,
                d!.analysis?.sentimentBreakdown.neutral ?? 0,
              ])
          ),
        },
      ]
    : [];

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight mb-1 flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-primary" />
              Niche Comparison
            </h1>
            <p className="text-sm text-muted-foreground">
              Compare voice mining results across multiple keywords side by side
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => navigate("/search/new")}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Search
          </Button>
        </div>

        {/* Search selector */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">
              Select searches to compare{" "}
              <span className="text-muted-foreground font-normal">(2–4)</span>
            </h2>
            {selectedIds.length > 0 && (
              <button
                onClick={() => setSelectedIds([])}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {searchesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          ) : completedSearches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-border/30 bg-card/20">
              <AlertCircle className="w-6 h-6 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                No completed searches yet. Run some voice mining searches first.
              </p>
              <Button
                size="sm"
                onClick={() => navigate("/search/new")}
                className="bg-primary text-primary-foreground"
              >
                Start Mining
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {completedSearches.map((search, idx) => {
                const isSelected = selectedIds.includes(search.id);
                const colorIdx = selectedIds.indexOf(search.id);
                return (
                  <button
                    key={search.id}
                    onClick={() => toggleSearch(search.id)}
                    className={`relative flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all duration-150 ${
                      isSelected
                        ? "border-primary/40 bg-primary/10"
                        : "border-border/40 bg-card/30 hover:border-border/70"
                    }`}
                  >
                    {isSelected && (
                      <div
                        className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ background: COMPARISON_COLORS[colorIdx] }}
                      >
                        {colorIdx + 1}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate pr-4">
                        {search.keyword}
                      </p>
                      {search.niche && (
                        <p className="text-xs text-muted-foreground/60 truncate">{search.niche}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Comparison results */}
        {selectedIds.length >= 2 && (
          <>
            {comparing ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-primary animate-spin mr-3" />
                <span className="text-sm text-muted-foreground">Loading comparison...</span>
              </div>
            ) : comparisonData && (
              <div className="space-y-6">
                {/* Sentiment chart */}
                <div className="p-5 rounded-xl border border-border/50 bg-card/30">
                  <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-primary" />
                    Sentiment Comparison
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={sentimentChartData} barGap={4}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="oklch(0.22 0.010 265)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: "oklch(0.55 0.010 265)", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "oklch(0.55 0.010 265)", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        unit="%"
                      />
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
                      <Legend
                        wrapperStyle={{ fontSize: "11px", color: "oklch(0.55 0.010 265)" }}
                      />
                      {comparisonData
                        .filter(Boolean)
                        .map((d, i) => (
                          <Bar
                            key={d!.search.id}
                            dataKey={d!.search.keyword}
                            fill={COMPARISON_COLORS[i]}
                            radius={[3, 3, 0, 0]}
                          />
                        ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Side-by-side comparison */}
                <div
                  className="grid gap-4"
                  style={{
                    gridTemplateColumns: `repeat(${comparisonData.filter(Boolean).length}, minmax(0, 1fr))`,
                  }}
                >
                  {comparisonData.filter(Boolean).map((d, i) => (
                    <div
                      key={d!.search.id}
                      className="rounded-xl border bg-card/30 overflow-hidden"
                      style={{ borderColor: `${COMPARISON_COLORS[i]}40` }}
                    >
                      <div
                        className="px-4 py-3 border-b"
                        style={{
                          background: `${COMPARISON_COLORS[i]}15`,
                          borderColor: `${COMPARISON_COLORS[i]}30`,
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ background: COMPARISON_COLORS[i] }}
                          />
                          <p className="text-sm font-semibold text-foreground truncate">
                            {d!.search.keyword}
                          </p>
                        </div>
                      </div>

                      <div className="p-4 space-y-4">
                        {/* Pain Points */}
                        <div>
                          <p className="text-xs font-semibold text-red-400 mb-2">Top Pain Points</p>
                          <div className="space-y-1">
                            {insightTexts(d!.analysis?.painPoints).slice(0, 4).map((p, j) => (
                              <div key={j} className="flex items-start gap-1.5">
                                <div className="w-1 h-1 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                                <p className="text-xs text-muted-foreground leading-relaxed">{p}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Desires */}
                        <div>
                          <p className="text-xs font-semibold text-emerald-400 mb-2">Top Desires</p>
                          <div className="space-y-1">
                            {insightTexts(d!.analysis?.desires).slice(0, 4).map((p, j) => (
                              <div key={j} className="flex items-start gap-1.5">
                                <div className="w-1 h-1 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                                <p className="text-xs text-muted-foreground leading-relaxed">{p}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Trending Phrases */}
                        <div>
                          <p className="text-xs font-semibold text-cyan-400 mb-2">Trending Phrases</p>
                          <div className="flex flex-wrap gap-1">
                            {d!.analysis?.trendingPhrases.slice(0, 5).map((p, j) => (
                              <span
                                key={j}
                                className="px-2 py-0.5 rounded-full text-xs border border-cyan-400/20 bg-cyan-400/8 text-cyan-400"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Report link */}
                        {d!.report && (
                          <button
                            onClick={() => navigate(`/report/${d!.report!.id}`)}
                            className="w-full text-xs text-primary hover:text-primary/80 transition-colors text-center py-1.5 rounded-lg border border-primary/20 hover:bg-primary/5"
                          >
                            View Full Report →
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {selectedIds.length === 1 && (
          <div className="flex items-center justify-center py-12 text-center">
            <div>
              <p className="text-sm text-muted-foreground">
                Select at least one more search to compare
              </p>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
