import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ClipboardList, Crosshair, Loader2, Sparkles, Swords } from "lucide-react";
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

      {/* Competitor deep-dive cards */}
      <div className="space-y-4">
        {intel.competitors.map((c, i) => (
          <div key={i} className="rounded-xl border border-border/40 bg-card/30 p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-foreground">{c.name}</h3>
              {c.pricingSignals && c.pricingSignals !== "No pricing signals found" && (
                <span className="text-xs px-2 py-0.5 rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-300">{c.pricingSignals}</span>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Their Angle</p>
                <p className="text-muted-foreground leading-relaxed">{c.angle}</p>
              </div>
              {c.offer && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">What They Sell</p>
                  <p className="text-muted-foreground leading-relaxed">{c.offer}</p>
                </div>
              )}
              {c.contentPlaybook && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Their Content Playbook</p>
                  <p className="text-muted-foreground leading-relaxed">{c.contentPlaybook}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-red-400/90 uppercase tracking-wider mb-1">Their Weakness</p>
                <p className="text-red-300/90 leading-relaxed">{c.weakness}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-400/90 uppercase tracking-wider mb-1">Gap You Can Own</p>
                <p className="text-emerald-300/90 leading-relaxed">{c.gap}</p>
              </div>
              {(c.steal?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Worth Stealing</p>
                  <ul className="space-y-1">
                    {(c.steal ?? []).map((s, j) => (
                      <li key={j} className="text-muted-foreground leading-relaxed flex gap-2">
                        <span className="text-primary flex-shrink-0">+</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {c.counter && (
                <div>
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">How You Beat Them</p>
                  <p className="text-foreground/90 leading-relaxed font-medium">{c.counter}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Action plan */}
      {(intel.actionPlan?.length ?? 0) > 0 && (
        <div className="p-5 rounded-xl border border-primary/25 bg-primary/5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            Your Action Plan
          </h3>
          <ol className="space-y-2.5">
            {(intel.actionPlan ?? []).map((a, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary">{i + 1}</span>
                <span className="text-foreground/90 leading-relaxed">{a}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

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
