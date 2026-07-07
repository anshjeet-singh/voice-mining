import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { AppShell } from "@/components/AppShell";
import { FileText, Loader2, Plus, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const FOUNDATION_LABELS: Record<string, { label: string; className: string }> = {
  queued: { label: "Foundation queued", className: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  running: { label: "Foundation running", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  review: { label: "Ready for review", className: "bg-violet-500/10 text-violet-500 border-violet-500/20" },
  approved: { label: "Foundation approved", className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  failed: { label: "Foundation failed", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

export default function Clients() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    niche: "",
    funnelType: "call" as "webinar" | "call",
    pricePoint: "",
  });

  const { data: clients, isLoading } = trpc.clients.list.useQuery();

  const createClient = trpc.clients.create.useMutation({
    onSuccess: async ({ id }) => {
      await utils.clients.list.invalidate();
      setCreating(false);
      setForm({ name: "", niche: "", funnelType: "call", pricePoint: "" });
      navigate(`/clients/${id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const submit = () => {
    if (!form.name.trim() || !form.niche.trim()) {
      toast.error("Name and niche are required");
      return;
    }
    createClient.mutate({
      name: form.name,
      niche: form.niche,
      funnelType: form.funnelType,
      pricePoint: form.pricePoint.trim() || undefined,
    });
  };

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight mb-1 flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Clients
            </h1>
            <p className="text-sm text-muted-foreground">
              Onboarding, research, and fulfillment — one workspace per client
            </p>
          </div>
          {!creating && (
            <Button
              size="sm"
              onClick={() => setCreating(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Client
            </Button>
          )}
        </div>

        {creating && (
          <div className="mb-8 p-5 rounded-xl border border-primary/20 bg-card/40">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">New client</h2>
              <button
                onClick={() => setCreating(false)}
                className="p-1.5 rounded-lg hover:bg-card/80 text-muted-foreground hover:text-foreground transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Name</label>
                <Input
                  autoFocus
                  placeholder="e.g. Ibby"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Niche</label>
                <Input
                  placeholder="e.g. business credit funding"
                  value={form.niche}
                  onChange={(e) => setForm((f) => ({ ...f, niche: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Funnel type</label>
                <div className="flex gap-2">
                  {(["call", "webinar"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setForm((f) => ({ ...f, funnelType: t }))}
                      className={`flex-1 py-2 rounded-lg border text-xs font-medium capitalize transition-all ${
                        form.funnelType === t
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border/50 bg-card/30 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">
                  Price point <span className="opacity-60">(optional)</span>
                </label>
                <Input
                  placeholder="e.g. $7k"
                  value={form.pricePoint}
                  onChange={(e) => setForm((f) => ({ ...f, pricePoint: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
              </div>
            </div>
            <Button
              size="sm"
              onClick={submit}
              disabled={createClient.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {createClient.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5 mr-1.5" />
              )}
              Create Client
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : !clients || clients.length === 0 ? (
          !creating && (
            <div className="flex flex-col items-center justify-center py-24 text-center px-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">No clients yet</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Create your first client to start the fulfillment pipeline.
              </p>
              <Button
                size="sm"
                onClick={() => setCreating(true)}
                className="bg-primary text-primary-foreground"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                New Client
              </Button>
            </div>
          )
        ) : (
          <div className="space-y-3">
            {clients.map((client) => {
              const chip = client.foundationStatus
                ? FOUNDATION_LABELS[client.foundationStatus]
                : null;
              return (
                <div
                  key={client.id}
                  onClick={() => navigate(`/clients/${client.id}`)}
                  className="group flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card/30 hover:border-border/70 hover:bg-card/50 transition-all cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-primary">
                      {client.name.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{client.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {client.niche} · {client.funnelType} funnel
                      {client.pricePoint ? ` · ${client.pricePoint}` : ""}
                    </p>
                  </div>

                  <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {client.onboardingCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Search className="w-3 h-3" />
                      {client.reportCount}
                    </span>
                  </div>

                  {chip && (
                    <span
                      className={`px-2 py-0.5 rounded-full border text-[11px] font-medium flex-shrink-0 ${chip.className}`}
                    >
                      {chip.label}
                    </span>
                  )}

                  <span className="text-xs text-muted-foreground flex-shrink-0 hidden md:block">
                    {formatDistanceToNow(new Date(client.createdAt), { addSuffix: true })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
