import { useMemo, useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { MarkdownDoc } from "@/components/MarkdownDoc";
import { ChevronDown, ChevronUp, Eye, Instagram, Loader2, Sparkles, TrendingUp, Youtube } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

/**
 * The client's window into the machine (/c/:token): weekly reports plus the
 * competitor desk, read-only, magic-link auth. The operator sends this link
 * once; it stays current on its own — the biweekly "here's what's moving"
 * send is just re-sending the same URL.
 */

interface SharePiece {
  platform: "instagram" | "youtube";
  account: string;
  url?: string;
  views: number;
  likes: number;
  topic: string;
  hookStyle?: string;
  angle?: string;
  sections?: Array<{ label: string; text: string; note?: string }>;
}

function parsePieces(content: string | null): SharePiece[] {
  if (!content) return [];
  const m = content.match(/```json\s*([\s\S]*?)```/);
  if (!m) return [];
  try {
    const data = JSON.parse(m[1]);
    if (!Array.isArray(data)) return [];
    return data
      .filter((r) => r && typeof r.topic === "string")
      .map((r) => ({
        platform: r.platform === "youtube" ? ("youtube" as const) : ("instagram" as const),
        account: String(r.account ?? ""),
        url: r.url,
        views: Number(r.views) || 0,
        likes: Number(r.likes) || 0,
        topic: String(r.topic),
        hookStyle: r.hookStyle,
        angle: r.angle,
      }))
      .sort((a, b) => b.views - a.views);
  } catch {
    return [];
  }
}

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

export default function ClientShare() {
  const { token = "" } = useParams<{ token: string }>();
  const { data, isLoading, error } = trpc.clientShare.get.useQuery({ token }, { enabled: !!token });
  const [openReport, setOpenReport] = useState<number | null>(0);
  const pieces = useMemo(() => parsePieces(data?.intelContent ?? null), [data?.intelContent]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6 text-center">
        <div>
          <h1 className="text-lg font-semibold text-foreground mb-1">Page not found</h1>
          <p className="text-sm text-muted-foreground">This link may have been replaced. Ask your coach for a fresh one.</p>
        </div>
      </div>
    );
  }

  const totalViews = pieces.reduce((s, p) => s + p.views, 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-5 py-10 space-y-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground tracking-tight">{data.clientName} — growth desk</h1>
            <p className="text-xs text-muted-foreground">Cashflow Coaches · what shipped, and what's winning in your market</p>
          </div>
        </div>

        {data.weeklyReports.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-2">Weekly reports</h2>
            <div className="space-y-2">
              {data.weeklyReports.map((r, i) => (
                <div key={i} className="rounded-xl border border-border/60 bg-card/30">
                  <button
                    className="w-full flex items-center gap-2 px-4 py-3 text-left"
                    onClick={() => setOpenReport(openReport === i ? null : i)}
                  >
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

        {pieces.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <h2 className="text-sm font-semibold text-foreground">What's winning in your market</h2>
              {data.intelUpdatedAt && (
                <span className="text-[11px] text-muted-foreground">
                  updated {formatDistanceToNow(new Date(data.intelUpdatedAt), { addSuffix: true })}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: "Top pieces analyzed", value: String(pieces.length) },
                { label: "Combined views", value: fmt(totalViews) },
                { label: "Platforms", value: String(new Set(pieces.map((p) => p.platform)).size) },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border/50 bg-card/30 px-3 py-2.5">
                  <p className="text-lg font-semibold text-foreground">{s.value}</p>
                  <p className="text-[11px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {pieces.slice(0, 12).map((p, i) => (
                <div key={i} className="rounded-xl border border-border/50 bg-card/30 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    {p.platform === "youtube" ? (
                      <Youtube className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    ) : (
                      <Instagram className="w-3.5 h-3.5 text-pink-400 flex-shrink-0" />
                    )}
                    <span className="text-[11px] text-muted-foreground truncate">@{p.account.replace(/^@/, "")}</span>
                    <span className="flex-1" />
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1 flex-shrink-0">
                      <Eye className="w-3 h-3" />
                      {fmt(p.views)}
                    </span>
                    {p.hookStyle && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/15 text-primary flex-shrink-0">
                        {p.hookStyle}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground leading-snug">{p.topic}</p>
                  {p.angle && (
                    <p className="text-[11px] text-muted-foreground mt-1 flex items-start gap-1.5">
                      <TrendingUp className="w-3 h-3 mt-0.5 flex-shrink-0 text-primary" />
                      <span>
                        <span className="text-foreground/80 font-medium">Your angle: </span>
                        {p.angle}
                      </span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {!data.weeklyReports.length && !pieces.length && (
          <p className="text-sm text-muted-foreground text-center py-16">
            Nothing published here yet — your first report lands soon.
          </p>
        )}
      </div>
    </div>
  );
}
