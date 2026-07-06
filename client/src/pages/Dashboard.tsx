import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Bookmark,
  CheckCircle2,
  Circle,
  FileText,
  Layers,
  Link2,
  Loader2,
  Pickaxe,
  Plus,
  Search,
  Share2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { formatDistanceToNow } from "date-fns";

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "text-yellow-400", bg: "bg-yellow-400/10" },
  mining: { label: "Mining", color: "text-blue-400", bg: "bg-blue-400/10" },
  analyzing: { label: "Analyzing", color: "text-purple-400", bg: "bg-purple-400/10" },
  complete: { label: "Complete", color: "text-emerald-400", bg: "bg-emerald-400/10" },
  failed: { label: "Failed", color: "text-red-400", bg: "bg-red-400/10" },
};

const ACTIVITY_META: Record<string, { label: string; icon: typeof Search }> = {
  search_created: { label: "Started mining", icon: Search },
  report_generated: { label: "Report generated", icon: FileText },
  vault_saved: { label: "Saved to Vault", icon: Bookmark },
  report_shared: { label: "Shared report", icon: Share2 },
  trend_refreshed: { label: "Refreshed trends", icon: TrendingUp },
};

export default function Dashboard() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  const { data: searches, isLoading: searchesLoading } = trpc.mining.list.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasActive = data.some((s) => s.status === "mining" || s.status === "analyzing");
      return hasActive ? 3000 : false;
    },
  });

  const { data: stats, isLoading: statsLoading } = trpc.dashboard.stats.useQuery(undefined, { enabled: isAuthenticated });
  const { data: activity } = trpc.dashboard.activity.useQuery(undefined, { enabled: isAuthenticated });
  const { data: onboarding } = trpc.dashboard.onboarding.useQuery(undefined, { enabled: isAuthenticated });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AppShell><div /></AppShell>;
  }

  const recentSearches = searches?.slice(0, 5) ?? [];

  const onboardingSteps = onboarding
    ? [
        { label: "Run your first search", done: onboarding.ranFirstSearch, action: () => navigate("/search/new") },
        { label: "View your report", done: onboarding.viewedReport, action: () => navigate("/reports") },
        { label: "Save your favourite pieces to the Vault", done: onboarding.savedToVault, action: () => navigate("/reports") },
        { label: "Check the Trend Tracker", done: onboarding.checkedTrends, action: () => navigate("/trends") },
      ]
    : [];
  const showOnboarding = onboardingSteps.length > 0 && onboardingSteps.some((s) => !s.done);

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your market intelligence workspace
            </p>
          </div>
          <Button
            onClick={() => navigate("/search/new")}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Search
          </Button>
        </div>

        {/* Onboarding checklist for new users */}
        {showOnboarding && (
          <div className="p-5 rounded-xl border border-primary/20 bg-primary/5 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Get your first win in 4 steps</h2>
              <span className="text-xs text-muted-foreground ml-auto">
                {onboardingSteps.filter((s) => s.done).length} of {onboardingSteps.length} done
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {onboardingSteps.map((step, i) => (
                <button
                  key={i}
                  onClick={step.action}
                  disabled={step.done}
                  className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all ${
                    step.done
                      ? "border-emerald-400/20 bg-emerald-400/5"
                      : "border-border/40 bg-card/30 hover:border-primary/30"
                  }`}
                >
                  {step.done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
                  )}
                  <span className={`text-xs leading-relaxed ${step.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    {step.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statsLoading || !stats ? (
            Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="p-4 rounded-xl border border-border/50 bg-card/50">
                <Skeleton className="h-3 w-24 mb-4" />
                <Skeleton className="h-7 w-12" />
              </div>
            ))
          ) : (
            [
              { label: "Keywords Mined", value: stats.keywordsMined, icon: Pickaxe },
              { label: "Content Pieces Generated", value: stats.contentPieces, icon: Layers },
              { label: "Vault Items", value: stats.vaultItems, icon: Bookmark },
              { label: "Trend Snapshots", value: stats.trendSnapshots, icon: TrendingUp },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="p-4 rounded-xl border border-border/50 bg-card/50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
                    <Icon className="w-4 h-4 text-muted-foreground/50" />
                  </div>
                  <div className="text-2xl font-semibold text-foreground">{stat.value.toLocaleString()}</div>
                </div>
              );
            })
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Recent Searches */}
          <div className="rounded-xl border border-border/50 bg-card/30 overflow-hidden h-fit">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
              <h2 className="text-sm font-semibold text-foreground">Recent Searches</h2>
              <button
                onClick={() => navigate("/reports")}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                View all reports
              </button>
            </div>

            {searchesLoading ? (
              <div className="p-5 space-y-4">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            ) : recentSearches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                  <Search className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1">No searches yet</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Start mining conversations to uncover market insights
                </p>
                <Button
                  size="sm"
                  onClick={() => navigate("/search/new")}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Start Your First Search
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/20">
                {recentSearches.map((search) => {
                  const status = STATUS_CONFIG[search.status];
                  return (
                    <button
                      key={search.id}
                      onClick={() => navigate(`/search/${search.id}`)}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-card/50 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-foreground truncate">
                            {search.keyword}
                          </span>
                          {search.niche && (
                            <span className="text-xs text-muted-foreground/60 truncate">
                              · {search.niche}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(search.createdAt), { addSuffix: true })}
                          </span>
                          <span className="text-xs text-muted-foreground/50">
                            {(search.platforms as string[]).join(", ")}
                          </span>
                        </div>
                      </div>
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                        {(search.status === "mining" || search.status === "analyzing") && (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        )}
                        {status.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Activity feed */}
          <div className="rounded-xl border border-border/50 bg-card/30 overflow-hidden h-fit">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border/30">
              <Activity className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
            </div>
            {(activity?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <Link2 className="w-5 h-5 text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">
                  Your actions will show up here as you mine keywords and build content.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/20">
                {(activity ?? []).map((entry) => {
                  const meta = ACTIVITY_META[entry.action] ?? ACTIVITY_META.search_created;
                  const Icon = meta.icon;
                  return (
                    <div key={entry.id} className="flex items-start gap-3 px-5 py-3">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon className="w-3 h-3 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground">
                          <span className="font-medium">{meta.label}</span>
                          <span className="text-muted-foreground"> · {entry.detail}</span>
                        </p>
                        <p className="text-xs text-muted-foreground/50 mt-0.5">
                          {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
