import { useMemo, useState } from "react";
import { Brain, Layers, TrendingUp, Zap } from "lucide-react";
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
import {
  normalizeInsights,
  type DeepMarketIntelligence,
  type InsightItem,
  type SentimentBreakdown,
  type Theme,
  type VerbatimQuote,
} from "@shared/reportContent";
import { BulletList, CopyBtn, FrequencyBar, RegenerateSectionBtn, SectionHeader, TagList, VELOCITY_CONFIG } from "./reportShared";

const SENTIMENT_COLORS = [
  "oklch(0.70 0.15 150)",
  "oklch(0.60 0.22 25)",
  "oklch(0.55 0.010 265)",
];

export interface AnalysisView {
  painPoints: InsightItem[];
  desires: InsightItem[];
  objections: InsightItem[];
  fears: InsightItem[];
  verbatimQuotes: VerbatimQuote[];
  topThemes: Theme[];
  sentimentBreakdown: SentimentBreakdown;
}

/** Normalize a raw analysis row (legacy or structured) into a view model. */
export function toAnalysisView(analysis: {
  painPoints: unknown;
  desires: unknown;
  objections: unknown;
  fears: unknown;
  verbatimQuotes: VerbatimQuote[];
  topThemes: Theme[];
  sentimentBreakdown: SentimentBreakdown;
} | null | undefined): AnalysisView | null {
  if (!analysis) return null;
  return {
    painPoints: normalizeInsights(analysis.painPoints as InsightItem[] | string[]),
    desires: normalizeInsights(analysis.desires as InsightItem[] | string[]),
    objections: normalizeInsights(analysis.objections as InsightItem[] | string[]),
    fears: normalizeInsights(analysis.fears as InsightItem[] | string[]),
    verbatimQuotes: analysis.verbatimQuotes ?? [],
    topThemes: analysis.topThemes ?? [],
    sentimentBreakdown: analysis.sentimentBreakdown ?? { positive: 0, negative: 0, neutral: 100 },
  };
}

const INSIGHT_GROUPS = [
  { key: "painPoints", label: "Pain Points", bar: "bg-red-400", accent: "text-red-400" },
  { key: "desires", label: "Desires", bar: "bg-emerald-400", accent: "text-emerald-400" },
  { key: "objections", label: "Objections", bar: "bg-amber-400", accent: "text-amber-400" },
  { key: "fears", label: "Fears", bar: "bg-purple-400", accent: "text-purple-400" },
] as const;

function InsightGroup({
  label,
  items,
  bar,
  accent,
  groupByTheme,
}: {
  label: string;
  items: InsightItem[];
  bar: string;
  accent: string;
  groupByTheme: boolean;
}) {
  const hasStructure = items.some((i) => i.frequency > 0 || i.verbatimExample);

  const themed = useMemo(() => {
    if (!groupByTheme || !hasStructure) return null;
    const map = new Map<string, InsightItem[]>();
    for (const item of items) {
      const theme = item.theme || "Other";
      if (!map.has(theme)) map.set(theme, []);
      map.get(theme)!.push(item);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [items, groupByTheme, hasStructure]);

  const renderItem = (item: InsightItem, i: number) => (
    <div key={i} className="p-3 rounded-lg border border-border/30 bg-card/20">
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-sm text-foreground/90 leading-relaxed flex-1">{item.text}</p>
        {item.frequency > 0 && <FrequencyBar value={item.frequency} color={bar} />}
      </div>
      {item.verbatimExample && (
        <p className="text-xs text-muted-foreground/70 italic mt-1.5">
          "{item.verbatimExample}"
          {item.platform && <span className="not-italic font-medium text-muted-foreground/50 ml-1.5 uppercase">{item.platform}</span>}
        </p>
      )}
    </div>
  );

  return (
    <div className="p-5 rounded-xl border border-border/40 bg-card/30">
      <h4 className={`text-xs font-semibold mb-3 uppercase tracking-wider ${accent}`}>{label}</h4>
      {themed ? (
        <div className="space-y-4">
          {themed.map(([theme, themeItems]) => (
            <div key={theme}>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Layers className="w-3 h-3" />
                {theme}
              </p>
              <div className="space-y-2">{themeItems.map(renderItem)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">{items.map(renderItem)}</div>
      )}
    </div>
  );
}

export function IntelligenceTab({
  mi,
  analysis,
  reportId,
}: {
  mi: DeepMarketIntelligence;
  analysis: AnalysisView | null;
  reportId: number;
}) {
  const [groupByTheme, setGroupByTheme] = useState(true);
  const hasStructuredInsights = analysis
    ? INSIGHT_GROUPS.some((g) => analysis[g.key].some((i) => i.theme))
    : false;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <RegenerateSectionBtn reportId={reportId} section="marketIntelligence" />
      </div>

      {/* Sentiment + Themes row (from raw analysis) */}
      {analysis && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Sentiment donut */}
          <div className="p-5 rounded-xl border border-border/50 bg-card/30">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Sentiment Breakdown
            </h3>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Positive", value: analysis.sentimentBreakdown.positive },
                      { name: "Negative", value: analysis.sentimentBreakdown.negative },
                      { name: "Neutral", value: analysis.sentimentBreakdown.neutral },
                    ]}
                    cx="50%" cy="50%"
                    innerRadius={35} outerRadius={55}
                    paddingAngle={2} dataKey="value"
                  >
                    {[0, 1, 2].map((i) => <Cell key={i} fill={SENTIMENT_COLORS[i]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "oklch(0.14 0.010 265)", border: "1px solid oklch(0.22 0.010 265)", borderRadius: "8px", color: "oklch(0.96 0.005 265)", fontSize: "12px" }}
                    formatter={(v) => [`${v}%`, ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {["Positive", "Negative", "Neutral"].map((name, i) => (
                  <div key={name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: SENTIMENT_COLORS[i] }} />
                    <span className="text-xs text-muted-foreground">{name}</span>
                    <span className="text-xs font-semibold text-foreground ml-auto">
                      {name === "Positive" ? analysis.sentimentBreakdown.positive : name === "Negative" ? analysis.sentimentBreakdown.negative : analysis.sentimentBreakdown.neutral}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Themes radar */}
          <div className="p-5 rounded-xl border border-border/50 bg-card/30">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Top Themes
            </h3>
            <ResponsiveContainer width="100%" height={120}>
              <RadarChart data={analysis.topThemes.map((t) => ({ subject: t.name.length > 12 ? t.name.slice(0, 12) + "..." : t.name, value: t.frequency }))}>
                <PolarGrid stroke="oklch(0.22 0.010 265)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: "oklch(0.55 0.010 265)", fontSize: 9 }} />
                <Radar dataKey="value" stroke="oklch(0.72 0.18 285)" fill="oklch(0.72 0.18 285)" fillOpacity={0.2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Voice-of-customer insights with frequency bars */}
      {analysis && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <SectionHeader title="Voice of Customer" badge="With frequency scores" />
            {hasStructuredInsights && (
              <button
                onClick={() => setGroupByTheme(!groupByTheme)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                  groupByTheme
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "text-muted-foreground border-border/50 hover:text-foreground"
                }`}
              >
                <Layers className="w-3 h-3" />
                Group by theme
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {INSIGHT_GROUPS.map((group) => (
              <InsightGroup
                key={group.key}
                label={group.label}
                items={analysis[group.key]}
                bar={group.bar}
                accent={group.accent}
                groupByTheme={groupByTheme}
              />
            ))}
          </div>
        </div>
      )}

      {/* Verbatim Quotes from raw analysis */}
      {(analysis?.verbatimQuotes?.length ?? 0) > 0 && (
        <div className="p-5 rounded-xl border border-border/40 bg-card/30">
          <h3 className="text-sm font-semibold text-foreground mb-4">Verbatim Quotes</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(analysis?.verbatimQuotes ?? []).slice(0, 8).map((quote, i) => (
              <div key={i} className="p-3.5 rounded-lg border border-border/40 bg-card/20 text-xs leading-relaxed italic text-foreground/80">
                <span className="not-italic font-semibold text-xs text-primary block mb-1">
                  {quote.platform?.toUpperCase() ?? "ONLINE"}
                </span>
                "{quote.text}"
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trending Topics */}
      <div className="rounded-xl border border-border/40 bg-card/30 p-5">
        <SectionHeader title="Trending Topics" badge={`${mi.trendingTopics?.length ?? 0} topics`} />
        <div className="space-y-3">
          {(mi.trendingTopics ?? []).map((topic, i) => {
            const vel = VELOCITY_CONFIG[topic.velocity] ?? VELOCITY_CONFIG.stable;
            return (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border/30 bg-card/20">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground">{topic.topic}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${vel.bg} ${vel.color}`}>
                      {vel.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{topic.description}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-semibold text-foreground">{topic.engagementScore}</div>
                  <div className="text-xs text-muted-foreground">score</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Market landscape 3-col */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Competitor Patterns", data: mi.competitorPatterns, dot: "bg-yellow-400", color: "text-yellow-400" },
          { label: "Emerging Opportunities", data: mi.emergingOpportunities, dot: "bg-emerald-400", color: "text-emerald-400" },
          { label: "Market Shifts", data: mi.marketShifts, dot: "bg-blue-400", color: "text-blue-400" },
        ].map(({ label, data, dot, color }) => (
          <div key={label} className="p-4 rounded-xl border border-border/40 bg-card/30">
            <h4 className={`text-xs font-semibold mb-3 ${color}`}>{label}</h4>
            <BulletList items={data ?? []} dotColor={dot} />
          </div>
        ))}
      </div>

      {/* Audience Psychology */}
      <div className="p-5 rounded-xl border border-border/40 bg-card/30">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Audience Psychology</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {[
            { label: "Core Desires", data: mi.topDesires, color: "bg-emerald-400/10 border-emerald-400/20 text-emerald-300" },
            { label: "Core Fears", data: mi.topFears, color: "bg-red-400/10 border-red-400/20 text-red-300" },
            { label: "Dominant Beliefs", data: mi.dominantBeliefs, color: "bg-blue-400/10 border-blue-400/20 text-blue-300" },
            { label: "Emotional Triggers", data: mi.emotionalTriggers, color: "bg-amber-400/10 border-amber-400/20 text-amber-300" },
          ].map(({ label, data, color }) => (
            <div key={label}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
              <TagList items={data ?? []} color={color} />
            </div>
          ))}
        </div>
      </div>

      {/* Their Exact Language */}
      <div className="p-5 rounded-xl border border-border/40 bg-card/30">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm font-semibold text-foreground">Their Exact Language</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium text-primary bg-primary/10">Use in copy</span>
        </div>
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Language Patterns</p>
            <BulletList items={mi.languagePatterns ?? []} />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Verbatim Phrases (copy directly)</p>
            <div className="space-y-2">
              {(mi.verbatimPhrases ?? []).map((phrase, i) => (
                <div key={i} className="group flex items-start justify-between gap-2 p-3 rounded-lg border border-border/30 bg-card/20 hover:border-primary/20 transition-colors">
                  <p className="text-sm text-foreground/90 italic">"{phrase}"</p>
                  <CopyBtn text={phrase} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">High-Converting Phrases</p>
            <TagList items={mi.keywordIntelligence?.highConvertingPhrases ?? []} color="bg-primary/10 border-primary/20 text-primary" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Long-Tail Keywords</p>
              <TagList items={mi.keywordIntelligence?.longTailKeywords ?? []} />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Emotional Keywords</p>
              <TagList items={mi.keywordIntelligence?.emotionalKeywords ?? []} color="bg-amber-400/10 border-amber-400/20 text-amber-300" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
