/**
 * Shared engine components: the on-demand generators, the per-ad review
 * gallery, and their types. Used by the pipeline page (ClientDetail) and
 * the Client Studio dashboard.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowUpToLine, Check, ChevronDown, ChevronUp, Copy, FileText, ImagePlus, Loader2, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { MarkdownDoc } from "@/components/MarkdownDoc";
import { newStaticsRequest } from "@shared/adRequests";

export type StageId =
  | "foundation" | "skool" | "funnel" | "emails" | "ads"
  | "more_statics" | "more_scripts" | "more_content_ig" | "more_content_yt"
  | "more_emails" | "more_skool" | "more_landers" | "content_intel";

/**
 * Per-client reusable link/name substitutions, token -> value (e.g.
 * "[VSL LINK]" -> "https://..."). Provided by ClientStudio; consumed by the
 * Copy button so a link set once flows into every copied email and page.
 */
export const LinksContext = createContext<Record<string, string>>({});

/** True for a bracketed token that is a REUSABLE asset (a link, url, video,
 *  or standing name), not a per-piece copy placeholder like [PROOF] or [AVATAR]. */
export function isReusableToken(token: string): boolean {
  return /\b(LINK|URL|VIDEO|EMBED|ZOOM|CALENDAR|BOOKING|COMMUNITY|VSL|REGISTRATION|WEBINAR|TERMS|PRIVACY|LOGO|HOST|SKOOL|COMPANY|BRIDGE)\b/.test(token);
}

/** Find every reusable [TOKEN] used across a set of document contents. */
export function detectReusableTokens(contents: string[]): string[] {
  const found = new Set<string>();
  for (const c of contents) {
    const matches = c.match(/\[[A-Z][A-Z0-9 ./'&-]{2,44}\]/g) ?? [];
    for (const tok of matches) {
      if (isReusableToken(tok)) found.add(tok);
    }
  }
  return Array.from(found).sort();
}

/** Replace every saved [TOKEN] in the text with its value. */
function applyLinks(md: string, links: Record<string, string>): string {
  let out = md;
  for (const [token, value] of Object.entries(links)) {
    if (value) out = out.split(token).join(value);
  }
  return out;
}

/**
 * The offer ladder every DFY client runs. Fixed three tiers, each with its own
 * CTA destination. The worker pulls the exact name, price, and guarantee from
 * the approved Offers doc; the selector only says WHICH rung this piece sells.
 */
export const OFFER_LADDER: Array<{ label: string; request: string }> = [
  {
    label: "Free community",
    request:
      "OFFER: the FREE Skool community (top of funnel, value and nurture). Keep the pitch soft: the CTA points to joining the free community or grabbing a lead magnet, never a hard sell.",
  },
  {
    label: "Paid community",
    request:
      "OFFER: the PAID Skool community (low/mid ticket). Pull its exact name, price, and promise from the approved Offers doc. The CTA destination is the paid community join link.",
  },
  {
    label: "High ticket",
    request:
      "OFFER: the HIGH TICKET offer. Pull its exact name, price, and guarantee from the approved Offers doc. The CTA destination is ALWAYS [VSL LINK] (the VSL page is the booking page).",
  },
];

export type StageJob = {
  status: "queued" | "running" | "review" | "approved" | "failed";
  error?: string | null;
  progress?: string | null;
} | null;

export interface RefImageMeta {
  id: number;
  filename: string;
  mime: string;
  note: string | null;
}

/** Proof/cutout image uploader for the ad engine: client cutouts, approval
 *  screenshots, testimonials the render session composites into statics. */
export function RefImagePanel({
  clientId,
  images,
  invalidate,
}: {
  clientId: number;
  images: RefImageMeta[];
  invalidate: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = trpc.clients.addRefImage.useMutation({
    onSuccess: () => {
      invalidate();
      setNote("");
      toast.success("Proof image added to the ad engine");
    },
    onError: (err) => toast.error(err.message),
  });
  const del = trpc.clients.deleteRefImage.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5_000_000) {
      toast.error("Image is over 5MB — compress it first");
      return;
    }
    setBusy(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1] ?? "";
      await add.mutateAsync({ clientId, filename: file.name.slice(0, 300), mime: file.type || "image/png", data: base64, note: note.trim() || undefined });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
          {images.map((img) => (
            <div key={img.id} className="rounded-lg border border-border/50 bg-background/40 overflow-hidden">
              <img src={`/api/refimages/${img.id}`} alt={img.filename} loading="lazy" className="w-full aspect-square object-cover" />
              <div className="p-2">
                <p className="text-[10px] text-muted-foreground truncate" title={img.filename}>{img.filename}</p>
                {img.note && <p className="text-[10px] text-foreground/80 leading-snug mt-0.5">{img.note}</p>}
                <button
                  onClick={() => del.mutate({ id: img.id })}
                  className="mt-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="rounded-lg border border-dashed border-border/60 bg-background/30 p-3">
        <input
          placeholder="How to use it (optional): 'Trent cutout, no bg' · 'circle the $151k on the SoFi approval'"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full h-8 rounded-lg border border-border/40 bg-background/40 px-2.5 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 mb-2"
        />
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onPick(e.target.files?.[0])} />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()} className="h-8 text-xs">
          {busy ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5 mr-1.5" />}
          Attach proof image
        </Button>
      </div>
    </div>
  );
}

export interface ClientDoc {
  id: number;
  kind: string;
  docType: string;
  title: string;
  content: string;
  status?: string;
  updatedAt: string | Date;
}

/** Copy-to-clipboard button. Strips the machine-facing html block from docs. */
export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const links = useContext(LinksContext);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        void copyRich(text, links);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={`flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground ${className}`}
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export /** Rendered asset metadata from clients.get (image bytes served via /api/assets/:id). */
interface ClientAssetMeta {
  id: number;
  docType: string;
  filename: string;
  status: "pending" | "approved" | "rejected";
  feedback: string | null;
  /** Independent QA grade (0-100) stamped before the batch reaches review. */
  qaScore?: number | null;
  qaNote?: string | null;
  /** Ad DNA parsed from the batch spec. */
  format?: string | null;
  hookCategory?: string | null;
  /** Meta upload copy parsed from the batch spec: the ad's words. */
  copyPrimary?: string | null;
  copyHeadline?: string | null;
  copyDescription?: string | null;
  /** Real Meta results imported from Ads Manager. */
  metaSpend?: number | null;
  metaCtr?: number | null;
  metaCpl?: number | null;
}

export /** Per-ad review gallery: view each rendered static, approve or reject with feedback. */
function AssetGallery({
  assets,
  clientId,
  stageId,
  invalidate,
  canRegenerate,
  exportJob,
}: {
  assets: ClientAssetMeta[];
  clientId: number;
  stageId: StageId;
  invalidate: () => void;
  canRegenerate: boolean;
  /** Latest Drive-export job, to show the button's state. */
  exportJob?: StageJob;
}) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [rejectingAsset, setRejectingAsset] = useState<number | null>(null);
  const [assetFeedback, setAssetFeedback] = useState("");
  const [varyingAsset, setVaryingAsset] = useState<number | null>(null);
  const [varyCount, setVaryCount] = useState(5);
  const [varyNote, setVaryNote] = useState("");
  const exporting = exportJob?.status === "queued" || exportJob?.status === "running";
  const exportToDrive = trpc.clients.exportApprovedToDrive.useMutation({
    onSuccess: ({ count }) => {
      invalidate();
      toast.success(`Sending ${count} approved ads to Drive`);
    },
    onError: (err) => toast.error(err.message),
  });

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

  // Variations of one ad the operator likes: a more_statics batch that clones
  // the source ad's winning DNA (angle, copy idea, energy) across new takes.
  const queueVariations = trpc.clients.generateStage.useMutation({
    onSuccess: () => {
      invalidate();
      setVaryingAsset(null);
      setVaryNote("");
      toast.success("Variations queued: new takes on that ad's winning DNA");
    },
    onError: (err) => toast.error(err.message),
  });

  const requestVariations = (a: ClientAssetMeta) => {
    const feedback = [
      `VARIATIONS of the ad '${a.filename}': generate EXACTLY ${varyCount} NEW static ads that are variations of that exact ad.`,
      `First open and VIEW '${a.filename}' (it is in the client's ad library: the latest Drive AdsBatch output or the approved exports) and read its spec block in the ads deliverable doc.`,
      `KEEP its winning DNA: the angle, the core copy idea and voice, the offer, and the energy. That level of copywriting is the bar for every variation.`,
      `VARY one or two dimensions per variation: hook phrasing, visual format (a different reference), sub-avatar aim, or the proof beat. Each variation must read as a fresh creative to a cold feed, never a near-duplicate of the source or of each other.`,
      varyNote.trim() ? `Operator direction: ${varyNote.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    queueVariations.mutate({ clientId, stage: "more_statics", feedback });
  };

  const rejected = assets.filter((a) => a.status === "rejected");
  const approved = assets.filter((a) => a.status === "approved");

  /** Two groups: the working batch (pending + rejected) and the approved
   *  library. The batch sorts by QA score, likely winners first, so review
   *  starts at the top of the quality curve. */
  const grouped: Array<[string, ClientAssetMeta[]]> = [
    [
      "New this batch",
      assets
        .filter((a) => a.status !== "approved")
        .slice()
        .sort((a, b) => (b.qaScore ?? -1) - (a.qaScore ?? -1)),
    ],
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
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-foreground">
          Rendered ads · {approved.length}/{assets.length} approved
          {rejected.length > 0 && ` · ${rejected.length} rejected`}
        </p>
        <div className="flex items-center gap-1">
          {approved.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              disabled={exporting || exportToDrive.isPending}
              onClick={() => exportToDrive.mutate({ clientId })}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              {exporting || exportToDrive.isPending ? (
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
              ) : (
                <ArrowUpToLine className="w-3 h-3 mr-1.5" />
              )}
              {exporting ? "Sending to Drive..." : "Export approved to Drive"}
            </Button>
          )}
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
          {assets.some((a) => a.status === "pending") && (
            <Button
              size="sm"
              variant="ghost"
              disabled={reviewAsset.isPending}
              onClick={() => {
                const remaining = assets.filter((a) => a.status === "pending");
                if (confirm(`Approve all ${remaining.length} pending ads?`)) {
                  for (const a of remaining) reviewAsset.mutate({ assetId: a.id, action: "approve" });
                }
              }}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              <Check className="w-3 h-3 mr-1.5" />
              Approve all pending
            </Button>
          )}
        </div>
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
              {(a.qaScore != null || a.metaCtr != null || a.metaSpend != null) && (
                <div className="flex items-center flex-wrap gap-1">
                  {a.qaScore != null && a.status !== "approved" && (
                    <span
                      title={a.qaNote ?? "Independent QA grade"}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        a.qaScore <= 30
                          ? "bg-destructive/20 text-destructive"
                          : a.qaScore >= 85
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-card/80 text-muted-foreground"
                      }`}
                    >
                      QA {a.qaScore}
                    </span>
                  )}
                  {a.metaCtr != null && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/15 text-sky-400" title="Real CTR from Ads Manager">
                      {a.metaCtr}% CTR
                    </span>
                  )}
                  {a.metaSpend != null && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-card/80 text-muted-foreground" title={a.metaCpl != null ? `CPL $${a.metaCpl}` : "Spend"}>
                      ${a.metaSpend}
                    </span>
                  )}
                </div>
              )}
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
                <button
                  disabled={queueVariations.isPending}
                  title="Generate variations of this ad"
                  onClick={() => {
                    setVaryingAsset(varyingAsset === a.id ? null : a.id);
                    setRejectingAsset(null);
                  }}
                  className={`flex-1 h-6 rounded text-[10px] font-medium flex items-center justify-center gap-1 transition-colors ${
                    varyingAsset === a.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-card/60 text-muted-foreground hover:bg-primary/20 hover:text-primary"
                  }`}
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  Vary
                </button>
              </div>
              {varyingAsset === a.id && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    {[3, 5, 10].map((n) => (
                      <button
                        key={n}
                        onClick={() => setVaryCount(n)}
                        className={`flex-1 h-6 rounded text-[10px] font-medium transition-colors ${
                          varyCount === n
                            ? "bg-primary/15 text-primary border border-primary/40"
                            : "bg-card/60 text-muted-foreground border border-transparent hover:text-foreground"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <Textarea
                    placeholder="Optional: what to keep, what to push (hook, format, avatar...)"
                    value={varyNote}
                    onChange={(e) => setVaryNote(e.target.value)}
                    className="min-h-16 text-[11px]"
                  />
                  <Button
                    size="sm"
                    disabled={queueVariations.isPending}
                    onClick={() => requestVariations(a)}
                    className="w-full h-6 text-[10px] bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {queueVariations.isPending ? (
                      <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="w-2.5 h-2.5 mr-1" />
                    )}
                    Queue {varyCount} variations
                  </Button>
                </div>
              )}
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
        <ReviewLightbox
          assets={grouped.flatMap(([, g]) => g)}
          currentId={lightbox}
          setCurrentId={setLightbox}
          onApprove={(id) => reviewAsset.mutate({ assetId: id, action: "approve" })}
          onReject={(id, feedback) => reviewAsset.mutate({ assetId: id, action: "reject", feedback })}
          onVary={(a) => {
            setVaryCount(5);
            requestVariations(a);
          }}
          busy={reviewAsset.isPending || queueVariations.isPending}
        />
      )}
    </div>
  );
}

/**
 * Keyboard-first review: arrows move, A approves, R opens the reject note
 * (Enter sends), V queues 5 variations, Esc closes. Verdicts auto-advance,
 * so a 15-ad batch is one sub-minute pass instead of ~45 clicks.
 */
function ReviewLightbox({
  assets,
  currentId,
  setCurrentId,
  onApprove,
  onReject,
  onVary,
  busy,
}: {
  assets: ClientAssetMeta[];
  currentId: number;
  setCurrentId: (id: number | null) => void;
  onApprove: (id: number) => void;
  onReject: (id: number, feedback: string) => void;
  onVary: (a: ClientAssetMeta) => void;
  busy: boolean;
}) {
  const idx = Math.max(0, assets.findIndex((a) => a.id === currentId));
  const asset = assets[idx];
  const pending = assets.filter((a) => a.status === "pending").length;
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLInputElement>(null);

  const advance = useCallback(() => {
    const next = assets[idx + 1] ?? null;
    setCurrentId(next ? next.id : null);
    setRejecting(false);
    setNote("");
  }, [assets, idx, setCurrentId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (rejecting) {
        if (e.key === "Escape") {
          e.preventDefault();
          setRejecting(false);
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (asset) {
            onReject(asset.id, note);
            advance();
          }
        }
        return;
      }
      if (e.key === "Escape") setCurrentId(null);
      else if (e.key === "ArrowRight") setCurrentId(assets[Math.min(idx + 1, assets.length - 1)]?.id ?? null);
      else if (e.key === "ArrowLeft") setCurrentId(assets[Math.max(idx - 1, 0)]?.id ?? null);
      else if (!busy && asset && (e.key === "a" || e.key === "A")) {
        onApprove(asset.id);
        advance();
      } else if (asset && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        setRejecting(true);
        setTimeout(() => noteRef.current?.focus(), 0);
      } else if (!busy && asset && (e.key === "v" || e.key === "V")) {
        onVary(asset);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asset, assets, idx, rejecting, note, busy, advance, onApprove, onReject, onVary, setCurrentId]);

  if (!asset) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-6" onClick={() => setCurrentId(null)}>
      <div className="flex-1 min-h-0 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <img src={`/api/assets/${asset.id}`} alt={asset.filename} className="max-h-full max-w-full rounded-lg shadow-2xl" />
      </div>
      <div
        className="flex-shrink-0 mt-4 w-full max-w-2xl rounded-xl border border-border/40 bg-background/95 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {idx + 1} of {assets.length} · {pending} pending
          </span>
          <span className="flex-1 text-xs text-foreground truncate" title={asset.filename}>
            {asset.filename}
          </span>
          {asset.qaScore != null && (
            <span className="text-[10px] font-bold text-muted-foreground flex-shrink-0" title={asset.qaNote ?? ""}>
              QA {asset.qaScore}
            </span>
          )}
          <span
            className={`text-[10px] font-bold uppercase flex-shrink-0 ${
              asset.status === "approved" ? "text-emerald-400" : asset.status === "rejected" ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {asset.status}
          </span>
        </div>
        {asset.copyPrimary && (
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-card/60 px-2.5 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-foreground/90 line-clamp-2" title={asset.copyPrimary}>
                {asset.copyPrimary}
              </p>
              {(asset.copyHeadline || asset.copyDescription) && (
                <p className="text-[10px] text-muted-foreground truncate">
                  {[asset.copyHeadline, asset.copyDescription].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <CopyButton
              text={[asset.copyPrimary, asset.copyHeadline, asset.copyDescription].filter(Boolean).join("\n")}
              label="Copy ad copy"
              className="flex-shrink-0 pt-0.5"
            />
          </div>
        )}
        {rejecting ? (
          <div className="mt-2 flex items-center gap-2">
            <input
              ref={noteRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why? Enter sends the rejection, Esc cancels."
              className="flex-1 h-8 rounded-lg border border-destructive/40 bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
          </div>
        ) : (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            <kbd className="px-1 rounded bg-card border border-border/40">A</kbd> approve ·{" "}
            <kbd className="px-1 rounded bg-card border border-border/40">R</kbd> reject ·{" "}
            <kbd className="px-1 rounded bg-card border border-border/40">V</kbd> vary ·{" "}
            <kbd className="px-1 rounded bg-card border border-border/40">←</kbd>
            <kbd className="px-1 rounded bg-card border border-border/40">→</kbd> move ·{" "}
            <kbd className="px-1 rounded bg-card border border-border/40">Esc</kbd> close
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Import real Meta results: paste the Ads Manager export (select the rows in
 * the table view, copy, paste — or export CSV and paste its contents). Spend,
 * CTR, and CPL land on the matching ads and become MARKET TRUTH in every
 * future batch. The one paste a week that teaches the engine what converts.
 */
export function MetaResultsImport({ clientId, invalidate }: { clientId: number; invalidate: () => void }) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const importResults = trpc.clients.importMetaResults.useMutation({
    onSuccess: ({ matched, unmatched, total }) => {
      invalidate();
      setCsv("");
      setOpen(false);
      toast.success(
        `${matched} of ${total} ads matched and stamped${unmatched.length ? ` · unmatched: ${unmatched.slice(0, 3).join(", ")}${unmatched.length > 3 ? "…" : ""}` : ""}`
      );
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Import Meta results
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            In Ads Manager: select the ad rows (with the header row) and copy, or export the table as CSV and paste it
            here. Ad names match to the exported filenames; spend, CTR, and cost per result get stamped on each ad and
            feed every future batch as market truth.
          </p>
          <Textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"Ad name\tAmount spent (USD)\tCTR (all)\tCost per result\nibby_ad01_notes-dark_order\t$142.10\t2.31%\t$8.40"}
            className="min-h-24 text-[11px] font-mono"
          />
          <Button
            size="sm"
            disabled={importResults.isPending || csv.trim().length < 10}
            onClick={() => importResults.mutate({ clientId, csv })}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-7 text-xs"
          >
            {importResults.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
            Import results
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Style categories: the reference-ads catalog (Ad Creative System) plus the
 * phone-native formats the static-ad-builder skill renders from its own spec
 * (calendar, reminders, email-inbox — proven with Trent, no catalog image
 * needed). Formats the operator has graded as weak renders (napkin, poster,
 * tombstone, photo-chips) are QUARANTINED: never in a default mix, explicit
 * selection only, and the render rules hold them to a photoreal bar.
 */
export const AD_STYLE_CATEGORIES = [
  "notes-light", "notes-dark", "imessage", "chat-bubbles", "discord-win", "tweet",
  "reddit-thread", "chatgpt-ui", "claude-ui", "calendar", "reminders", "email-inbox",
  "question-sticker", "search-bar", "occupation-callout", "big-text-highlight",
  "whiteboard", "two-panel-cartoon", "old-vs-new-split", "ui-vs-ui-split",
  "comparison-table", "chart-comparison", "three-step-infographic", "flywheel-diagram",
  "lead-magnet-mock", "dr-workshop", "dr-results-checklist", "dr-proof-screenshot",
  "photo-caption-chips", "offer-poster", "napkin-handwriting", "tombstone-shock",
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
      `${newStaticsRequest(count)}${
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
    purposes: ["Mixed", "Top of funnel", "Middle", "Bottom"],
    purposesLabel: "Funnel stage",
    hasAudience: true,
    hasOffer: true,
    notesPlaceholder: "Audience (which sub-avatar), offer, topics, pains to hit...",
    compose: (count, _s, notes, purpose) =>
      `Write EXACTLY ${count} Instagram reel scripts.${
        purpose && purpose !== "Mixed" ? ` FUNNEL STAGE: ${purpose}.` : " Mix funnel stages for a balanced batch."
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
    purposes: ["Middle", "Top of funnel", "Bottom"],
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
    kind: "more_landers",
    label: "Landing pages",
    blurb: "High-converting funnel pages, section by section, ready to paste into GHL",
    counts: [1, 2, 3],
    defaultCount: 1,
    hasStyles: false,
    docType: "lander_extra",
    purposes: [
      "VSL / sales page",
      "Webinar registration",
      "Low-ticket sales page",
      "High-ticket application",
      "Opt-in / lead magnet",
      "Thank-you / booking",
    ],
    purposesLabel: "Page type",
    hasAudience: true,
    hasOffer: true,
    notesPlaceholder: "Optional: the promise to lead with, proof to feature, specific angle...",
    compose: (count, _s, notes, purpose) =>
      `Write EXACTLY ${count} high-converting landing page${count > 1 ? "s" : ""}, GHL-pasteable, section by section with desktop and mobile layout notes.${
        purpose ? ` PAGE TYPE: ${purpose}.` : ""
      }${notes ? ` Operator direction: ${notes}` : ""}`,
  },
  {
    kind: "more_skool",
    label: "Skool posts",
    blurb: "Value, engagement, proof, and DM-trigger posts that move people up the ladder",
    counts: [3, 5, 10],
    defaultCount: 5,
    hasStyles: false,
    docType: "skool_extra",
    purposes: ["Pure value / nurture", "Engagement question", "Win / proof", "DM trigger"],
    purposesLabel: "Post type",
    hasAudience: true,
    hasOffer: true,
    notesPlaceholder: "Optional: focus, lead magnet to push, occasion...",
    compose: (count, _s, notes, purpose) =>
      `Write EXACTLY ${count} Skool community posts.${purpose ? ` POST TYPE: ${purpose}.` : ""}${notes ? ` Operator direction: ${notes}` : ""}`,
  },
];

/**
 * One-click prebuilt sequences per funnel type. Each fires the email engine
 * with a fully-specified request, so the operator never has to describe the
 * sequence — they just click the one they need.
 */
const AGGRESSIVE = "AGGRESSIVE cadence: a NEW email every 3-8 HOURS, each with a send-timing label (e.g. +3h, +9h, +18h, +1d, +1d 6h). Every email is VALUE-PACKED and DENSE with nurture and leads with a real CASE STUDY or proof story, then breaks one limiting belief. Never a bare reminder — each email earns the open on its own, and urgency + proof escalate as it runs.";
export const PREBUILT_SEQUENCES: Record<"webinar" | "call" | "vsl", Array<{ label: string; blurb: string; request: string }>> = {
  webinar: [
    {
      label: "Pre-webinar reminder",
      blurb: "7 emails, opt-in to live: value + a proof story in each, every one restates date, time, and join link",
      request:
        "Write the PRE-WEBINAR REMINDER sequence as ONE document titled 'Pre-Webinar Reminder Sequence': EXACTLY 7 emails sent from webinar opt-in through the live event, high value and high nurture, each one an open loop that leads with a CASE STUDY or proof story AND clearly restates the webinar DATE, TIME, and the [REGISTRATION LINK] / join link. Ramp the reminders (registration confirmation, what-you'll-discover, a proof story, speaker credibility, day-before, day-of, and 1-hour-before). Every email carries standalone value, never a bare reminder. CTA destination is the webinar join link.",
    },
    {
      label: "Post-webinar (attended)",
      blurb: "Attendees who didn't buy: a new email every 3-8h, case-study heavy, belief-breaking. CTA = book a call or join the free community",
      request:
        "Write the POST-WEBINAR ATTENDED sequence as ONE document titled 'Post-Webinar Attended Sequence', for people who watched the webinar live but did NOT buy. " + AGGRESSIVE + " 8-12 emails. Break every FINAL limiting belief, answer the real FAQs and objections raised on the webinar, stack proof. The CTA is always to BOOK A CALL with the team ([VSL LINK]) or, as the softer option, join the free Skool community ([COMMUNITY LINK]).",
    },
    {
      label: "No-show / replay",
      blurb: "48h replay push (urgency + FOMO), a new email every 3-8h, then pivot to the next free training",
      request:
        "Write the NO-SHOW REPLAY sequence as ONE document titled 'No-Show Replay Sequence', for people who registered but did NOT attend. " + AGGRESSIVE + " DAYS 1-3: push the webinar REPLAY hard, live only 48 HOURS ([REPLAY LINK]), value + proof + a real expiry. DAYS 4-14: pivot to inviting them to add the next live 'free training' to their calendar ([REGISTRATION LINK]). 10-14 emails across the 14 days.",
    },
  ],
  call: [
    {
      label: "Post-booking show-up",
      blurb: "Booking to call: confirmation, case-study-heavy value nurture, one FAQ email, 24h + 3h reminders",
      request:
        "Write the POST-BOOKING SHOW-UP sequence as ONE document titled 'Post-Booking Show-Up Sequence': instant confirmation (what happens next, calendar add, the call-confirmed video at [CALL CONFIRMED VIDEO]), then value-intensive emails between booking and the call each leading with a real CASE STUDY and breaking one limiting belief, one straight FAQ email, plus 24h and 3h reminders. Every email carries standalone value, send-timing labels, CTA keeps the call.",
    },
    {
      label: "No-show / re-engagement",
      blurb: "No-show rebook (no shame) + post-call follow-up, case-study heavy, a new email every 3-8h",
      request:
        "Write the NO-SHOW + RE-ENGAGEMENT sequence as ONE document titled 'No-Show and Re-Engagement Sequence', two labeled tracks. " + AGGRESSIVE + " (1) no-show recovery, 4-5 emails that rebook without shaming (missed-you + easy rebook, cost-of-the-unsolved-problem with a proof story, proof stack, last-touch pointing back into the community); (2) post-call follow-up for prospects who didn't close, 4-5 emails (recap of their situation and the offer, objection reframe with proof, results stack, honest final follow-up). CTA is rebook / [VSL LINK].",
    },
  ],
  // The VSL funnel: opt-in -> book -> call. Two of the three are pure call-closers.
  vsl: [
    {
      label: "Opted in, not booked",
      blurb: "VSL opt-ins who haven't booked: a new email every 3-8h, case-study heavy, drives the booking",
      request:
        "Write the VSL OPTED-IN (NOT BOOKED) sequence as ONE document titled 'VSL Opted-In (Not Booked) Sequence', for people who opted into the VSL funnel but have NOT booked a call. " + AGGRESSIVE + " 8-12 emails across the first ~4 days. Teach something usable in every email, then drive hard to BOOK THE CALL ([VSL LINK] / booking calendar).",
    },
    {
      label: "Booked, pre-call nurture",
      blurb: "Booked a call: PURE value nurture to the call. Case studies, proof, belief-breaking, FAQ. No logistics, a new email every 3-8h",
      request:
        "Write the VSL BOOKED PRE-CALL NURTURE sequence as ONE document titled 'VSL Booked Pre-Call Nurture Sequence', for people who have BOOKED a call and are waiting for it. This is PURE nurture, NOT logistics: do NOT restate the call time, do NOT do calendar reminders or 'add to calendar' or 'here is when your call is', none of that (a separate confirmation flow handles logistics). " + AGGRESSIVE + " 6-9 emails. Jam every email with real CASE STUDIES and social proof, break every remaining limiting belief before the call, and answer the biggest FAQs and objections so they show up already sold. Keep the CTA soft (see you on the call, more proof inside), destination [VSL LINK] or the community.",
    },
    {
      label: "No-show recovery",
      blurb: "Booked then no-showed: rebook fast, no shame, case-study heavy, a new email every 3-8h",
      request:
        "Write the VSL NO-SHOW RECOVERY sequence as ONE document titled 'VSL No-Show Recovery Sequence', for people who booked a call and did NOT show. " + AGGRESSIVE + " 6-9 emails. Rebook WITHOUT shaming — missed-you + one-click rebook, cost-of-the-unsolved-problem carried by a real case study, proof stack, honest last-touch. CTA is REBOOK the call ([VSL LINK] / booking calendar). This is one of the two call-closers.",
    },
    {
      label: "Post-call follow-ups",
      blurb: "Took the call, didn't close: proof-heavy follow-ups every 3-8h that close the deal",
      request:
        "Write the VSL POST-CALL FOLLOW-UP sequence as ONE document titled 'VSL Post-Call Follow-Up Sequence', for prospects who TOOK the call but did NOT close. " + AGGRESSIVE + " 6-9 emails. Recap their exact situation and the offer, reframe each objection with proof, stack results, cost-of-inaction, honest final follow-up. CTA is close / rebook a closing call ([VSL LINK]). This plus No-Show Recovery are the two call-closers.",
    },
  ],
};

/** One-click prebuilt sequence buttons, shown for the client's funnel type. */
export function PrebuiltSequences({
  funnelType,
  job,
  clientId,
  invalidate,
}: {
  funnelType: "webinar" | "call" | "vsl";
  job: StageJob;
  clientId: number;
  invalidate: () => void;
}) {
  const generate = trpc.clients.generateStage.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Sequence queued. Your Mac worker will write it");
    },
    onError: (err) => toast.error(err.message),
  });
  const busy = job?.status === "queued" || job?.status === "running";
  const sequences = PREBUILT_SEQUENCES[funnelType];
  // One click writes EVERY sequence for this funnel in a single run: each lands
  // as its own card via the SPLIT markers.
  const batchRequest =
    `Write ALL ${sequences.length} of the email sequences below in ONE run. Output EACH sequence as its OWN document separated by a line containing exactly <!-- SPLIT --> so each files as its own card. Build every sequence to full quality, do not summarize or skip any.\n\n` +
    sequences.map((s, i) => `=== SEQUENCE ${i + 1}: ${s.label} ===\n${s.request}`).join("\n\n");

  return (
    <div className="space-y-2.5">
      <button
        disabled={busy || generate.isPending}
        onClick={() => generate.mutate({ clientId, stage: "more_emails", feedback: batchRequest })}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary/90 text-primary-foreground font-semibold text-xs py-2.5 hover:bg-primary transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        Generate all {sequences.length} sequences
      </button>
      <p className="text-[10px] text-muted-foreground text-center">or generate one at a time</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {sequences.map((s) => (
        <button
          key={s.label}
          disabled={busy || generate.isPending}
          onClick={() => generate.mutate({ clientId, stage: "more_emails", feedback: s.request })}
          className="rounded-lg border border-border/40 bg-card/20 p-3 text-left hover:border-primary/40 transition-colors disabled:opacity-50"
        >
          <div className="flex items-center gap-1.5 mb-1">
            {busy ? <Loader2 className="w-3 h-3 text-primary animate-spin" /> : <Plus className="w-3 h-3 text-primary" />}
            <span className="text-xs font-semibold text-foreground">{s.label}</span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">{s.blurb}</p>
        </button>
      ))}
      </div>
    </div>
  );
}

/** Short chip labels for the sequence sub-row. */
const SEQ_SHORT: Record<string, string> = {
  "Pre-webinar reminder": "Pre-webinar",
  "Post-webinar (attended)": "Post-webinar",
  "No-show / replay": "Replay",
  "Post-booking show-up": "Show-up",
  "No-show / re-engagement": "Re-engage",
  "Opted in, not booked": "Opt-in",
  "Booked, pre-call nurture": "Pre-call",
  "No-show recovery": "No-show",
  "Post-call follow-ups": "Follow-up",
};

/**
 * The whole email engine in ONE card: pick a Type. VSL or Webinar/Call reveals a
 * sequence sub-row (pick any); the other types write one-off emails with a count.
 * Audience and offer apply to everything. Fires one more_emails job that splits
 * into cards.
 */
export function EmailEngineCard({
  job,
  clientId,
  invalidate,
  avatars = [],
}: {
  job: StageJob;
  clientId: number;
  invalidate: () => void;
  avatars?: Array<{ name: string; hint?: string }>;
}) {
  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
      active
        ? "bg-primary/20 text-primary border border-primary/40"
        : "bg-card/60 text-muted-foreground border border-border/40 hover:text-foreground"
    }`;
  const TYPES: Array<{ key: string; label: string; seq?: "webinar" | "vsl"; campaign?: string }> = [
    { key: "vsl", label: "VSL", seq: "vsl" },
    { key: "webinar", label: "Webinar", seq: "webinar" },
    { key: "broadcast", label: "Broadcast", campaign: "a one-off BROADCAST / promo email" },
    { key: "nurture", label: "Nurture", campaign: "a community NURTURE email" },
    { key: "cash", label: "Cash", campaign: "a CASH INJECTION / flash-offer email" },
    { key: "news", label: "Newsletter", campaign: "a value NEWSLETTER email" },
    { key: "reengage", label: "Re-engage", campaign: "a RE-ENGAGEMENT email for a cold list" },
  ];
  const [typeKey, setTypeKey] = useState(TYPES[0].key);
  const type = TYPES.find((t) => t.key === typeKey)!;
  const seqList = type.seq ? PREBUILT_SEQUENCES[type.seq] : [];
  const [seqSel, setSeqSel] = useState<string[]>(() => (TYPES[0].seq ? PREBUILT_SEQUENCES[TYPES[0].seq].map((s) => s.label) : []));
  const [count, setCount] = useState(1);
  const [audience, setAudience] = useState<string[]>([]);
  const [offer, setOffer] = useState("");
  const [notes, setNotes] = useState("");

  const pickType = (key: string) => {
    setTypeKey(key);
    const t = TYPES.find((x) => x.key === key)!;
    setSeqSel(t.seq ? PREBUILT_SEQUENCES[t.seq].map((s) => s.label) : []);
  };

  const generate = trpc.clients.generateStage.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Queued. Your Mac worker will write it");
    },
    onError: (err) => toast.error(err.message),
  });
  const busy = job?.status === "queued" || job?.status === "running";

  const context = () => {
    let s = "";
    if (audience.length) {
      const picked = audience.map((n) => {
        const a = avatars.find((av) => av.name === n);
        return a?.hint ? `${a.name} (${a.hint})` : n;
      });
      s += ` AUDIENCE: write to ${picked.join(" + ")}.`;
    }
    const offerReq = OFFER_LADDER.find((o) => o.label === offer)?.request;
    if (offerReq) s += ` ${offerReq}`;
    if (notes.trim()) s += ` EXTRA DIRECTION: ${notes.trim()}`;
    return s;
  };

  const buildRequest = () => {
    if (type.seq) {
      const chosen = seqList.filter((s) => seqSel.includes(s.label));
      return (
        `Write ${chosen.length} email sequence(s) for this funnel in ONE run. Output EACH sequence as its OWN document separated by a line containing exactly <!-- SPLIT --> so each files as its own card. Build every one to full quality.${context()}\n\n` +
        chosen.map((s, i) => `=== SEQUENCE ${i + 1}: ${s.label} ===\n${s.request}`).join("\n\n")
      );
    }
    return `Write ${count} ${type.campaign}, swipe-file style and ConvertKit-ready, each as its OWN document separated by a line containing exactly <!-- SPLIT -->.${context()}`;
  };

  const canGo = type.seq ? seqSel.length > 0 : true;
  const genLabel = type.seq ? `Generate ${seqSel.length}` : `Generate ${count}`;

  if (busy) {
    return (
      <div className="flex items-center gap-2 py-1">
        <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
        <p className="text-[11px] text-muted-foreground">
          {job?.status === "queued" ? "Waiting for your Mac worker" : job?.progress || "Writing your emails..."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2.5">
        <p className="text-[11px] text-muted-foreground mb-1">Type</p>
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <button key={t.key} onClick={() => pickType(t.key)} className={chip(typeKey === t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {type.seq && (
        <div className="mb-2.5">
          <p className="text-[11px] text-muted-foreground mb-1">Sequences (pick any)</p>
          <div className="flex flex-wrap gap-1.5">
            {seqList.map((s) => (
              <button
                key={s.label}
                title={s.blurb}
                onClick={() => setSeqSel((prev) => (prev.includes(s.label) ? prev.filter((x) => x !== s.label) : [...prev, s.label]))}
                className={chip(seqSel.includes(s.label))}
              >
                {SEQ_SHORT[s.label] ?? s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!type.seq && (
        <div className="flex items-center gap-3 mb-2.5">
          <span className="text-[11px] text-muted-foreground w-10">Count</span>
          <input
            type="range"
            min={1}
            max={15}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="flex-1 h-1.5 accent-primary cursor-pointer"
          />
          <span className="w-8 text-center text-xs font-semibold text-foreground bg-card/60 rounded px-1.5 py-0.5 tabular-nums">{count}</span>
        </div>
      )}

      {avatars.length > 0 && (
        <div className="mb-2.5">
          <p className="text-[11px] text-muted-foreground mb-1">Audience</p>
          <div className="flex flex-wrap gap-1.5">
            {avatars.map((av) => (
              <button
                key={av.name}
                title={av.hint}
                onClick={() => setAudience((p) => (p.includes(av.name) ? p.filter((x) => x !== av.name) : [...p, av.name]))}
                className={chip(audience.includes(av.name))}
              >
                {av.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-2.5">
        <p className="text-[11px] text-muted-foreground mb-1">Offer</p>
        <div className="flex flex-wrap gap-1.5">
          {OFFER_LADDER.map((o) => (
            <button key={o.label} onClick={() => setOffer(offer === o.label ? "" : o.label)} className={chip(offer === o.label)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <Textarea
        placeholder="Optional: the occasion, a deadline, an asset to push, any extra direction..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="min-h-14 text-[11px] mb-2.5"
      />

      <Button
        size="sm"
        disabled={generate.isPending || !canGo}
        onClick={() => generate.mutate({ clientId, stage: "more_emails", feedback: buildRequest() })}
        className="bg-primary text-primary-foreground hover:bg-primary/90 h-7 text-xs"
      >
        {generate.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
        {genLabel}
      </Button>
    </div>
  );
}

/** One on-demand engine: compose a request, run it, review the output doc. */
export function EngineCard({
  engine,
  job,
  clientId,
  invalidate,
  avatars = [],
  refImages,
}: {
  engine: (typeof ENGINES)[number];
  job: StageJob;
  clientId: number;
  invalidate: () => void;
  /** Sub-avatars parsed from the approved ICP doc: name + who-they-are hint. */
  avatars?: Array<{ name: string; hint?: string }>;
  /** When set, the proof-image uploader renders inside Add additional info (statics engine). */
  refImages?: RefImageMeta[];
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
  // Tactical extras (style picker, add-ons, free-text) stay tucked away so the
  // default view is just the strategic choices. One click opens them.
  const [showMore, setShowMore] = useState(false);

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
    if (audience.length) {
      const picked = audience.map((n) => {
        const a = avatars.find((av) => av.name === n);
        return a?.hint ? `${a.name} (${a.hint})` : n;
      });
      req += ` AUDIENCE: ${picked.join(" + ")}.`;
    }
    const offerReq = OFFER_LADDER.find((o) => o.label === offer)?.request;
    if (offerReq) req += ` ${offerReq}`;
    for (const a of engine.addons ?? []) {
      if (addons.includes(a.label)) req += ` ${a.request}`;
    }
    return req;
  };

  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
      active
        ? "bg-primary/20 text-primary border border-primary/40"
        : "bg-card/60 text-muted-foreground border border-border/40 hover:text-foreground"
    }`;

  const selectorRow = (label: string, node: React.ReactNode) => (
    <div className="mb-2.5">
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5">{node}</div>
    </div>
  );

  return (
    <div>
      {engine.blurb && <p className="text-[11px] text-muted-foreground mb-2.5">{engine.blurb}</p>}

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
              max={Math.max(15, ...engine.counts)}
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
              "Audience",
              avatars.map((av) => (
                <button
                  key={av.name}
                  title={av.hint}
                  onClick={() =>
                    setAudience((prev) => (prev.includes(av.name) ? prev.filter((x) => x !== av.name) : [...prev, av.name]))
                  }
                  className={chip(audience.includes(av.name))}
                >
                  {av.name}
                </button>
              ))
            )}

          {engine.hasOffer &&
            selectorRow(
              "Offer",
              OFFER_LADDER.map((of) => (
                <button key={of.label} onClick={() => setOffer(offer === of.label ? "" : of.label)} className={chip(offer === of.label)}>
                  {of.label}
                </button>
              ))
            )}

          <>
              <button
                onClick={() => setShowMore((v) => !v)}
                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground mb-2.5"
              >
                {showMore ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Add additional info
                {!showMore && (styles.length > 0 || notes.trim() || addons.length > 0 || (refImages?.length ?? 0) > 0) && (
                  <span className="text-primary">· set</span>
                )}
              </button>
              {showMore && (
                <>
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

                  {refImages && (
                    <div className="mb-2.5">
                      <p className="text-[11px] font-medium text-muted-foreground mb-1.5">
                        Proof images (optional): client cutouts, approval screenshots, testimonials — composited into the renders instead of placeholders
                      </p>
                      <RefImagePanel clientId={clientId} images={refImages} invalidate={invalidate} />
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
                </>
              )}
          </>
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

/** The built-out HTML page a landing-page doc carries in a fenced ```html block. */
export function extractHtml(content: string): string | null {
  const m = content.match(/```html\s*([\s\S]*?)```/i);
  const html = m?.[1]?.trim();
  return html && /<(!doctype|html|section|div|body)/i.test(html) ? html : null;
}

/** The readable copy with the machine-facing html block removed. */
export function stripHtmlBlock(content: string): string {
  return content.replace(/```html[\s\S]*?```/gi, "").trim();
}

/** Live preview of a built landing page: desktop/mobile toggle, copy, download. */
export function HtmlPreview({ html, filename }: { html: string; filename: string }) {
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [copied, setCopied] = useState(false);

  const download = () => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "landing-page"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const copy = async () => {
    await navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-lg border border-border/50 bg-background/40 overflow-hidden">
      <div className="flex items-center gap-1.5 p-2 border-b border-border/40">
        <span className="text-[11px] font-semibold text-foreground mr-1">Built page</span>
        <button
          onClick={() => setView("desktop")}
          className={`px-2 py-0.5 rounded text-[10px] font-medium ${view === "desktop" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
        >
          Desktop
        </button>
        <button
          onClick={() => setView("mobile")}
          className={`px-2 py-0.5 rounded text-[10px] font-medium ${view === "mobile" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
        >
          Mobile
        </button>
        <span className="flex-1" />
        <button onClick={copy} className="px-2 py-0.5 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground">
          {copied ? "Copied" : "Copy HTML"}
        </button>
        <button onClick={download} className="px-2 py-0.5 rounded text-[10px] font-medium bg-primary/20 text-primary hover:bg-primary/30">
          Download .html
        </button>
      </div>
      <div className="bg-neutral-200 p-3 flex justify-center overflow-auto max-h-[32rem]">
        <iframe
          title={`preview-${filename}`}
          srcDoc={html}
          sandbox="allow-same-origin"
          className="bg-white border-0 rounded shadow-lg"
          style={view === "mobile" ? { width: 390, height: 760 } : { width: "100%", height: 640 }}
        />
      </div>
    </div>
  );
}

/** Kanban pipeline for deliverable docs: Draft -> Approved -> Posted. */
const BOARD_COLUMNS = [
  { id: "draft", label: "Drafts", tint: "bg-slate-500/[0.07] border-slate-500/25" },
  { id: "approved", label: "Approved", tint: "bg-emerald-500/[0.07] border-emerald-500/25" },
  { id: "posted", label: "Posted", tint: "bg-sky-500/[0.07] border-sky-500/25" },
] as const;

/** Split a markdown doc into its H1-H3 sections so each can be copied on its own. */
export function splitSections(md: string): Array<{ title: string; text: string; level: number }> {
  const out: Array<{ title: string; text: string; level: number }> = [];
  let cur: { title: string; text: string; level: number } | null = null;
  for (const ln of md.split("\n")) {
    const h = ln.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      if (cur) out.push(cur);
      cur = { title: h[2].replace(/[#*`]/g, "").trim(), text: ln + "\n", level: h[1].length };
    } else if (cur) {
      cur.text += ln + "\n";
    } else if (ln.trim()) {
      cur = { title: "Intro", text: ln + "\n", level: 2 };
    }
  }
  if (cur) out.push(cur);
  return out.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text);
}

/** Markdown -> HTML for clean copy / print / preview output. Handles links,
 *  a small inline-HTML allowlist (emails use <u> for underline), and groups
 *  consecutive lines into one paragraph (soft <br> breaks) so pasted email
 *  copy is tight, not one giant-gap block per line. */
function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) => {
    let t = esc(s)
      // markdown links [text](url) -> real anchors (CTA links in emails)
      .replace(/\[([^\]]+)\]\(([^)]*)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
    // Restore an allowlist of inline HTML the source may already contain
    // (markdown has no underline syntax, so emails ship literal <u> tags).
    t = t.replace(/&lt;(\/?)(u|b|i|strong|em|br)\s*\/?&gt;/gi, "<$1$2>");
    return t;
  };
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let inTable = false;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.join("<br>")}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  const closeTable = () => {
    if (inTable) {
      out.push("</tbody></table>");
      inTable = false;
    }
  };
  for (const ln of md.split("\n")) {
    const h = ln.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      flushPara();
      closeList();
      closeTable();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      continue;
    }
    if (/^\s*>\s?/.test(ln)) {
      flushPara();
      closeList();
      closeTable();
      out.push(`<blockquote>${inline(ln.replace(/^\s*>\s?/, ""))}</blockquote>`);
      continue;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(ln)) {
      flushPara();
      closeList();
      closeTable();
      out.push("<hr/>");
      continue;
    }
    const bullet = ln.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      flushPara();
      closeTable();
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    const num = ln.match(/^\s*\d+\.\s+(.+)$/);
    if (num) {
      flushPara();
      closeTable();
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${inline(num[1])}</li>`);
      continue;
    }
    const row = ln.match(/^\s*\|(.+)\|\s*$/);
    if (row) {
      flushPara();
      closeList();
      if (/^[\s|:-]+$/.test(row[1])) continue;
      if (!inTable) {
        out.push("<table><tbody>");
        inTable = true;
      }
      out.push("<tr>" + row[1].split("|").map((c) => `<td>${inline(c.trim())}</td>`).join("") + "</tr>");
      continue;
    }
    if (!ln.trim()) {
      flushPara();
      closeList();
      closeTable();
      continue;
    }
    // Normal text: accumulate consecutive lines into ONE paragraph.
    closeList();
    closeTable();
    para.push(inline(ln));
  }
  flushPara();
  closeList();
  closeTable();
  return out.join("\n");
}

/**
 * Copy markdown to the clipboard as BOTH rich HTML and plain text. Pasting into
 * a rich editor (ConvertKit, Gmail, Docs) renders the formatting; pasting into a
 * plain field falls back to the markdown. This is what makes the Copy button
 * behave like a manual mouse-selection copy instead of dumping raw markdown.
 */
async function copyRich(md: string, links: Record<string, string> = {}): Promise<void> {
  const clean = applyLinks(md.replace(/```html[\s\S]*?```/gi, "").trim(), links);
  // Token guard: copy still succeeds, but unfilled links never sneak into a
  // live client email silently — the exact tokens get named in a warning.
  const leftover = Array.from(new Set(clean.match(/\[[A-Z][A-Z0-9 ./'&-]{2,44}\]/g) ?? [])).filter(isReusableToken);
  if (leftover.length) {
    toast.warning(
      `Copied, but ${leftover.length} unfilled link${leftover.length > 1 ? "s" : ""} remain${leftover.length > 1 ? "" : "s"}: ${leftover.slice(0, 3).join(", ")}${leftover.length > 3 ? "…" : ""} — set them in Client facts & links`
    );
  }
  const html = mdToHtml(clean);
  try {
    if (navigator.clipboard && typeof window !== "undefined" && "ClipboardItem" in window) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([clean], { type: "text/plain" }),
        }),
      ]);
      return;
    }
  } catch {
    /* fall through to plain-text copy */
  }
  await navigator.clipboard.writeText(clean);
}

/** Open a clean print window for a section so the operator can Save as PDF. */
function printPdf(title: string, md: string) {
  const w = window.open("", "_blank", "width=840,height=1000");
  if (!w) return;
  const css =
    "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;max-width:720px;margin:36px auto;padding:0 28px;line-height:1.55}" +
    "h1{font-size:24px;margin:0 0 12px}h2{font-size:19px;margin:22px 0 8px}h3{font-size:16px;margin:18px 0 6px}" +
    "blockquote{border-left:3px solid #3f6fff;margin:12px 0;padding:6px 14px;color:#222;background:#f4f7ff;border-radius:4px}" +
    "table{border-collapse:collapse;width:100%;margin:12px 0}td{border:1px solid #ddd;padding:7px 10px;font-size:14px}" +
    "ul,ol{margin:8px 0 8px 2px;padding-left:20px}li{margin:4px 0}hr{border:none;border-top:1px solid #e2e2e2;margin:18px 0}" +
    "code{background:#f0f0f0;padding:1px 5px;border-radius:3px;font-size:13px}p{margin:8px 0}strong{font-weight:700}" +
    "@media print{body{margin:0 auto}}";
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/[<>]/g, "")}</title><style>${css}</style></head><body>${mdToHtml(md)}</body></html>`
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}

/** One editable slot detected in a funnel-page code block. */
interface TemplateField {
  key: string;
  kind: "wcfg" | "token";
  value: string;
  /** The template's own inline comment for this key, as the field hint. */
  hint?: string;
  /** Original literal was an unquoted number. */
  numeric?: boolean;
}

/** Pull the editable slots out of a page's code: WCFG keys + [TOKEN]s. */
export function parseTemplateFields(html: string): TemplateField[] {
  const fields: TemplateField[] = [];
  const seen = new Set<string>();
  const wcfg = html.match(/window\.WCFG\s*=\s*\{([\s\S]*?)\n\};/);
  if (wcfg) {
    const re = /(\w+)\s*:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|(-?\d+))\s*,?[ \t]*(?:\/\*\s*([\s\S]*?)\s*\*\/)?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(wcfg[1]))) {
      const [, key, sq, dq, num, comment] = m;
      if (seen.has(key)) continue;
      seen.add(key);
      fields.push({
        key,
        kind: "wcfg",
        value: num ?? sq ?? dq ?? "",
        numeric: num !== undefined,
        hint: comment?.replace(/\s+/g, " ").slice(0, 120),
      });
    }
  }
  for (const tok of Array.from(new Set(html.match(/\[[A-Z][A-Z0-9 ./'&-]{2,44}\]/g) ?? []))) {
    fields.push({ key: tok, kind: "token", value: "" });
  }
  return fields;
}

/** Apply the operator's fills: WCFG values swapped in place, tokens replaced. */
export function applyTemplateFields(html: string, fields: TemplateField[], vals: Record<string, string>): string {
  let out = html;
  const wcfg = out.match(/window\.WCFG\s*=\s*\{[\s\S]*?\n\};/);
  if (wcfg) {
    let block = wcfg[0];
    for (const f of fields) {
      if (f.kind !== "wcfg") continue;
      const v = vals[f.key];
      if (v === undefined || v === f.value) continue;
      const literal = f.numeric && /^-?\d+$/.test(v.trim()) ? v.trim() : `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
      block = block.replace(new RegExp(`(\\b${f.key}\\s*:\\s*)(?:'(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|-?\\d+)`), `$1${literal}`);
    }
    out = out.replace(wcfg[0], block);
  }
  for (const f of fields) {
    if (f.kind !== "token") continue;
    const v = (vals[f.key] ?? "").trim();
    if (v) out = out.split(f.key).join(v);
  }
  return out;
}

/**
 * Fill-the-template panel: every editable slot in the page code (the WCFG
 * config block, bracket tokens) as a plain form. The operator pastes video
 * links and images HERE and copies GHL-ready code — never edits code by hand.
 */
function TemplateFiller({
  html,
  filename,
}: {
  html: string;
  filename: string;
}) {
  const links = useContext(LinksContext);
  const fields = useMemo(() => parseTemplateFields(html), [html]);
  // Saved client links prefill matching [TOKEN] fields automatically.
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of fields) v[f.key] = f.kind === "token" ? (links[f.key] ?? "") : f.value;
    return v;
  });
  const [open, setOpen] = useState(false);
  const filled = useMemo(() => applyTemplateFields(html, fields, vals), [html, fields, vals]);
  const filledCount = fields.filter((f) => (vals[f.key] ?? "").trim() && (vals[f.key] ?? "") !== (f.kind === "wcfg" ? "" : f.key)).length;

  if (!fields.length) return <HtmlPreview html={html} filename={filename} />;
  return (
    <div className="space-y-2">
      <HtmlPreview html={filled} filename={filename} />
      <div className="rounded-lg border border-border/50 bg-background/40 p-3">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 w-full text-left">
          {open ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
          <span className="text-xs font-semibold text-foreground">Fill the template</span>
          <span className="text-[10px] text-muted-foreground">
            · paste videos, images, and links here, then copy GHL-ready code · {filledCount}/{fields.length} set
          </span>
        </button>
        {open && (
          <div className="mt-3 space-y-2">
            {fields.map((f) => (
              <div key={f.key} className="flex items-start gap-2">
                <span className="w-40 flex-shrink-0 text-[11px] font-mono text-muted-foreground truncate pt-1.5" title={f.hint || f.key}>
                  {f.key}
                </span>
                <div className="flex-1 min-w-0">
                  <input
                    value={vals[f.key] ?? ""}
                    onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.hint || (f.kind === "token" ? "Paste the URL or value..." : "")}
                    className="w-full rounded-lg border border-border/50 bg-background/50 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(filled);
                  const leftoverTokens = Array.from(new Set(filled.match(/\[[A-Z][A-Z0-9 ./'&-]{2,44}\]/g) ?? []));
                  const emptyFields = fields.filter((f) => !(vals[f.key] ?? "").trim()).length;
                  if (leftoverTokens.length || emptyFields) {
                    toast.warning(
                      `Code copied, but ${[
                        leftoverTokens.length ? `${leftoverTokens.length} unfilled token${leftoverTokens.length > 1 ? "s" : ""} (${leftoverTokens.slice(0, 3).join(", ")}${leftoverTokens.length > 3 ? "…" : ""})` : "",
                        emptyFields ? `${emptyFields} empty field${emptyFields > 1 ? "s" : ""}` : "",
                      ]
                        .filter(Boolean)
                        .join(" and ")} remain — fill them before the page goes live`
                    );
                  } else {
                    toast.success("Filled code copied — paste it into a GHL custom-code block");
                  }
                }}
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-7 text-xs"
              >
                <Copy className="w-3 h-3 mr-1.5" />
                Copy GHL-ready code
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Shared read view for ANY document: renders the HTML preview if present, then
 * the doc section by section, with a per-section Copy and PDF button that appear
 * ONLY on sections with real body content (never on bare headings/dividers).
 */
export function DocSections({ content, title }: { content: string; title: string }) {
  const html = extractHtml(content);
  const sections = useMemo(() => splitSections(stripHtmlBlock(content)), [content]);
  return (
    <div className="space-y-3">
      {html && <TemplateFiller html={html} filename={title} />}
      <div className="max-h-96 overflow-y-auto rounded-lg bg-card/40 p-3 space-y-4">
        {sections.map((s, i) => {
          const body = s.text.replace(/^#{1,3}\s+.+\n?/, "").trim();
          return (
            <div key={i} className={s.level >= 3 ? "pl-3" : ""}>
              <div className="flex items-center gap-2 mb-1 border-b border-border/25 pb-1">
                <h4
                  className={`flex-1 min-w-0 font-semibold text-foreground ${
                    s.level <= 1 ? "text-sm" : s.level === 2 ? "text-[13px]" : "text-xs text-foreground/80"
                  }`}
                >
                  {s.title}
                </h4>
                {body && (
                  <>
                    <button
                      onClick={() => printPdf(s.title, s.text)}
                      className="text-[10px] font-medium text-muted-foreground hover:text-foreground flex-shrink-0"
                      title="Open a print view to save this section as a PDF"
                    >
                      PDF
                    </button>
                    <CopyButton text={body} label="" className="opacity-60 hover:opacity-100 flex-shrink-0" />
                  </>
                )}
              </div>
              {body && <MarkdownDoc content={body} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DocBoard({
  docs,
  invalidate,
  clientId,
  docType,
  accent = "primary",
  recordable = false,
}: {
  docs: ClientDoc[];
  invalidate: () => void;
  /** Enables the "Write your own" draft composer. */
  clientId?: number;
  docType?: string;
  accent?: string;
  /** Cards get a "To recording" action: one click puts the script on the client's recording list. */
  recordable?: boolean;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [aiId, setAiId] = useState<number | null>(null);
  const [aiMsg, setAiMsg] = useState("");
  const [composing, setComposing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const aiEdit = trpc.clients.aiEditDocument.useMutation({
    onSuccess: () => {
      invalidate();
      setAiId(null);
      setAiMsg("");
      toast.success("Queued on your Mac worker. This card updates shortly");
    },
    onError: (err) => toast.error(err.message),
  });

  const setStatus = trpc.clients.setDocumentStatus.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err.message),
  });
  const sendToRecording = trpc.clients.sendToRecording.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("On the client's recording list");
    },
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
                        {recordable && (
                          <button
                            disabled={sendToRecording.isPending}
                            onClick={() => sendToRecording.mutate({ docId: doc.id })}
                            className="h-5 px-1.5 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground"
                            title="Put this script on the client's recording list"
                          >
                            To recording
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setAiId(doc.id);
                            setEditing(null);
                            setExpanded(doc.id);
                          }}
                          className="h-5 px-1.5 rounded text-[10px] font-medium text-primary hover:text-primary/80 flex items-center gap-1"
                        >
                          <Sparkles className="w-2.5 h-2.5" />
                          AI
                        </button>
                        <CopyButton text={doc.content} className="px-1.5" />
                        <button
                          onClick={() => {
                            setEditing(doc.id);
                            setEditContent(doc.content);
                            setAiId(null);
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
                          {aiId === doc.id ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-primary" />
                                <span className="text-xs font-semibold text-foreground">Tell the AI what to change in this document</span>
                              </div>
                              <Textarea
                                value={aiMsg}
                                onChange={(e) => setAiMsg(e.target.value)}
                                placeholder="e.g. Regenerate this sequence to match the newer, better version: aggressive cadence, case-study heavy, [paste any specifics]."
                                className="min-h-24 text-xs"
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  disabled={aiEdit.isPending || !aiMsg.trim()}
                                  onClick={() => aiEdit.mutate({ id: doc.id, feedback: aiMsg.trim() })}
                                  className="bg-primary text-primary-foreground hover:bg-primary/90 h-6 text-[11px]"
                                >
                                  {aiEdit.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                                  {aiEdit.isPending ? "Queueing..." : "Rewrite this doc"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setAiId(null);
                                    setAiMsg("");
                                  }}
                                  className="h-6 text-[11px]"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : editing === doc.id ? (
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
                            <DocSections content={doc.content} title={doc.title} />
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
