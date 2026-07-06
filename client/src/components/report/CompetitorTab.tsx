import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Crosshair, Loader2, Sparkles, Swords } from "lucide-react";
import type { CompetitorIntel } from "@shared/reportContent";
import { BulletList, CopyBtn, RegenerateSectionBtn } from "./reportShared";

export function CompetitorTab({
  intel,
  reportId,
}: {
  intel: CompetitorIntel | null;
  reportId: number;
}) {
  const utils = trpc.useUtils();
  const [generating, setGenerating] = useState(false);

  const generateMutation = trpc.reports.regenerateSection.useMutation({
    onMutate: () => setGenerating(true),
    onSettled: () => setGenerating(false),
    onSuccess: () => {
      utils.reports.get.invalidate({ id: reportId });
      toast.success("Competitor intel is ready");
    },
    onError: (err) => toast.error(err.message ?? "Could not generate competitor intel"),
  });

  const positioningMutation = trpc.reports.generatePositioning.useMutation({
    onSuccess: () => {
      utils.reports.get.invalidate({ id: reportId });
      toast.success("Positioning statement generated");
    },
    onError: (err) => toast.error(err.message ?? "Failed to generate positioning statement"),
  });

  if (!intel) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
          <Swords className="w-5 h-5 text-primary" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">See who you're really up against</h3>
        <p className="text-xs text-muted-foreground max-w-sm mb-5">
          We'll scan live search results for the top players in this market, pull their weaknesses from real
          review complaints, and show you the gaps you can own.
        </p>
        <Button
          size="sm"
          onClick={() => generateMutation.mutate({ id: reportId, section: "competitorIntel" })}
          disabled={generating}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {generating ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Crosshair className="w-3.5 h-3.5 mr-1.5" />
          )}
          {generating ? "Scanning the market..." : "Run Competitor Scan"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Pulled from live search results and review complaints on{" "}
          {new Date(intel.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
        </p>
        <RegenerateSectionBtn reportId={reportId} section="competitorIntel" />
      </div>

      {/* Comparison table */}
      <div className="rounded-xl border border-border/40 bg-card/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Competitor</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Their Angle</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Their Weakness</th>
                <th className="px-4 py-3 text-xs font-semibold text-primary uppercase tracking-wider">Gap You Can Own</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pricing Signals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {intel.competitors.map((c, i) => (
                <tr key={i} className="hover:bg-card/40 transition-colors align-top">
                  <td className="px-4 py-3.5 font-semibold text-foreground whitespace-nowrap">{c.name}</td>
                  <td className="px-4 py-3.5 text-muted-foreground leading-relaxed min-w-[160px]">{c.angle}</td>
                  <td className="px-4 py-3.5 text-red-300/90 leading-relaxed min-w-[160px]">{c.weakness}</td>
                  <td className="px-4 py-3.5 text-emerald-300/90 leading-relaxed min-w-[160px]">{c.gap}</td>
                  <td className="px-4 py-3.5 text-muted-foreground/70 leading-relaxed min-w-[120px]">{c.pricingSignals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Market gaps */}
      {intel.marketGaps.length > 0 && (
        <div className="p-5 rounded-xl border border-border/40 bg-card/30">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-emerald-400" />
            Gaps Nobody Is Filling
          </h3>
          <BulletList items={intel.marketGaps} dotColor="bg-emerald-400" />
        </div>
      )}

      {/* Positioning statement generator */}
      <div className="p-5 rounded-xl border border-primary/20 bg-primary/5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Your Positioning Statement
          </h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => positioningMutation.mutate({ id: reportId })}
            disabled={positioningMutation.isPending}
            className="border-primary/30 text-primary hover:bg-primary/10"
          >
            {positioningMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            )}
            {intel.positioningStatement ? "Regenerate" : "Generate From These Gaps"}
          </Button>
        </div>
        {intel.positioningStatement ? (
          <div className="flex items-start justify-between gap-3 p-4 rounded-lg border border-border/30 bg-card/20">
            <p className="text-sm text-foreground/90 leading-relaxed italic">"{intel.positioningStatement}"</p>
            <CopyBtn text={intel.positioningStatement} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            One click writes a positioning statement that plants your flag in the biggest gap your competitors leave open.
          </p>
        )}
      </div>
    </div>
  );
}
