import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Crosshair,
  ExternalLink,
  Loader2,
  Radar,
  Swords,
} from "lucide-react";
import type { CompetitorEntry, CompetitorIntel } from "@shared/reportContent";
import { RegenerateSectionBtn } from "./reportShared";

/** Short labelled bullet list inside a competitor card. */
function Bullets({
  label,
  items,
  accent = "text-muted-foreground",
  dot = "text-primary",
}: {
  label: string;
  items: string[];
  accent?: string;
  dot?: string;
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className={`text-sm leading-relaxed flex gap-2 ${accent}`}>
            <span className={`flex-shrink-0 ${dot}`}>•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One collapsible competitor. Header shows the one-line summary; body has the full breakdown. */
function CompetitorCard({ c, defaultOpen }: { c: CompetitorEntry; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  // v2 reports carry bullet fields; legacy reports fall back to the prose fields
  const sells = c.sells?.length ? c.sells : c.offer ? [c.offer] : [];
  const angles = c.angles?.length ? c.angles : c.angle ? [c.angle] : [];
  const notDoingWell = c.notDoingWell?.length ? c.notDoingWell : c.weakness ? [c.weakness] : [];

  return (
    <div className="rounded-xl border border-border/40 bg-card/30">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-foreground">{c.name}</h3>
            {c.discovered && (
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-blue-400/30 bg-blue-400/10 text-blue-300 flex items-center gap-1">
                <Radar className="w-2.5 h-2.5" />
                Found by scan
              </span>
            )}
            {c.pricingSignals && c.pricingSignals !== "No pricing signals found" && (
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-300">
                {c.pricingSignals}
              </span>
            )}
          </div>
          {!open && <p className="text-xs text-muted-foreground truncate mt-0.5">{c.angle}</p>}
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-5 space-y-4">
          {/* Links row: their funnel + socials, straight from the scrape */}
          {(c.links?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {(c.links ?? []).map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border/50 bg-card/50 text-xs font-medium text-muted-foreground hover:text-primary hover:border-primary/30 transition-all"
                >
                  <ExternalLink className="w-3 h-3" />
                  {link.label}
                </a>
              ))}
            </div>
          )}

          {c.icp && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Who They Target</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{c.icp}</p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <Bullets label="What They Sell" items={sells} />
            <Bullets label="Their Angles" items={angles} />
            <Bullets label="Doing Well" items={c.doingWell ?? []} accent="text-muted-foreground" dot="text-emerald-400" />
            <Bullets label="Not Doing Well" items={notDoingWell} accent="text-red-300/90" dot="text-red-400" />
          </div>

          {/* Top content with real links */}
          {(c.topContent?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Top Content</p>
              <div className="space-y-1.5">
                {(c.topContent ?? []).map((piece, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {piece.url ? (
                      <a
                        href={piece.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-foreground/90 hover:text-primary underline underline-offset-2 decoration-border/70 truncate"
                      >
                        {piece.title}
                      </a>
                    ) : (
                      <span className="text-foreground/90 truncate">{piece.title}</span>
                    )}
                    {piece.views && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">{piece.views} views</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legacy prose playbook, only when v2 topContent is absent */}
          {!c.topContent?.length && c.contentPlaybook && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Their Content Playbook</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{c.contentPlaybook}</p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-emerald-400/90 uppercase tracking-wider mb-1">Gap You Can Own</p>
              <p className="text-sm text-emerald-300/90 leading-relaxed">{c.gap}</p>
            </div>
            <Bullets label="Worth Stealing" items={c.steal ?? []} dot="text-primary" />
          </div>

          {c.counter && (
            <div className="p-3 rounded-lg border border-primary/25 bg-primary/5">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">How You Beat Them</p>
              <p className="text-sm text-foreground/90 leading-relaxed font-medium">{c.counter}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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

  if (!intel) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
          <Swords className="w-5 h-5 text-primary" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">See who you're really up against</h3>
        <p className="text-xs text-muted-foreground max-w-sm mb-5">
          We scan the niche's YouTube channels, Skool communities, courses, and review complaints,
          including competitors you didn't give us, and map the gaps you can own.
        </p>
        {reportId > 0 && (
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
        )}
      </div>
    );
  }

  // v2 reports pair each gap with its action; legacy reports show gaps + plan separately
  const gapPlan =
    intel.gapPlan?.length
      ? intel.gapPlan
      : (intel.marketGaps ?? []).map((gap, i) => ({
          gap,
          action: intel.actionPlan?.[i] ?? "",
        }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {intel.competitors.length} competitors mapped from live channel, community, and review data on{" "}
          {new Date(intel.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
        </p>
        <RegenerateSectionBtn reportId={reportId} section="competitorIntel" />
      </div>

      {/* Collapsible competitor cards, first one open */}
      <div className="space-y-3">
        {intel.competitors.map((c, i) => (
          <CompetitorCard key={i} c={c} defaultOpen={i === 0} />
        ))}
      </div>

      {/* Gaps + the move that fills each one, merged into one plan */}
      {gapPlan.length > 0 && (
        <div className="p-5 rounded-xl border border-primary/25 bg-primary/5">
          <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            Gaps Nobody Is Filling, And How You Take Them
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Synthesized across every competitor above. Each gap comes with the move that owns it.
          </p>
          <div className="space-y-3">
            {gapPlan.map((play, i) => (
              <div key={i} className="p-3.5 rounded-lg border border-border/30 bg-card/20">
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-400/15 flex items-center justify-center text-xs font-bold text-emerald-400">
                    {i + 1}
                  </span>
                  <div className="space-y-1.5">
                    <p className="text-sm text-emerald-300/90 leading-relaxed">{play.gap}</p>
                    {play.action && (
                      <p className="text-sm text-foreground/90 leading-relaxed">
                        <span className="text-xs font-semibold text-primary uppercase tracking-wider mr-1.5">Your move</span>
                        {play.action}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
