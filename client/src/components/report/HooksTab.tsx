import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ViralHook } from "@shared/reportContent";
import { CopyAllBtn, CopyBtn, RegenerateSectionBtn, SaveBtn } from "./reportShared";

export function HooksTab({
  hooks,
  reportId,
  reportName,
}: {
  hooks: ViralHook[];
  reportId: number;
  reportName: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query) return hooks;
    return hooks.filter((h) => h.hook.toLowerCase().includes(query.toLowerCase()));
  }, [hooks, query]);

  const allText = () => filtered.map((h, i) => `${i + 1}. ${h.hook}`).join("\n");

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
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Your top {hooks.length} hooks. Use them as video openers, first slides, or ad headlines.
      </p>

      {/* Toolbar: search + actions */}
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

      {filtered.map((hook, i) => (
        <div
          key={i}
          className="group flex items-start justify-between gap-3 p-4 rounded-xl border border-border/40 bg-card/30 hover:border-primary/30 transition-all"
        >
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="text-xs font-mono text-muted-foreground/40 mt-0.5 w-5 flex-shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="flex-1 min-w-0">
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
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No hooks match your search.
        </div>
      )}
    </div>
  );
}
