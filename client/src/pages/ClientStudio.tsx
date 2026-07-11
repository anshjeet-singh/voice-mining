import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { AppShell } from "@/components/AppShell";
import {
  AssetGallery,
  ENGINES,
  EngineCard,
  type ClientAssetMeta,
  type ClientDoc,
  type StageJob,
} from "@/components/engines";
import {
  ChevronLeft,
  Image,
  Loader2,
  Mail,
  MonitorPlay,
  Search,
  Sparkles,
  Users,
  Youtube,
} from "lucide-react";

/** Studio sections: the client dashboard's left nav. */
const SECTIONS = [
  { id: "overview", label: "Overview", icon: Sparkles },
  { id: "ads", label: "Ads Engine", icon: Image },
  { id: "shortform", label: "Short-Form Content", icon: MonitorPlay },
  { id: "youtube", label: "YouTube Content", icon: Youtube },
  { id: "emails", label: "Email Engine", icon: Mail },
  { id: "skool", label: "Skool Engine", icon: Users },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const engineByKind = (kind: string) => ENGINES.find((e) => e.kind === kind)!;

/** A titled studio block wrapping one engine + its output. */
function StudioBlock({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/30 p-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {hint && <p className="text-xs text-muted-foreground mb-3">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </div>
  );
}

export default function ClientStudio() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [section, setSection] = useState<SectionId>("overview");

  const { data, isLoading } = trpc.clients.get.useQuery(
    { id: clientId },
    { enabled: Number.isInteger(clientId) && clientId > 0 }
  );

  const jobs = (data?.jobs ?? {}) as Record<string, StageJob>;
  const documents = (data?.documents ?? []) as ClientDoc[];
  const assets = (data?.assets ?? []) as ClientAssetMeta[];

  const hasActiveJob = Object.values(jobs).some((j) => j?.status === "queued" || j?.status === "running");
  useEffect(() => {
    if (!hasActiveJob) return;
    const t = setInterval(() => utils.clients.get.invalidate({ id: clientId }), 5000);
    return () => clearInterval(t);
  }, [hasActiveJob, clientId, utils]);

  const invalidate = () => utils.clients.get.invalidate({ id: clientId });

  const docsFor = (docType: string) => documents.filter((d) => d.docType === docType);
  const approvedAds = useMemo(() => assets.filter((a) => a.status === "approved"), [assets]);
  const intelDocs = docsFor("content_intel_extra");
  const engineDocCount = ENGINES.reduce((n, e) => n + docsFor(e.docType).length, 0);

  if (isLoading || !data) {
    return (
      <AppShell>
        <div className="p-10 flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading studio...
        </div>
      </AppShell>
    );
  }

  const intelBlock = (context: string) => (
    <StudioBlock
      title="Competitor research"
      hint={`Scrape + transcribe competitor reels: hook styles, beats, and gaps. Fresh intel automatically feeds every ${context} run`}
    >
      <EngineCard
        engine={engineByKind("content_intel")}
        job={jobs.content_intel ?? null}
        docs={intelDocs}
        clientId={clientId}
        invalidate={invalidate}
      />
    </StudioBlock>
  );

  return (
    <AppShell>
      <div className="flex min-h-screen">
        {/* ── Studio nav ── */}
        <div className="w-56 flex-shrink-0 border-r border-border/40 p-4 space-y-1">
          <button
            onClick={() => navigate(`/clients/${clientId}`)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Pipeline
          </button>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground px-2 pb-1">
            {data.client.name}
          </p>
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            return (
              <button
                key={sec.id}
                onClick={() => setSection(sec.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  section === sec.id
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {sec.label}
              </button>
            );
          })}
        </div>

        {/* ── Section content ── */}
        <div className="flex-1 p-6 lg:p-8 space-y-4 min-w-0">
          {section === "overview" && (
            <>
              <div>
                <h1 className="text-lg font-semibold text-foreground">{data.client.name} Studio</h1>
                <p className="text-xs text-muted-foreground">
                  {data.client.niche} · {data.client.funnelType} funnel · pipeline approved
                </p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: "Approved ads in library", value: approvedAds.length },
                  { label: "Engine documents", value: engineDocCount },
                  { label: "Intel reports", value: intelDocs.length },
                  { label: "Pipeline documents", value: documents.filter((d) => d.kind !== "lesson").length },
                ].map((kpi) => (
                  <div key={kpi.label} className="rounded-xl border border-border/50 bg-card/30 p-4">
                    <p className="text-2xl font-semibold text-foreground">{kpi.value}</p>
                    <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                  </div>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {SECTIONS.filter((sec) => sec.id !== "overview").map((sec) => {
                  const Icon = sec.icon;
                  return (
                    <button
                      key={sec.id}
                      onClick={() => setSection(sec.id)}
                      className="rounded-xl border border-border/50 bg-card/30 p-4 text-left hover:border-primary/40 transition-colors"
                    >
                      <Icon className="w-4 h-4 text-primary mb-2" />
                      <p className="text-sm font-medium text-foreground">{sec.label}</p>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {section === "ads" && (
            <>
              <h1 className="text-lg font-semibold text-foreground">Ads Engine</h1>
              <StudioBlock
                title="Ad library"
                hint="Approved ads accumulate here forever. Reject with notes and rebuild: your verdicts train every future batch"
              >
                <AssetGallery
                  assets={assets}
                  clientId={clientId}
                  stageId="ads"
                  invalidate={invalidate}
                  canRegenerate
                />
              </StudioBlock>
              <div className="grid lg:grid-cols-2 gap-4">
                <StudioBlock title="Generate static ads">
                  <EngineCard engine={engineByKind("more_statics")} job={jobs.more_statics ?? null} docs={docsFor("ad_statics_extra")} clientId={clientId} invalidate={invalidate} />
                </StudioBlock>
                <StudioBlock title="Generate video ad scripts">
                  <EngineCard engine={engineByKind("more_scripts")} job={jobs.more_scripts ?? null} docs={docsFor("ad_scripts_extra")} clientId={clientId} invalidate={invalidate} />
                </StudioBlock>
              </div>
            </>
          )}

          {section === "shortform" && (
            <>
              <h1 className="text-lg font-semibold text-foreground">Short-Form Content</h1>
              {intelBlock("reel")}
              <StudioBlock
                title="Instagram reels"
                hint="Built on the proven talking-head structure and viral hook bank from the research, plus fresh competitor intel"
              >
                <EngineCard engine={engineByKind("more_content_ig")} job={jobs.more_content_ig ?? null} docs={docsFor("content_ig_extra")} clientId={clientId} invalidate={invalidate} />
              </StudioBlock>
            </>
          )}

          {section === "youtube" && (
            <>
              <h1 className="text-lg font-semibold text-foreground">YouTube Content</h1>
              {intelBlock("YouTube")}
              <StudioBlock
                title="Long-form scripts"
                hint="Outlier-modeled packaging from the research, 4-beat hooks, story-arc bodies, anti-pattern audited"
              >
                <EngineCard engine={engineByKind("more_content_yt")} job={jobs.more_content_yt ?? null} docs={docsFor("content_yt_extra")} clientId={clientId} invalidate={invalidate} />
              </StudioBlock>
            </>
          )}

          {section === "emails" && (
            <>
              <h1 className="text-lg font-semibold text-foreground">Email Engine</h1>
              <StudioBlock
                title="On-demand email copy"
                hint="Broadcasts, promos, re-engagement: swipe-file style, ConvertKit-ready"
              >
                <EngineCard engine={engineByKind("more_emails")} job={jobs.more_emails ?? null} docs={docsFor("emails_extra")} clientId={clientId} invalidate={invalidate} />
              </StudioBlock>
            </>
          )}

          {section === "skool" && (
            <>
              <h1 className="text-lg font-semibold text-foreground">Skool Engine</h1>
              <StudioBlock
                title="Community posts"
                hint="Value, engagement, proof, and DM-trigger posts modeled on the proven post bank"
              >
                <EngineCard engine={engineByKind("more_skool")} job={jobs.more_skool ?? null} docs={docsFor("skool_extra")} clientId={clientId} invalidate={invalidate} />
              </StudioBlock>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
