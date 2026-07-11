/**
 * Shared engine components: the on-demand generators, the per-ad review
 * gallery, and their types. Used by the pipeline page (ClientDetail) and
 * the Client Studio dashboard.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Check, ChevronDown, ChevronUp, FileText, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { MarkdownDoc } from "@/components/MarkdownDoc";

export type StageId =
  | "foundation" | "skool" | "funnel" | "emails" | "ads"
  | "more_statics" | "more_scripts" | "more_content_ig" | "more_content_yt"
  | "more_emails" | "more_skool" | "content_intel";

export type StageJob = {
  status: "queued" | "running" | "review" | "approved" | "failed";
  error?: string | null;
  progress?: string | null;
} | null;

export interface ClientDoc {
  id: number;
  kind: string;
  docType: string;
  title: string;
  content: string;
  updatedAt: string | Date;
}

export /** Rendered asset metadata from clients.get (image bytes served via /api/assets/:id). */
interface ClientAssetMeta {
  id: number;
  docType: string;
  filename: string;
  status: "pending" | "approved" | "rejected";
  feedback: string | null;
}

export /** Per-ad review gallery: view each rendered static, approve or reject with feedback. */
function AssetGallery({
  assets,
  clientId,
  stageId,
  invalidate,
  canRegenerate,
}: {
  assets: ClientAssetMeta[];
  clientId: number;
  stageId: StageId;
  invalidate: () => void;
  canRegenerate: boolean;
}) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [rejectingAsset, setRejectingAsset] = useState<number | null>(null);
  const [assetFeedback, setAssetFeedback] = useState("");

  const reviewAsset = trpc.clients.reviewAsset.useMutation({
    onSuccess: () => {
      invalidate();
      setRejectingAsset(null);
      setAssetFeedback("");
    },
    onError: (err) => toast.error(err.message),
  });
  const generate = trpc.clients.generateStage.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Regeneration queued: rejected ads get rebuilt per your feedback");
    },
    onError: (err) => toast.error(err.message),
  });

  const rejected = assets.filter((a) => a.status === "rejected");
  const approved = assets.filter((a) => a.status === "approved");

  const regenerateRejected = () => {
    const feedback = [
      `REBUILD ONLY these rejected static ads; keep every approved ad IDENTICAL (same angle, format, and copy) and re-render it unchanged:`,
      ...rejected.map((a) => `- ${a.filename}: ${a.feedback || "rejected, no note"}`),
      approved.length ? `Approved (do not change): ${approved.map((a) => a.filename).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    generate.mutate({ clientId, stage: stageId, feedback });
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-foreground">
          Rendered ads · {approved.length}/{assets.length} approved
          {rejected.length > 0 && ` · ${rejected.length} rejected`}
        </p>
        {canRegenerate && rejected.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            disabled={generate.isPending}
            onClick={regenerateRejected}
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            {generate.isPending ? (
              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1.5" />
            )}
            Rebuild {rejected.length} rejected
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {assets.map((a) => (
          <div
            key={a.id}
            className={`rounded-lg border overflow-hidden bg-background/40 ${
              a.status === "approved"
                ? "border-emerald-500/50"
                : a.status === "rejected"
                  ? "border-destructive/50"
                  : "border-border/50"
            }`}
          >
            <button className="block w-full" onClick={() => setLightbox(lightbox === a.id ? null : a.id)}>
              <img
                src={`/api/assets/${a.id}`}
                alt={a.filename}
                loading="lazy"
                className="w-full aspect-[4/5] object-cover"
              />
            </button>
            <div className="p-2 space-y-1.5">
              <p className="text-[10px] text-muted-foreground truncate" title={a.filename}>
                {a.filename}
              </p>
              <div className="flex items-center gap-1">
                <button
                  disabled={reviewAsset.isPending}
                  onClick={() => reviewAsset.mutate({ assetId: a.id, action: "approve" })}
                  className={`flex-1 h-6 rounded text-[10px] font-medium flex items-center justify-center gap-1 transition-colors ${
                    a.status === "approved"
                      ? "bg-emerald-600 text-white"
                      : "bg-card/60 text-muted-foreground hover:bg-emerald-600/20 hover:text-emerald-500"
                  }`}
                >
                  <Check className="w-2.5 h-2.5" />
                  {a.status === "approved" ? "Approved" : "Approve"}
                </button>
                <button
                  disabled={reviewAsset.isPending}
                  onClick={() => {
                    setRejectingAsset(rejectingAsset === a.id ? null : a.id);
                    setAssetFeedback(a.feedback ?? "");
                  }}
                  className={`flex-1 h-6 rounded text-[10px] font-medium flex items-center justify-center gap-1 transition-colors ${
                    a.status === "rejected"
                      ? "bg-destructive text-white"
                      : "bg-card/60 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                  }`}
                >
                  <X className="w-2.5 h-2.5" />
                  {a.status === "rejected" ? "Rejected" : "Reject"}
                </button>
              </div>
              {rejectingAsset === a.id && (
                <div className="space-y-1.5">
                  <Textarea
                    autoFocus
                    placeholder="Why? Kill the idea entirely, or say how to fix it."
                    value={assetFeedback}
                    onChange={(e) => setAssetFeedback(e.target.value)}
                    className="min-h-16 text-[11px]"
                  />
                  <Button
                    size="sm"
                    disabled={reviewAsset.isPending}
                    onClick={() =>
                      reviewAsset.mutate({ assetId: a.id, action: "reject", feedback: assetFeedback })
                    }
                    className="w-full h-6 text-[10px] bg-destructive text-white hover:bg-destructive/90"
                  >
                    Reject with note
                  </Button>
                </div>
              )}
              {a.status === "rejected" && a.feedback && rejectingAsset !== a.id && (
                <p className="text-[10px] text-destructive/80 line-clamp-2" title={a.feedback}>
                  {a.feedback}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      {lightbox !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <img
            src={`/api/assets/${lightbox}`}
            alt="Ad preview"
            className="max-h-full max-w-full rounded-lg shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}

/** Style categories from the reference-ads catalog (Ad Creative System). */
export const AD_STYLE_CATEGORIES = [
  "notes-light", "notes-dark", "imessage", "chat-bubbles", "discord-win", "tweet",
  "reddit-thread", "chatgpt-ui", "claude-ui", "question-sticker", "photo-caption-chips",
  "search-bar", "occupation-callout", "big-text-highlight", "offer-poster", "whiteboard",
  "napkin-handwriting", "two-panel-cartoon", "old-vs-new-split", "ui-vs-ui-split",
  "comparison-table", "chart-comparison", "three-step-infographic", "flywheel-diagram",
  "tombstone-shock", "lead-magnet-mock", "dr-workshop", "dr-results-checklist",
  "dr-proof-screenshot",
] as const;

/** The on-demand engines: what each generates and how the request is composed. */
export const ENGINES: Array<{
  kind: StageId;
  label: string;
  blurb: string;
  counts: number[];
  defaultCount: number;
  hasStyles: boolean;
  docType: string;
  notesPlaceholder: string;
  compose: (count: number, styles: string[], notes: string) => string;
}> = [
  {
    kind: "more_statics",
    label: "Static ads",
    blurb: "Rendered natives cloned from your reference library",
    counts: [5, 10, 15],
    defaultCount: 10,
    hasStyles: true,
    docType: "ad_statics_extra",
    notesPlaceholder: "Optional direction: offer focus, angle, occasion...",
    compose: (count, styles, notes) =>
      `Generate EXACTLY ${count} NEW static ads.${
        styles.length
          ? ` Clone ONLY from these reference catalog categories: ${styles.join(", ")}. Pick the strongest references within them.`
          : " Pick the strongest reference categories yourself for maximum batch diversity."
      }${notes ? ` Operator direction: ${notes}` : ""}`,
  },
  {
    kind: "more_scripts",
    label: "Video ad scripts",
    blurb: "Word-for-word paid video scripts on fresh angles",
    counts: [3, 5, 10],
    defaultCount: 5,
    hasStyles: false,
    docType: "ad_scripts_extra",
    notesPlaceholder: "Optional direction: angle, format, awareness level...",
    compose: (count, _s, notes) =>
      `Write EXACTLY ${count} NEW full-length video ad scripts, new angles, no duplicates of existing scripts.${notes ? ` Operator direction: ${notes}` : ""}`,
  },
  {
    kind: "more_content_ig",
    label: "Instagram reels",
    blurb: "Organic reel scripts: hook, beats, on-screen text, caption",
    counts: [3, 5, 10],
    defaultCount: 5,
    hasStyles: false,
    docType: "content_ig_extra",
    notesPlaceholder: "Optional: topics, pains to hit, series direction...",
    compose: (count, _s, notes) =>
      `Write EXACTLY ${count} Instagram reel scripts.${notes ? ` Operator direction: ${notes}` : " Pick the strongest topics from the research yourself."}`,
  },
  {
    kind: "more_content_yt",
    label: "YouTube scripts",
    blurb: "Long-form scripts: 4-beat hook, story arcs, CTA",
    counts: [1, 2, 3],
    defaultCount: 1,
    hasStyles: false,
    docType: "content_yt_extra",
    notesPlaceholder: "Optional: topic, outlier to model, format...",
    compose: (count, _s, notes) =>
      `Write EXACTLY ${count} long-form YouTube script${count > 1 ? "s" : ""}.${notes ? ` Operator direction: ${notes}` : " Pick the strongest topic from the research yourself."}`,
  },
  {
    kind: "more_emails",
    label: "Email copy",
    blurb: "Broadcasts, promos, re-engagement: swipe-file style",
    counts: [1, 3, 5],
    defaultCount: 1,
    hasStyles: false,
    docType: "emails_extra",
    notesPlaceholder: "What do you need? e.g. promo broadcast for the workshop, 3-email re-engagement...",
    compose: (count, _s, notes) =>
      `Write EXACTLY ${count} email${count > 1 ? "s" : ""}. Request: ${
        notes || "no specific direction given: write the highest-leverage broadcast for the current funnel"
      }`,
  },
  {
    kind: "content_intel",
    label: "Competitor intel",
    blurb: "Scrape + transcribe competitor reels: hooks, beats, angles",
    counts: [3, 5],
    defaultCount: 3,
    hasStyles: false,
    docType: "content_intel_extra",
    notesPlaceholder: "Instagram handles, comma separated (empty = use onboarding competitor list). e.g. handle1, handle2",
    compose: (count, _s, notes) =>
      `Run competitor content intel at ${count} reels per account.${
        notes
          ? ` Instagram handles: ${notes}.`
          : " Extract the Instagram handles from the client's onboarding competitors document."
      }`,
  },
  {
    kind: "more_skool",
    label: "Skool posts",
    blurb: "Value, engagement, proof, and DM-trigger posts",
    counts: [3, 5, 10],
    defaultCount: 5,
    hasStyles: false,
    docType: "skool_extra",
    notesPlaceholder: "Optional: focus, lead magnet to push, occasion...",
    compose: (count, _s, notes) =>
      `Write EXACTLY ${count} Skool community posts.${notes ? ` Operator direction: ${notes}` : ""}`,
  },
];

/** One on-demand engine: compose a request, run it, review the output doc. */
export function EngineCard({
  engine,
  job,
  docs,
  clientId,
  invalidate,
}: {
  engine: (typeof ENGINES)[number];
  job: StageJob;
  docs: ClientDoc[];
  clientId: number;
  invalidate: () => void;
}) {
  const [count, setCount] = useState(engine.defaultCount);
  const [styles, setStyles] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [expandedDoc, setExpandedDoc] = useState<number | null>(null);

  const generate = trpc.clients.generateStage.useMutation({
    onSuccess: () => {
      invalidate();
      setNotes("");
      toast.success("Queued. Your Mac worker will pick it up");
    },
    onError: (err) => toast.error(err.message),
  });
  const review = trpc.clients.reviewStage.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const status = job?.status ?? null;
  const busy = status === "queued" || status === "running";

  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-4">
      <p className="text-xs font-semibold text-foreground">{engine.label}</p>
      <p className="text-[11px] text-muted-foreground mb-2">{engine.blurb}</p>

      {busy ? (
        <div className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground">
            {status === "queued" ? "Waiting for your Mac worker" : job?.progress || "Generating..."}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-muted-foreground">Count</span>
            {engine.counts.map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`h-6 px-2.5 rounded text-[11px] font-medium transition-colors ${
                  count === n ? "bg-primary text-primary-foreground" : "bg-card/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {engine.hasStyles && (
            <div className="mb-2">
              <p className="text-[11px] text-muted-foreground mb-1.5">Styles (optional: empty = diverse mix)</p>
              <div className="flex flex-wrap gap-1">
                {AD_STYLE_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() =>
                      setStyles((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
                    }
                    className={`px-2 py-0.5 rounded-full text-[10px] transition-colors ${
                      styles.includes(c)
                        ? "bg-primary/20 text-primary border border-primary/40"
                        : "bg-card/60 text-muted-foreground border border-border/40 hover:text-foreground"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Textarea
            placeholder={engine.notesPlaceholder}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-14 text-[11px] mb-2"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={generate.isPending}
              onClick={() => generate.mutate({ clientId, stage: engine.kind, feedback: engine.compose(count, styles, notes.trim()) })}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-7 text-xs"
            >
              {generate.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
              Generate {count}
            </Button>
            {status === "review" && (
              <Button
                size="sm"
                disabled={review.isPending}
                onClick={() => review.mutate({ clientId, stage: engine.kind, action: "approve" })}
                className="bg-emerald-600 text-white hover:bg-emerald-600/90 h-7 text-xs"
              >
                <Check className="w-3 h-3 mr-1.5" />
                Mark batch done
              </Button>
            )}
          </div>
          {status === "failed" && job?.error && (
            <p className="mt-2 text-[11px] text-destructive">Last run failed: {job.error.slice(0, 200)}</p>
          )}
        </>
      )}

      {docs.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {docs.map((doc) => (
            <div key={doc.id} className="rounded-lg border border-border/40 bg-card/30">
              <button
                onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                className="w-full flex items-center gap-2 p-2 text-left"
              >
                <FileText className="w-3 h-3 text-primary flex-shrink-0" />
                <span className="flex-1 text-[11px] font-medium text-foreground truncate">{doc.title}</span>
                <span className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}
                </span>
                {expandedDoc === doc.id ? (
                  <ChevronUp className="w-3 h-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                )}
              </button>
              {expandedDoc === doc.id && (
                <div className="px-2 pb-2">
                  <div className="max-h-96 overflow-y-auto rounded-lg bg-background/40 p-3">
                    <MarkdownDoc content={doc.content} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
