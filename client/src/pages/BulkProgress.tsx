import { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { AppShell } from "@/components/AppShell";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronLeft, Layers, Loader2, XCircle } from "lucide-react";

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Queued", color: "text-yellow-400", bg: "bg-yellow-400/10" },
  mining: { label: "Mining", color: "text-blue-400", bg: "bg-blue-400/10" },
  analyzing: { label: "Analyzing", color: "text-purple-400", bg: "bg-purple-400/10" },
  complete: { label: "Complete", color: "text-emerald-400", bg: "bg-emerald-400/10" },
  failed: { label: "Failed", color: "text-red-400", bg: "bg-red-400/10" },
};

/** Progress dashboard for bulk keyword searches — polls all pipelines at once. */
export default function BulkProgress() {
  const [, navigate] = useLocation();
  const search = useSearch();

  const ids = useMemo(() => {
    const params = new URLSearchParams(search);
    return (params.get("ids") ?? "")
      .split(",")
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n))
      .slice(0, 20);
  }, [search]);

  const { data: statuses, isLoading } = trpc.mining.getStatuses.useQuery(
    { ids },
    {
      enabled: ids.length > 0,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return 2500;
        const stillRunning = data.some((s) => s.status !== "complete" && s.status !== "failed");
        return stillRunning ? 2500 : false;
      },
    }
  );

  const completed = (statuses ?? []).filter((s) => s.status === "complete").length;
  const failed = (statuses ?? []).filter((s) => s.status === "failed").length;
  const total = statuses?.length ?? ids.length;
  const allDone = total > 0 && completed + failed === total;

  if (ids.length === 0) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-32 text-center px-4">
          <Layers className="w-8 h-8 text-muted-foreground mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-1">No bulk searches to track</h2>
          <Button variant="ghost" onClick={() => navigate("/search/new")} className="mt-4">
            Start a new search
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Dashboard
          </button>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight mb-2">
            {allDone ? "Bulk mining complete" : "Bulk mining in progress"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {allDone
              ? `${completed} of ${total} reports ready${failed > 0 ? `, ${failed} failed` : ""}. Open any report below.`
              : `Running ${total} keyword pipelines, up to 3 at a time. Reports open automatically when each finishes.`}
          </p>
        </div>

        {/* Overall progress */}
        <div className="p-4 rounded-xl border border-border/40 bg-card/30 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Overall progress</span>
            <span className="text-xs font-semibold text-foreground">{completed + failed} / {total}</span>
          </div>
          <div className="h-2 rounded-full bg-card overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: total > 0 ? `${((completed + failed) / total) * 100}%` : "0%" }}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {(statuses ?? []).map((s) => {
              const style = STATUS_STYLES[s.status] ?? STATUS_STYLES.pending;
              const isRunning = s.status === "mining" || s.status === "analyzing";
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/search/${s.id}`)}
                  className="w-full p-4 rounded-xl border border-border/40 bg-card/30 hover:border-primary/30 transition-all text-left"
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-sm font-medium text-foreground truncate">{s.keyword}</span>
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${style.bg} ${style.color}`}>
                      {isRunning && <Loader2 className="w-3 h-3 animate-spin" />}
                      {s.status === "complete" && <CheckCircle2 className="w-3 h-3" />}
                      {s.status === "failed" && <XCircle className="w-3 h-3" />}
                      {style.label}
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-card overflow-hidden mb-1.5">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${s.status === "failed" ? "bg-red-400" : "bg-primary"}`}
                      style={{ width: `${s.progress}%` }}
                    />
                  </div>
                  {s.progressMessage && (
                    <p className="text-xs text-muted-foreground truncate">{s.progressMessage}</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
