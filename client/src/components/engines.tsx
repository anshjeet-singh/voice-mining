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
  status?: string;
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

  /** Two groups: the working batch (pending + rejected) and the approved library. */
  const grouped: Array<[string, ClientAssetMeta[]]> = [
    ["New this batch", assets.filter((a) => a.status !== "approved")],
    ["Approved library", approved],
  ].filter(([, g]) => (g as ClientAssetMeta[]).length > 0) as Array<[string, ClientAssetMeta[]]>;

  /**
   * Rebuilds route to the engine that OWNS each rejected ad. A rejected
   * statics-engine ad (ad_statics_extra) requeued as the full ads stage
   * regenerates the original 15-ad batch instead: the server then skips every
   * incoming file as already-approved and nothing visibly changes. Grouping
   * by docType sends each rejection back through its own pipeline, whose
   * completion sweeps that docType and accepts the rebuilt filenames.
   */
  const stageForDocType = (docType: string): StageId => (docType === "ad_statics_extra" ? "more_statics" : "ads");

  const regenerateRejected = () => {
    const groups = new Map<StageId, ClientAssetMeta[]>();
    for (const a of rejected) {
      const st = stageForDocType(a.docType);
      groups.set(st, [...(groups.get(st) ?? []), a]);
    }
    for (const [stage, group] of Array.from(groups.entries())) {
      const feedback = [
        `REBUILD ONLY these rejected static ads (keep each one's EXACT filename); do NOT generate any other ads:`,
        ...group.map((a) => `- ${a.filename}: ${a.feedback || "rejected, no note"}`),
        approved.length ? `Approved library (do not touch, do not re-render): ${approved.map((a) => a.filename).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      generate.mutate({ clientId, stage, feedback });
    }
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
      <div className="space-y-4">
        {grouped.map(([format, group]) => (
          <div key={format}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              {format} <span className="font-normal">· {group.length}</span>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {group.map((a) => (
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
  /** Structured intent options (e.g. what an email is FOR, or the awareness level). */
  purposes?: string[];
  purposesLabel?: string;
  /** Optional toggles appended to the request when ticked (e.g. "also write the SMS"). */
  addons?: Array<{ label: string; request: string; default?: boolean }>;
  /** Show the sub-avatar multi-select (parsed from the ICP doc) on this engine. */
  hasAudience?: boolean;
  /** Show the offer select (parsed from the Offers doc) on this engine. */
  hasOffer?: boolean;
  compose: (count: number, styles: string[], notes: string, purpose?: string) => string;
}> = [
  {
    kind: "more_statics",
    label: "Static ads",
    blurb: "Rendered natives cloned from your reference library",
    counts: [5, 10, 15],
    defaultCount: 10,
    hasStyles: true,
    docType: "ad_statics_extra",
    purposes: ["Any mix", "Unaware", "Problem aware", "Solution aware", "Product aware"],
    purposesLabel: "Awareness level",
    hasAudience: true,
    hasOffer: true,
    notesPlaceholder: "Optional direction: angle, occasion, proof to feature...",
    compose: (count, styles, notes, purpose) =>
      `Generate EXACTLY ${count} NEW static ads.${
        purpose && purpose !== "Any mix" ? ` AWARENESS LEVEL: ${purpose}.` : ""
      }${
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
    purposes: ["Any mix", "Unaware", "Problem aware", "Solution aware", "Product aware"],
    purposesLabel: "Awareness level",
    hasAudience: true,
    hasOffer: true,
    notesPlaceholder: "Optional direction: angle, format, hook archetype...",
    compose: (count, _s, notes, purpose) =>
      `Write EXACTLY ${count} NEW full-length video ad scripts, new angles, no duplicates of existing scripts.${
        purpose && purpose !== "Any mix" ? ` AWARENESS LEVEL: ${purpose}.` : ""
      }${notes ? ` Operator direction: ${notes}` : ""}`,
  },
  {
    kind: "more_content_ig",
    label: "Instagram reels",
    blurb: "Organic reel scripts fed by the freshest competitor intel: hook, beats, on-screen text, caption",
    counts: [3, 5, 10],
    defaultCount: 5,
    hasStyles: false,
    docType: "content_ig_extra",
    purposes: ["Mixed batch", "Top of funnel (reach)", "Middle (value / mechanism)", "Bottom (proof / offer)"],
    purposesLabel: "Funnel stage",
    hasAudience: true,
    hasOffer: true,
    notesPlaceholder: "Audience (which sub-avatar), offer, topics, pains to hit...",
    compose: (count, _s, notes, purpose) =>
      `Write EXACTLY ${count} Instagram reel scripts.${
        purpose && purpose !== "Mixed batch" ? ` FUNNEL STAGE: ${purpose}.` : " Mix funnel stages for a balanced batch."
      } Model the freshest Competitor Content Intel in the approved docs.${notes ? ` Operator direction: ${notes}` : " Pick the strongest topics from the research yourself."}`,
  },
  {
    kind: "more_content_yt",
    label: "YouTube scripts",
    blurb: "Long-form scripts fed by competitor intel: 4-beat hook, story arcs, CTA",
    counts: [1, 2, 3],
    defaultCount: 1,
    hasStyles: false,
    docType: "content_yt_extra",
    purposes: ["Middle (value / mechanism)", "Top of funnel (reach)", "Bottom (case study / proof)"],
    purposesLabel: "Funnel stage",
    hasAudience: true,
    hasOffer: true,
    notesPlaceholder: "Audience (which sub-avatar), offer, topic, outlier to model...",
    compose: (count, _s, notes, purpose) =>
      `Write EXACTLY ${count} long-form YouTube script${count > 1 ? "s" : ""}.${
        purpose ? ` FUNNEL STAGE: ${purpose}.` : ""
      } Model the freshest Competitor Content Intel in the approved docs.${notes ? ` Operator direction: ${notes}` : " Pick the strongest topic from the research yourself."}`,
  },
  {
    kind: "more_emails",
    label: "Email copy",
    blurb: "Broadcasts, promos, re-engagement: swipe-file style",
    counts: [1, 3, 5],
    defaultCount: 1,
    hasStyles: false,
    docType: "emails_extra",
    purposes: [
      "VSL / booking push",
      "Post-booking",
      "Community nurture",
      "Cash injection",
      "Pre-webinar",
      "Post-webinar",
      "Newsletter",
    ],
    purposesLabel: "Campaign",
    hasAudience: true,
    hasOffer: true,
    addons: [
      {
        label: "Also write the SMS versions",
        request: "ALSO write the matching GHL SMS version after every email ({{contact.first_name}} verbatim, under 320 characters, one link max).",
      },
    ],
    notesPlaceholder: "Specifics: the occasion, the deadline, the asset to push...",
    compose: (count, _s, notes, purpose) =>
      `Write EXACTLY ${count} email${count > 1 ? "s" : ""}. PURPOSE: ${purpose || "highest-leverage broadcast for the current funnel"}.${
        notes ? ` Specifics: ${notes}` : ""
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
  clientId,
  invalidate,
  avatars = [],
  offers = [],
}: {
  engine: (typeof ENGINES)[number];
  job: StageJob;
  clientId: number;
  invalidate: () => void;
  /** Sub-avatars parsed from the approved ICP doc: multi-select audience. */
  avatars?: string[];
  /** Offers parsed from the approved Offers doc: single-select. */
  offers?: string[];
}) {
  const [count, setCount] = useState(engine.defaultCount);
  const [styles, setStyles] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [purpose, setPurpose] = useState(engine.purposes?.[0] ?? "");
  const [audience, setAudience] = useState<string[]>([]);
  const [offer, setOffer] = useState("");
  const [addons, setAddons] = useState<string[]>(
    (engine.addons ?? []).filter((a) => a.default).map((a) => a.label)
  );

  const generate = trpc.clients.generateStage.useMutation({
    onSuccess: () => {
      invalidate();
      setNotes("");
      toast.success("Queued. Your Mac worker will pick it up");
    },
    onError: (err) => toast.error(err.message),
  });
  const status = job?.status ?? null;
  const busy = status === "queued" || status === "running";

  const composeRequest = () => {
    let req = engine.compose(count, styles, notes.trim(), purpose);
    if (audience.length) req += ` AUDIENCE: ${audience.join(" + ")}.`;
    if (offer) req += ` OFFER: ${offer}.`;
    for (const a of engine.addons ?? []) {
      if (addons.includes(a.label)) req += ` ${a.request}`;
    }
    return req;
  };

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
      active
        ? "bg-primary/20 text-primary border-primary/50"
        : "bg-card/60 text-muted-foreground border-border/40 hover:text-foreground hover:border-border"
    }`;

  const selectorRow = (label: string, node: React.ReactNode) => (
    <div className="mb-2.5">
      <p className="text-[11px] font-medium text-muted-foreground mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">{node}</div>
    </div>
  );

  return (
    <div className="rounded-lg border border-border/40 bg-card/20 p-4">
      <p className="text-xs font-semibold text-foreground">{engine.label}</p>
      <p className="text-[11px] text-muted-foreground mb-2.5">{engine.blurb}</p>

      {busy ? (
        <div className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground">
            {status === "queued" ? "Waiting for your Mac worker" : job?.progress || "Generating..."}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-2.5">
            <span className="text-[11px] text-muted-foreground w-10">Count</span>
            <input
              type="range"
              min={1}
              max={30}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="flex-1 h-1.5 accent-primary cursor-pointer"
            />
            <span className="w-8 text-center text-xs font-semibold text-foreground bg-card/60 rounded px-1.5 py-0.5 tabular-nums">
              {count}
            </span>
          </div>

          {engine.purposes &&
            selectorRow(
              engine.purposesLabel ?? "Purpose",
              engine.purposes.map((pu) => (
                <button key={pu} onClick={() => setPurpose(pu)} className={chip(purpose === pu)}>
                  {pu}
                </button>
              ))
            )}

          {engine.hasAudience &&
            avatars.length > 0 &&
            selectorRow(
              "Audience (pick one or more sub-avatars, empty = all)",
              avatars.map((av) => (
                <button
                  key={av}
                  onClick={() => setAudience((prev) => (prev.includes(av) ? prev.filter((x) => x !== av) : [...prev, av]))}
                  className={chip(audience.includes(av))}
                >
                  {av}
                </button>
              ))
            )}

          {engine.hasOffer &&
            offers.length > 0 &&
            selectorRow(
              "Offer (what this sells)",
              offers.map((of) => (
                <button key={of} onClick={() => setOffer(offer === of ? "" : of)} className={chip(offer === of)}>
                  {of}
                </button>
              ))
            )}

          {engine.hasStyles && (
            <div className="mb-2.5">
              <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Styles (optional: empty = diverse mix)</p>
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

          {(engine.addons ?? []).map((a) => (
            <label key={a.label} className="flex items-center gap-2 mb-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={addons.includes(a.label)}
                onChange={() =>
                  setAddons((prev) => (prev.includes(a.label) ? prev.filter((x) => x !== a.label) : [...prev, a.label]))
                }
                className="w-3.5 h-3.5 accent-primary cursor-pointer"
              />
              <span className="text-xs text-foreground">{a.label}</span>
            </label>
          ))}

          <Textarea
            placeholder={engine.notesPlaceholder}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-14 text-[11px] mb-2.5"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={generate.isPending}
              onClick={() => generate.mutate({ clientId, stage: engine.kind, feedback: composeRequest() })}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-7 text-xs"
            >
              {generate.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
              Generate {count}
            </Button>
          </div>
          {status === "failed" && job?.error && (
            <p className="mt-2 text-[11px] text-destructive">Last run failed: {job.error.slice(0, 200)}</p>
          )}
        </>
      )}

    </div>
  );
}


/** Funnel-stage tag the content contracts write right under each piece's title. */
function stageTag(doc: ClientDoc): string | null {
  const m = doc.content.slice(0, 600).match(/^\*{0,2}Stage:?\*{0,2}\s*(TOF|MOF|BOF)\b/im);
  return m ? m[1].toUpperCase() : null;
}

/** Kanban pipeline for deliverable docs: Draft -> Approved -> Posted. */
const BOARD_COLUMNS = [
  { id: "draft", label: "Drafts", tint: "bg-slate-500/[0.07] border-slate-500/25" },
  { id: "approved", label: "Approved", tint: "bg-emerald-500/[0.07] border-emerald-500/25" },
  { id: "posted", label: "Posted", tint: "bg-sky-500/[0.07] border-sky-500/25" },
] as const;

export function DocBoard({
  docs,
  invalidate,
  clientId,
  docType,
  accent = "primary",
}: {
  docs: ClientDoc[];
  invalidate: () => void;
  /** Enables the "Write your own" draft composer. */
  clientId?: number;
  docType?: string;
  accent?: string;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [composing, setComposing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");

  const setStatus = trpc.clients.setDocumentStatus.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err.message),
  });
  const del = trpc.clients.deleteDocument.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Deleted");
    },
    onError: (err) => toast.error(err.message),
  });
  const update = trpc.clients.updateDocument.useMutation({
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success("Saved");
    },
    onError: (err) => toast.error(err.message),
  });
  const addDraft = trpc.clients.addEngineDraft.useMutation({
    onSuccess: () => {
      invalidate();
      setComposing(false);
      setDraftTitle("");
      setDraftBody("");
      toast.success("Draft added to the board");
    },
    onError: (err) => toast.error(err.message),
  });

  const visible = docs.filter((d) => (d.status ?? "draft") !== "archived");

  return (
    <div>
      {clientId && docType && (
        <div className="mb-3">
          {!composing ? (
            <button
              onClick={() => setComposing(true)}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground border border-dashed border-border/60 rounded-lg px-3 py-1.5"
            >
              + Write your own draft
            </button>
          ) : (
            <div className="rounded-lg border border-border/50 bg-background/40 p-3 space-y-2">
              <input
                autoFocus
                placeholder="Title"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="w-full bg-card/60 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
              />
              <Textarea
                placeholder="Your idea, hook, or full script. It lands in Drafts: edit, extend, or hand it to the engine as direction later."
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                className="min-h-24 text-xs"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={addDraft.isPending || !draftTitle.trim() || !draftBody.trim()}
                  onClick={() => addDraft.mutate({ clientId, docType, title: draftTitle.trim(), content: draftBody.trim() })}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 h-7 text-xs"
                >
                  {addDraft.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                  Add to Drafts
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setComposing(false)} className="h-7 text-xs">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {!visible.length ? (
        <p className="text-[11px] text-muted-foreground">Nothing here yet: generate above or write your own draft.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {BOARD_COLUMNS.map((col) => {
            const items = visible.filter((d) => (d.status ?? "draft") === col.id);
            return (
              <div key={col.id} className={`rounded-xl border p-2.5 min-h-28 ${col.tint}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70 px-1 pb-2">
                  {col.label} <span className="text-muted-foreground font-normal">· {items.length}</span>
                </p>
                <div className="space-y-2">
                  {items.map((doc) => (
                    <div key={doc.id} className="rounded-lg border border-border/60 bg-background/70 shadow-sm">
                      <button
                        onClick={() => setExpanded(expanded === doc.id ? null : doc.id)}
                        className="w-full flex items-center gap-2 p-2.5 text-left"
                      >
                        <FileText className="w-3 h-3 text-primary flex-shrink-0" />
                        <span className="flex-1 text-[11px] font-medium text-foreground leading-snug">{doc.title}</span>
                        {stageTag(doc) && (
                          <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-primary/15 text-primary">
                            {stageTag(doc)}
                          </span>
                        )}
                        {expanded === doc.id ? (
                          <ChevronUp className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        )}
                      </button>
                      <div className="flex items-center gap-1 px-2.5 pb-2">
                        {col.id !== "draft" && (
                          <button
                            disabled={setStatus.isPending}
                            onClick={() => setStatus.mutate({ id: doc.id, status: col.id === "approved" ? "draft" : "approved" })}
                            className="h-5 px-1.5 rounded text-[10px] bg-card/80 text-muted-foreground hover:text-foreground"
                          >
                            ←
                          </button>
                        )}
                        {col.id !== "posted" && (
                          <button
                            disabled={setStatus.isPending}
                            onClick={() => setStatus.mutate({ id: doc.id, status: col.id === "draft" ? "approved" : "posted" })}
                            className={`h-5 px-2 rounded text-[10px] font-semibold ${
                              col.id === "draft"
                                ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                : "bg-sky-500/20 text-sky-400 hover:bg-sky-500/30"
                            }`}
                          >
                            {col.id === "draft" ? "Approve →" : "Posted →"}
                          </button>
                        )}
                        <span className="flex-1" />
                        <button
                          onClick={() => {
                            setEditing(doc.id);
                            setEditContent(doc.content);
                            setExpanded(doc.id);
                          }}
                          className="h-5 px-1.5 rounded text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          Edit
                        </button>
                        <button
                          disabled={del.isPending}
                          onClick={() => {
                            if (confirm(`Delete "${doc.title}" permanently?`)) del.mutate({ id: doc.id });
                          }}
                          className="h-5 px-1.5 rounded text-[10px] text-muted-foreground hover:text-destructive"
                          title="Delete"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                      {expanded === doc.id && (
                        <div className="px-2.5 pb-2.5">
                          {editing === doc.id ? (
                            <div className="space-y-2">
                              <Textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                className="min-h-48 text-xs font-mono"
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  disabled={update.isPending}
                                  onClick={() => update.mutate({ id: doc.id, content: editContent })}
                                  className="bg-primary text-primary-foreground hover:bg-primary/90 h-6 text-[11px]"
                                >
                                  Save
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditing(null)} className="h-6 text-[11px]">
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="max-h-96 overflow-y-auto rounded-lg bg-card/40 p-3">
                              <MarkdownDoc content={doc.content} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {!items.length && <p className="text-[10px] text-muted-foreground/50 px-1">Empty</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
