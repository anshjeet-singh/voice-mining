import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ViralHook } from "@shared/reportContent";
import { CopyAllBtn, CopyBtn, HOOK_TYPE_CONFIG, RegenerateSectionBtn, SaveBtn } from "./reportShared";

const CATEGORY_LABELS: Record<string, { label: string; blurb: string }> = {
  short_form_video: { label: "Short-Form Video Hooks", blurb: "Opening lines for Reels, Shorts, and TikTok." },
  carousel: { label: "Carousel Hooks", blurb: "First-slide text that makes them swipe." },
  email_subject: { label: "Email Subject Hooks", blurb: "Subject lines that get the open." },
  ad_headline: { label: "Ad Headline Hooks", blurb: "Paid ad headlines for cold traffic." },
};

const CATEGORY_ORDER = ["short_form_video", "carousel", "email_subject", "ad_headline"];

export function HooksTab({
  hooks,
  reportId,
  reportName,
}: {
  hooks: ViralHook[];
  reportId: number;
  reportName: string;
}) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return hooks.filter((h) => {
      const matchesType = typeFilter === "all" || h.hookType === typeFilter;
      const matchesQuery = !query || h.hook.toLowerCase().includes(query.toLowerCase());
      return matchesType && matchesQuery;
    });
  }, [hooks, typeFilter, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, ViralHook[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const h of filtered) {
      const list = map.get(h.category) ?? map.get("ad_headline")!;
      list.push(h);
    }
    return map;
  }, [filtered]);

  const allText = () =>
    CATEGORY_ORDER.map((cat) => {
      const list = grouped.get(cat) ?? [];
      if (list.length === 0) return "";
      return `${CATEGORY_LABELS[cat].label.toUpperCase()}\n${list.map((h, i) => `${i + 1}. ${h.hook}`).join("\n")}`;
    })
      .filter(Boolean)
      .join("\n\n");

  if (hooks.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No hooks generated yet. Click Regenerate to write them.
        <div className="flex justify-center mt-4">
          <RegenerateSectionBtn reportId={reportId} section="viralHooks" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toolbar: search + type filter + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="Search hooks..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-card/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <CopyAllBtn getText={allText} />
          <RegenerateSectionBtn reportId={reportId} section="viralHooks" />
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setTypeFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            typeFilter === "all"
              ? "bg-primary/15 text-primary border-primary/30"
              : "text-muted-foreground hover:text-foreground border-transparent hover:bg-card/60"
          }`}
        >
          All types
        </button>
        {Object.entries(HOOK_TYPE_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              typeFilter === key
                ? cfg.color
                : "text-muted-foreground hover:text-foreground border-transparent hover:bg-card/60"
            }`}
          >
            {cfg.label}
          </button>
        ))}
      </div>

      {/* Categories */}
      {CATEGORY_ORDER.map((cat) => {
        const list = grouped.get(cat) ?? [];
        if (list.length === 0) return null;
        const meta = CATEGORY_LABELS[cat];
        return (
          <div key={cat} className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border/40" />
              <span className="text-xs font-semibold text-primary uppercase tracking-wider px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                {meta.label}
              </span>
              <div className="h-px flex-1 bg-border/40" />
            </div>
            <p className="text-xs text-muted-foreground text-center">{meta.blurb}</p>
            {list.map((hook, i) => {
              const typeCfg = HOOK_TYPE_CONFIG[hook.hookType] ?? HOOK_TYPE_CONFIG.curiosity;
              return (
                <div
                  key={`${cat}-${i}`}
                  className="group flex items-start justify-between gap-3 p-4 rounded-xl border border-border/40 bg-card/30 hover:border-primary/30 transition-all"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground/40 mt-0.5 w-5 flex-shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${typeCfg.color}`}>
                          {typeCfg.label}
                        </span>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">{hook.hook}</p>
                      {hook.whyThisWorks && (
                        <p className="text-xs text-muted-foreground/70 mt-1.5 italic">
                          Why this works: {hook.whyThisWorks}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 flex items-center gap-1">
                    <SaveBtn reportId={reportId} searchKeyword={reportName} contentType="hook" label={hook.hook.slice(0, 80)} content={hook.hook} />
                    <CopyBtn text={hook.hook} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No hooks match your filter. Try a different type or clear the search.
        </div>
      )}
    </div>
  );
}
