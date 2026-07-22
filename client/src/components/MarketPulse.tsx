import { useMemo } from "react";
import { Eye, Instagram, TrendingUp, Youtube } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

/**
 * "What's winning in your market" — the client-safe competitor desk. Parses
 * the ```json reel array out of the latest content_intel doc and renders the
 * stat band + top pieces. Shared by the /c/:token share page and the portal.
 */

export interface PulsePiece {
  platform: "instagram" | "youtube";
  account: string;
  url?: string;
  views: number;
  likes: number;
  topic: string;
  hookStyle?: string;
  angle?: string;
}

export function parsePulsePieces(content: string | null): PulsePiece[] {
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

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

export function MarketPulse({
  intelContent,
  intelUpdatedAt,
  limit = 12,
}: {
  intelContent: string | null;
  intelUpdatedAt: string | Date | null;
  limit?: number;
}) {
  const pieces = useMemo(() => parsePulsePieces(intelContent), [intelContent]);
  if (!pieces.length) return null;
  const totalViews = pieces.reduce((s, p) => s + p.views, 0);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h2 className="text-sm font-semibold text-foreground">What's winning in your market</h2>
        {intelUpdatedAt && (
          <span className="text-[11px] text-muted-foreground">
            updated {formatDistanceToNow(new Date(intelUpdatedAt), { addSuffix: true })}
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
        {pieces.slice(0, limit).map((p, i) => (
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
  );
}
