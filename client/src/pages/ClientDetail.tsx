import { useCallback, useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AppShell } from "@/components/AppShell";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  FileText,
  FileUp,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { MarkdownDoc } from "@/components/MarkdownDoc";
import {
  AssetGallery,
  type ClientAssetMeta,
  type ClientDoc,
  type StageId,
  type StageJob,
} from "@/components/engines";

const DOC_TYPES = [
  { id: "voice_transcript", label: "Voice transcript" },
  { id: "competitors", label: "Competitors" },
  { id: "intake", label: "Intake form" },
  { id: "other", label: "Other" },
] as const;

/**
 * Worker-run pipeline stages, in mother-skill order. docTypes mirror the
 * server's stage registry (funnel docTypes are branch-independent).
 */
const WORKER_STAGES: Array<{
  id: StageId;
  label: string;
  blurb: string;
  docTypes: string[];
  runningNote: string;
}> = [
  {
    id: "foundation",
    label: "Foundation Documents",
    blurb: "ICP, offers, positioning, course outline. Built from onboarding + research",
    docTypes: ["icp_snapshot", "offers", "brand_positioning", "course_outline"],
    runningNote: "Claude Code is running the mother skill. This takes a few minutes",
  },
  {
    id: "skool",
    label: "Skool Setup",
    blurb: "Free + paid community copy: names, About pages, categories, pinned posts",
    docTypes: ["skool_free_community", "skool_paid_community"],
    runningNote: "Building both communities from the approved foundation docs",
  },
  {
    id: "emails",
    label: "Community Emails",
    blurb: "The 14-day free-community nurture sequence and its matching SMS set. Everything else is on-demand in the studio",
    docTypes: ["email_sequence_14day", "sms_set"],
    runningNote: "Writing the 14-day community nurture sequence and the SMS set in the swipe-file style",
  },
  {
    id: "ads",
    label: "Community Ads",
    blurb: "15 rendered static ads + 10 video ad scripts, all aimed at getting cold traffic into the free Skool community. Review each ad below",
    docTypes: ["ad_statics", "ad_video_scripts", "ad_statics_extra", "ad_scripts_extra"],
    runningNote: "Building 15 statics through the render pipeline with visual QA, then writing the 10 video scripts",
  },
];




/** Link an existing report to this client instead of running fresh research. */
function LinkReportControl({
  clientId,
  linkedReportId,
  invalidate,
}: {
  clientId: number;
  linkedReportId: number | null;
  invalidate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const reports = trpc.clients.availableReports.useQuery(undefined, { enabled: open });
  const link = trpc.clients.linkReport.useMutation({
    onSuccess: () => {
      invalidate();
      setOpen(false);
      toast.success("Report linked. Research step is done");
    },
    onError: (err) => toast.error(err.message),
  });
  const unlink = trpc.clients.linkReport.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Report unlinked");
    },
    onError: (err) => toast.error(err.message),
  });

  if (linkedReportId != null) {
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled={unlink.isPending}
        onClick={() => unlink.mutate({ clientId, reportId: null })}
        className="h-8 text-xs text-muted-foreground hover:text-foreground"
      >
        {unlink.isPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : null}
        Unlink report
      </Button>
    );
  }

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        className="h-8 text-xs"
      >
        <FileText className="w-3 h-3 mr-1.5" />
        Link a report
      </Button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-72 rounded-lg border border-border/60 bg-background shadow-xl p-2 max-h-72 overflow-y-auto">
          {reports.isLoading ? (
            <div className="flex items-center gap-2 p-2 text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="text-[11px]">Loading your reports...</span>
            </div>
          ) : !reports.data?.length ? (
            <p className="p-2 text-[11px] text-muted-foreground">No saved reports yet. Run research instead.</p>
          ) : (
            reports.data.map((r) => (
              <button
                key={r.id}
                disabled={link.isPending}
                onClick={() => link.mutate({ clientId, reportId: r.id })}
                className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-card/80 text-left"
              >
                <FileText className="w-3 h-3 text-primary flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-medium text-foreground truncate">{r.name}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Numbered circle for each pipeline stage: done, active, or upcoming. */
function StageMarker({ n, state }: { n: number; state: "done" | "active" | "upcoming" }) {
  if (state === "done") {
    return (
      <div className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
        <Check className="w-3.5 h-3.5 text-emerald-500" />
      </div>
    );
  }
  return (
    <div
      className={`w-7 h-7 rounded-full border flex items-center justify-center flex-shrink-0 text-xs font-semibold ${
        state === "active"
          ? "bg-primary/10 border-primary/30 text-primary"
          : "bg-card/30 border-border/50 text-muted-foreground"
      }`}
    >
      {n}
    </div>
  );
}

/** One worker-run pipeline stage: generate, wait, review with editable docs, approve or reject. */
function WorkerStageCard({
  n,
  stage,
  job,
  docs,
  assets,
  unlocked,
  unlockHint,
  clientId,
  invalidate,
}: {
  n: number;
  stage: (typeof WORKER_STAGES)[number];
  job: StageJob;
  docs: ClientDoc[];
  assets: ClientAssetMeta[];
  unlocked: boolean;
  unlockHint: string;
  clientId: number;
  invalidate: () => void;
}) {
  const [expandedDoc, setExpandedDoc] = useState<number | null>(null);
  const [editingDoc, setEditingDoc] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState("");

  const status = job?.status ?? null;
  const done = status === "approved";

  const updateDoc = trpc.clients.updateDocument.useMutation({
    onSuccess: () => {
      invalidate();
      setEditingDoc(null);
      toast.success("Saved");
    },
    onError: (err) => toast.error(err.message),
  });
  const generate = trpc.clients.generateStage.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(`${stage.label} queued. Your Mac worker will pick it up`);
    },
    onError: (err) => toast.error(err.message),
  });
  const review = trpc.clients.reviewStage.useMutation({
    onSuccess: ({ status: result }) => {
      invalidate();
      setRejecting(false);
      setRejectFeedback("");
      toast.success(result === "approved" ? `${stage.label} approved` : "Changes requested, job requeued");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div
      className={`rounded-xl border p-5 ${
        unlocked ? "border-border/50 bg-card/30" : "border-border/30 bg-card/10 opacity-60"
      }`}
    >
      <div className="flex items-center gap-3">
        <StageMarker n={n} state={done ? "done" : unlocked ? "active" : "upcoming"} />
        <div className="flex-1">
          <h2 className={`text-sm font-semibold ${unlocked ? "text-foreground" : "text-muted-foreground"}`}>
            {stage.label}
          </h2>
          <p className="text-xs text-muted-foreground">{unlocked ? stage.blurb : unlockHint}</p>
        </div>

        {unlocked && (!status || status === "failed") && (
          <Button
            size="sm"
            disabled={generate.isPending}
            onClick={() => generate.mutate({ clientId, stage: stage.id })}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs"
          >
            {generate.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
            Generate
          </Button>
        )}
        {status === "approved" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={generate.isPending}
            onClick={() => {
              if (confirm(`Regenerate ${stage.label}? Current versions get replaced when the new run completes.`)) {
                generate.mutate({ clientId, stage: stage.id });
              }
            }}
            className="text-xs text-muted-foreground hover:text-foreground h-8"
          >
            <RefreshCw className="w-3 h-3 mr-1.5" />
            Regenerate
          </Button>
        )}
      </div>

      {status === "failed" && job?.error && (
        <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
          <p className="text-xs text-destructive">Last run failed: {job.error}</p>
        </div>
      )}

      {(status === "queued" || status === "running") && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-border/50 bg-background/40 p-4">
          <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-foreground">
              {status === "queued" ? "Waiting for your Mac" : `Building ${stage.label.toLowerCase()}`}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {status === "queued"
                ? "Make sure the worker is running: npm run worker"
                : job?.progress || stage.runningNote}
            </p>
          </div>
        </div>
      )}

      {(status === "review" || status === "approved") && assets.length > 0 && (
        <AssetGallery
          assets={assets}
          clientId={clientId}
          stageId={stage.id}
          invalidate={invalidate}
          canRegenerate={status === "review" || status === "approved"}
        />
      )}

      {(status === "review" || status === "approved") && docs.length > 0 && (
        <div className="mt-4 space-y-2">
          {docs.map((doc) => (
            <div key={doc.id} className="rounded-lg border border-border/50 bg-card/30">
              <div className="group flex items-center gap-3 p-3">
                <FileText className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <button
                  onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="text-xs font-medium text-foreground truncate">{doc.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {doc.content.length.toLocaleString()} chars ·{" "}
                    {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}
                  </p>
                </button>
                <button
                  onClick={() => {
                    setEditingDoc(doc.id);
                    setEditContent(doc.content);
                    setExpandedDoc(doc.id);
                  }}
                  className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-card/80 text-muted-foreground hover:text-foreground transition-all"
                  title="Edit"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                {expandedDoc === doc.id ? (
                  <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>
              {expandedDoc === doc.id && (
                <div className="px-3 pb-3">
                  {editingDoc === doc.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="min-h-64 text-xs font-mono"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={updateDoc.isPending}
                          onClick={() => updateDoc.mutate({ id: doc.id, content: editContent })}
                          className="bg-primary text-primary-foreground hover:bg-primary/90 h-7 text-xs"
                        >
                          {updateDoc.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingDoc(null)}
                          className="h-7 text-xs"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="max-h-[32rem] overflow-y-auto rounded-lg bg-background/40 p-4">
                      <MarkdownDoc content={doc.content} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {status === "review" && (
            <div className="pt-2">
              {!rejecting ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={review.isPending}
                    onClick={() => review.mutate({ clientId, stage: stage.id, action: "approve" })}
                    className="bg-emerald-600 text-white hover:bg-emerald-600/90 h-8 text-xs"
                  >
                    {review.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                    <Check className="w-3 h-3 mr-1.5" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRejecting(true)}
                    className="text-xs text-muted-foreground hover:text-foreground h-8"
                  >
                    <X className="w-3 h-3 mr-1.5" />
                    Request changes
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    autoFocus
                    placeholder="What should change? Be specific. This goes straight to the worker."
                    value={rejectFeedback}
                    onChange={(e) => setRejectFeedback(e.target.value)}
                    className="min-h-20 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={review.isPending || !rejectFeedback.trim()}
                      onClick={() =>
                        review.mutate({ clientId, stage: stage.id, action: "reject", feedback: rejectFeedback })
                      }
                      className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs"
                    >
                      {review.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                      Send back for revision
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRejecting(false)} className="h-8 text-xs">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ClientDetail() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [pasting, setPasting] = useState(false);
  const [paste, setPaste] = useState({ docType: "voice_transcript" as string, title: "", content: "" });
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<number | null>(null);

  const { data, isLoading } = trpc.clients.get.useQuery(
    { id: clientId },
    { enabled: Number.isInteger(clientId) && clientId > 0 }
  );

  const hasActiveJob = data
    ? Object.values(data.jobs).some((j) => j?.status === "queued" || j?.status === "running")
    : false;

  // Poll while the Mac worker has any stage's job
  useEffect(() => {
    if (!hasActiveJob) return;
    const t = setInterval(() => utils.clients.get.invalidate({ id: clientId }), 5000);
    return () => clearInterval(t);
  }, [hasActiveJob, clientId, utils]);

  const invalidate = () => utils.clients.get.invalidate({ id: clientId });

  const addText = trpc.clients.addTextDocument.useMutation({
    onSuccess: () => {
      invalidate();
      setPasting(false);
      setPaste({ docType: "voice_transcript", title: "", content: "" });
      toast.success("Document added");
    },
    onError: (err) => toast.error(err.message),
  });
  const addPdf = trpc.clients.addPdfDocument.useMutation({
    onSuccess: ({ chars }) => {
      invalidate();
      toast.success(`PDF added: ${chars.toLocaleString()} characters extracted`);
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setUploading(false),
  });
  const deleteDoc = trpc.clients.deleteDocument.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err.message),
  });
  const deleteClient = trpc.clients.delete.useMutation({
    onSuccess: () => navigate("/clients"),
    onError: (err) => toast.error(err.message),
  });

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      const file = files[0];
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        toast.error("Only PDF files. Paste anything else as text");
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error("PDF too large (20MB max)");
        return;
      }
      setUploading(true);
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        addPdf.mutate({ clientId, docType: "voice_transcript", filename: file.name, base64 });
      };
      reader.onerror = () => {
        setUploading(false);
        toast.error("Could not read that file");
      };
      reader.readAsDataURL(file);
    },
    [addPdf, clientId]
  );

  if (isLoading || !data) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      </AppShell>
    );
  }

  const { client, documents, searches, jobs } = data;
  const onboardingDocs = documents.filter((d) => d.kind === "onboarding");
  const completeSearches = searches.filter((s) => s.status === "complete");

  const onboardingDone = onboardingDocs.length > 0;
  const linkedReportId = data.linkedReportId ?? null;
  const researchDone = completeSearches.length > 0 || linkedReportId != null;

  /** Stage docs in contract order, from foundation or deliverable kinds. */
  const stageDocs = (docTypes: string[]) =>
    docTypes
      .map((t) => documents.find((d) => (d.kind === "foundation" || d.kind === "deliverable") && d.docType === t))
      .filter((d): d is NonNullable<typeof d> => !!d);

  const stageState = (done: boolean, prevDone: boolean): "done" | "active" | "upcoming" =>
    done ? "done" : prevDone ? "active" : "upcoming";

  return (
    <AppShell>
      <div className="p-6 lg:p-10 max-w-none">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate("/clients")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Clients
          </button>
        </div>

        <div className="flex items-start justify-between mb-10">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight mb-1">{client.name}</h1>
            <p className="text-sm text-muted-foreground">
              {client.niche} · {client.funnelType} funnel
              {client.pricePoint ? ` · ${client.pricePoint}` : ""}
            </p>
          </div>
          <button
            onClick={() => {
              if (confirm(`Delete ${client.name} and everything inside? This cannot be undone.`)) {
                deleteClient.mutate({ id: clientId });
              }
            }}
            className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
            title="Delete client"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* ─── Stage 1: Onboarding ─── */}
          <div className="rounded-xl border border-border/50 bg-card/30 p-5">
            <div className="flex items-center gap-3 mb-1">
              <StageMarker n={1} state={onboardingDone ? "done" : "active"} />
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-foreground">Onboarding</h2>
                <p className="text-xs text-muted-foreground">
                  Voice transcript, competitors, intake answers
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => {
                      handleFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <span className="inline-flex items-center px-2.5 py-1.5 rounded-lg border border-border/50 bg-card/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all">
                    {uploading ? (
                      <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    ) : (
                      <FileUp className="w-3 h-3 mr-1.5" />
                    )}
                    PDF
                  </span>
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPasting((v) => !v)}
                  className="text-xs text-primary hover:text-primary/80 hover:bg-primary/10 h-8"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Paste text
                </Button>
              </div>
            </div>

            {/* Drop zone appears only while nothing uploaded yet, keeps the page quiet after */}
            {onboardingDocs.length === 0 && !pasting && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFiles(e.dataTransfer.files);
                }}
                className={`mt-4 rounded-lg border border-dashed p-8 text-center transition-all ${
                  dragOver ? "border-primary/50 bg-primary/5" : "border-border/50"
                }`}
              >
                <p className="text-xs text-muted-foreground">
                  Drop the onboarding PDF here, or use the buttons above
                </p>
              </div>
            )}

            {pasting && (
              <div className="mt-4 space-y-3">
                <div className="flex gap-2">
                  {DOC_TYPES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setPaste((p) => ({ ...p, docType: t.id }))}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        paste.docType === t.id
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border/50 bg-card/30 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <Input
                  placeholder="Title (e.g. Onboarding call transcript)"
                  value={paste.title}
                  onChange={(e) => setPaste((p) => ({ ...p, title: e.target.value }))}
                />
                <Textarea
                  placeholder="Paste the content..."
                  value={paste.content}
                  onChange={(e) => setPaste((p) => ({ ...p, content: e.target.value }))}
                  className="min-h-32 text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={addText.isPending}
                    onClick={() => {
                      if (!paste.title.trim() || !paste.content.trim()) {
                        toast.error("Title and content are required");
                        return;
                      }
                      addText.mutate({
                        clientId,
                        docType: paste.docType as "voice_transcript" | "competitors" | "intake" | "other",
                        title: paste.title,
                        content: paste.content,
                      });
                    }}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {addText.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                    Add
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPasting(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {onboardingDocs.length > 0 && (
              <div className="mt-4 space-y-2">
                {onboardingDocs.map((doc) => (
                  <div key={doc.id} className="rounded-lg border border-border/50 bg-card/30">
                    <div className="group flex items-center gap-3 p-3">
                      <FileText className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      <button
                        onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <p className="text-xs font-medium text-foreground truncate">{doc.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {DOC_TYPES.find((t) => t.id === doc.docType)?.label ?? doc.docType} ·{" "}
                          {doc.content.length.toLocaleString()} chars
                        </p>
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Remove this document?")) deleteDoc.mutate({ id: doc.id });
                        }}
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      {expandedDoc === doc.id ? (
                        <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </div>
                    {expandedDoc === doc.id && (
                      <div className="px-3 pb-3">
                        <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap max-h-64 overflow-y-auto rounded-lg bg-background/40 p-3">
                          {doc.content.slice(0, 20000)}
                          {doc.content.length > 20000 ? "\n..." : ""}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── Stage 2: Research ─── */}
          <div className="rounded-xl border border-border/50 bg-card/30 p-5">
            <div className="flex items-center gap-3">
              <StageMarker n={2} state={stageState(researchDone, onboardingDone)} />
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-foreground">Voice Mining Research</h2>
                <p className="text-xs text-muted-foreground">
                  Mine the market's language, or link a report you already have
                </p>
              </div>
              <div className="flex items-center gap-2">
                <LinkReportControl clientId={clientId} linkedReportId={linkedReportId} invalidate={() => utils.clients.get.invalidate({ id: clientId })} />
                <Button
                  size="sm"
                  onClick={() => navigate(`/search/new?client=${clientId}`)}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs"
                >
                  <Search className="w-3 h-3 mr-1.5" />
                  Run Research
                </Button>
              </div>
            </div>

            {linkedReportId != null && (
              <button
                onClick={() => navigate(`/report/${linkedReportId}?client=${clientId}`)}
                className="mt-4 w-full flex items-center gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] hover:border-emerald-500/50 transition-all text-left"
              >
                <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span className="flex-1 text-xs font-medium text-foreground">Linked an existing report — research step complete</span>
                <span className="text-[11px] text-emerald-500">Open →</span>
              </button>
            )}

            {searches.length > 0 && (
              <div className="mt-4 space-y-2">
                {searches.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/search/${s.id}`)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/30 hover:border-border/70 transition-all text-left"
                  >
                    <Search className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{s.keyword}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${
                        s.status === "complete"
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : s.status === "failed"
                            ? "bg-destructive/10 text-destructive border-destructive/20"
                            : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                      }`}
                    >
                      {s.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ─── Stages 3-6: worker pipeline (foundation, skool, emails, ads) ─── */}
          {WORKER_STAGES.map((stage, i) => {
            const jobsByStage = jobs as Record<string, StageJob>;
            const prevStage = i > 0 ? WORKER_STAGES[i - 1] : null;
            const unlocked = prevStage
              ? jobsByStage[prevStage.id]?.status === "approved"
              : onboardingDone;
            const unlockHint = prevStage
              ? `Approve ${prevStage.label} first`
              : "Add onboarding material first";
            return (
              <WorkerStageCard
                key={stage.id}
                n={i + 3}
                stage={stage}
                job={jobsByStage[stage.id] ?? null}
                docs={stageDocs(stage.docTypes)}
                assets={(data?.assets ?? []).filter((a) => stage.docTypes.includes(a.docType))}
                unlocked={unlocked}
                unlockHint={unlockHint}
                clientId={clientId}
                invalidate={invalidate}
              />
            );
          })}

          {jobs.ads?.status === "approved" && (
            <div className="rounded-xl border border-primary/40 bg-primary/10 p-5 flex items-center gap-4">
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-foreground">Client Studio</h2>
                <p className="text-xs text-muted-foreground">
                  Pipeline approved. Open the studio: ad engine, short-form + YouTube content, emails, Skool posts, competitor intel
                </p>
              </div>
              <Button
                onClick={() => navigate(`/clients/${clientId}/studio`)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-9"
              >
                Open Studio →
              </Button>
            </div>
          )}

        </div>
      </div>
    </AppShell>
  );
}
