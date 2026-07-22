import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { MarkdownDoc } from "@/components/MarkdownDoc";
import { MarketPulse, parsePulsePieces } from "@/components/MarketPulse";
import { ChevronDown, ChevronUp, Loader2, Sparkles } from "lucide-react";

/**
 * The client's window into the machine (/c/:token): weekly reports plus the
 * competitor desk, read-only, magic-link auth. The operator sends this link
 * once; it stays current on its own — the biweekly "here's what's moving"
 * send is just re-sending the same URL.
 */
export default function ClientShare() {
  const { token = "" } = useParams<{ token: string }>();
  const { data, isLoading, error } = trpc.clientShare.get.useQuery({ token }, { enabled: !!token });
  const [openReport, setOpenReport] = useState<number | null>(0);

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

  const hasPulse = parsePulsePieces(data.intelContent).length > 0;

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

        <MarketPulse intelContent={data.intelContent} intelUpdatedAt={data.intelUpdatedAt} />

        {!data.weeklyReports.length && !hasPulse && (
          <p className="text-sm text-muted-foreground text-center py-16">
            Nothing published here yet — your first report lands soon.
          </p>
        )}
      </div>
    </div>
  );
}
