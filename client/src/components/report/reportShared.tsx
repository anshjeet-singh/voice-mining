import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Bookmark, BookmarkCheck, Copy, Loader2, RefreshCw } from "lucide-react";

// ─── Shared config ───────────────────────────────────────────────────────────

export const AWARENESS_CONFIG: Record<string, { label: string; color: string; bg: string; funnelIndex: number }> = {
  unaware: { label: "Unaware", color: "text-rose-400", bg: "bg-rose-400/10", funnelIndex: 0 },
  problem_aware: { label: "Problem Aware", color: "text-amber-400", bg: "bg-amber-400/10", funnelIndex: 1 },
  solution_aware: { label: "Solution Aware", color: "text-cyan-400", bg: "bg-cyan-400/10", funnelIndex: 2 },
  product_aware: { label: "Product Aware", color: "text-blue-400", bg: "bg-blue-400/10", funnelIndex: 3 },
  most_aware: { label: "Most Aware", color: "text-purple-400", bg: "bg-purple-400/10", funnelIndex: 4 },
};

export const VELOCITY_CONFIG = {
  rising: { label: "Rising", color: "text-emerald-400", bg: "bg-emerald-400/10" },
  stable: { label: "Stable", color: "text-blue-400", bg: "bg-blue-400/10" },
  declining: { label: "Declining", color: "text-red-400", bg: "bg-red-400/10" },
};

export const HOOK_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  curiosity: { label: "Curiosity", color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20" },
  pain: { label: "Pain", color: "text-red-400 bg-red-400/10 border-red-400/20" },
  desire: { label: "Desire", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  social_proof: { label: "Social Proof", color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  pattern_interrupt: { label: "Pattern Interrupt", color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
};

export const POST_FORMAT_CONFIG: Record<string, { label: string; color: string }> = {
  story: { label: "Story", color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  list: { label: "List", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  question: { label: "Question", color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20" },
  controversy: { label: "Controversy", color: "text-red-400 bg-red-400/10 border-red-400/20" },
  case_study: { label: "Case Study", color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
};

// ─── Save to Vault Button ────────────────────────────────────────────────────

export function SaveBtn({
  reportId,
  searchKeyword,
  contentType,
  label,
  content,
}: {
  reportId: number;
  searchKeyword: string;
  contentType: "hook" | "email" | "skool_post" | "ad_copy" | "script" | "youtube_idea";
  label: string;
  content: string;
}) {
  const utils = trpc.useUtils();
  const [saved, setSaved] = useState(false);
  const saveMutation = trpc.vault.save.useMutation({
    onSuccess: () => {
      setSaved(true);
      utils.vault.list.invalidate();
      toast.success("Saved to Vault");
    },
    onError: () => toast.error("Already saved or failed to save"),
  });
  return (
    <button
      onClick={() =>
        saveMutation.mutate({ reportId, searchKeyword, contentType, label, content })
      }
      disabled={saveMutation.isPending || saved}
      className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${
        saved
          ? "text-primary"
          : "text-muted-foreground hover:text-primary hover:bg-primary/10"
      }`}
      title={saved ? "Saved to Vault" : "Save to Vault"}
    >
      {saved ? (
        <BookmarkCheck className="w-3.5 h-3.5" />
      ) : (
        <Bookmark className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

// ─── Copy Buttons ────────────────────────────────────────────────────────────

export function CopyBtn({ text }: { text: string }) {
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
      }}
      className="flex-shrink-0 p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
      title="Copy"
    >
      <Copy className="w-3.5 h-3.5" />
    </button>
  );
}

/** "Copy All" button for a whole tab — copies pre-formatted text of every item. */
export function CopyAllBtn({ getText, label = "Copy All" }: { getText: () => string; label?: string }) {
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(getText());
        toast.success("Copied everything on this tab");
      }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
    >
      <Copy className="w-3 h-3" />
      {label}
    </button>
  );
}

// ─── Regenerate Section Button ───────────────────────────────────────────────

export type ReportSection =
  | "marketIntelligence"
  | "viralHooks"
  | "adCopyIdeas"
  | "skoolPosts"
  | "talkingHeadScripts"
  | "emailSequence"
  | "youtubeIdeas"
  | "competitorIntel";

export function RegenerateSectionBtn({ reportId, section }: { reportId: number; section: ReportSection }) {
  const utils = trpc.useUtils();
  const mutation = trpc.reports.regenerateSection.useMutation({
    onSuccess: () => {
      utils.reports.get.invalidate({ id: reportId });
      toast.success("Section regenerated");
    },
    onError: (err) => toast.error(err.message ?? "Failed to regenerate section"),
  });
  return (
    <button
      onClick={() => mutation.mutate({ id: reportId, section })}
      disabled={mutation.isPending}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-50"
      title="Re-run the AI for just this section"
    >
      {mutation.isPending ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <RefreshCw className="w-3 h-3" />
      )}
      {mutation.isPending ? "Regenerating..." : "Regenerate"}
    </button>
  );
}

// ─── Layout primitives ───────────────────────────────────────────────────────

export function TagList({ items, color = "bg-card/60 border-border/40 text-muted-foreground" }: { items: string[]; color?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <span key={i} className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${color}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

export function BulletList({ items, dotColor = "bg-primary" }: { items: string[]; dotColor?: string }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${dotColor}`} />
          <span className="text-sm text-muted-foreground leading-relaxed">{item}</span>
        </div>
      ))}
    </div>
  );
}

export function SectionHeader({ title, badge, badgeColor = "text-primary bg-primary/10" }: { title: string; badge?: string; badgeColor?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-sm font-semibold text-foreground">{title}</span>
      {badge && (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColor}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

/** Horizontal frequency bar (0-100) shown next to structured insights. */
export function FrequencyBar({ value, color = "bg-primary" }: { value: number; color?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 rounded-full bg-card overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground/60 w-6 text-right">{value}</span>
    </div>
  );
}

/** 1-10 score meter (pain agitation, open rate prediction). */
export function ScoreMeter({ value, label, color = "text-amber-400" }: { value: number; label: string; color?: string }) {
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${value}/10`}>
      <span className="text-xs text-muted-foreground/60">{label}</span>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className={`w-1 h-3 rounded-sm ${i < value ? `${color.replace("text-", "bg-")}` : "bg-card"}`}
          />
        ))}
      </div>
      <span className={`text-xs font-semibold ${color}`}>{value}</span>
    </div>
  );
}

/** Visual awareness funnel — highlights the level this ad targets. */
export function AwarenessFunnel({ level }: { level: string }) {
  const stages = ["unaware", "problem_aware", "solution_aware", "product_aware", "most_aware"];
  const activeIndex = AWARENESS_CONFIG[level]?.funnelIndex ?? 1;
  return (
    <div className="flex flex-col items-center gap-0.5 py-1" title={`Awareness level: ${AWARENESS_CONFIG[level]?.label ?? level}`}>
      {stages.map((stage, i) => {
        const cfg = AWARENESS_CONFIG[stage];
        const isActive = i === activeIndex;
        // Funnel narrows toward most_aware
        const width = 72 - i * 12;
        return (
          <div
            key={stage}
            className={`h-2.5 rounded-sm transition-all ${
              isActive ? cfg.bg.replace("/10", "/60") : "bg-card"
            } ${isActive ? "ring-1 ring-current " + cfg.color : ""}`}
            style={{ width }}
          />
        );
      })}
      <span className={`text-xs font-medium mt-1 ${AWARENESS_CONFIG[level]?.color ?? "text-muted-foreground"}`}>
        {AWARENESS_CONFIG[level]?.label ?? level}
      </span>
    </div>
  );
}
