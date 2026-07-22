import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { MarkdownDoc } from "@/components/MarkdownDoc";
import { CopyButton, stripHtmlBlock } from "@/components/engines";
import { Check, ChevronDown, ChevronUp, Circle, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * The client's recording to-do list, keyed by the recording token. Used by
 * the public /record/:token page AND the portal's To-Do tab. The list IS the
 * "To record" pipeline stage: ticking a video off (or pasting its link)
 * moves the card to In editing everywhere at once.
 */

/** Section titles of a multi-part script doc (each section = one video). */
export function docSections(content: string): string[] {
  const clean = stripHtmlBlock(content);
  for (const level of ["##", "###"]) {
    const re = new RegExp(`^${level}\\s+(.+)$`, "gm");
    const titles = Array.from(clean.matchAll(re)).map((m) => m[1].replace(/\*+/g, "").trim().slice(0, 280));
    if (titles.length >= 2) return titles;
  }
  return [];
}

export function RecordingChecklist({
  token,
  pipelineLink,
}: {
  token: string;
  /** Portal-only: maps a doc's type to its pipeline tab ("Short-Form →"). */
  pipelineLink?: (docType: string) => { label: string; go: () => void } | null;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.recording.get.useQuery({ token }, { enabled: !!token });
  const [open, setOpen] = useState<number | null>(null);

  // Ticks advance the doc's pipeline card too — refresh the portal's view of
  // it when the checklist is embedded there (no-op on the public /record page).
  const refresh = () => {
    utils.recording.get.invalidate({ token });
    utils.portal.home.invalidate();
  };
  const mark = trpc.recording.markRecorded.useMutation({
    onSuccess: (_d, vars) => {
      refresh();
      if (vars.recorded) toast.success("Recorded. It moved to In editing for your coach.");
    },
    onError: (err) => toast.error(err.message),
  });
  const toggleSection = trpc.recording.toggleSection.useMutation({
    onSuccess: refresh,
    onError: (err) => toast.error(err.message),
  });
  const setLink = trpc.recording.setLink.useMutation({
    onSuccess: (d) => {
      refresh();
      toast.success(d.advanced ? "Link saved. It moved to In editing for your coach." : "Link saved. Your coach can see it now.");
    },
    onError: (err) => toast.error(err.message),
  });
  const [editingLink, setEditingLink] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState("");

  /** Saved-or-editable recording URL for one video (Loom/Drive/YouTube). */
  const LinkField = ({ itemId, section, saved }: { itemId: number; section?: string; saved?: string | null }) => {
    const key = `${itemId}:${section ?? ""}`;
    if (editingLink !== key && saved) {
      return (
        <span className="flex items-center gap-2 min-w-0">
          <a href={saved} target="_blank" rel="noreferrer" className="text-sm text-primary underline truncate max-w-72">
            {saved.replace(/^https?:\/\//, "")}
          </a>
          <button
            className="text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
            onClick={() => {
              setEditingLink(key);
              setLinkDraft(saved);
            }}
          >
            edit
          </button>
        </span>
      );
    }
    if (editingLink !== key) {
      return (
        <button
          className="text-xs font-medium text-muted-foreground hover:text-primary border border-dashed border-border/70 rounded-lg px-3 py-1.5 flex-shrink-0 transition-colors"
          onClick={() => {
            setEditingLink(key);
            setLinkDraft("");
          }}
        >
          + Add your video link
        </button>
      );
    }
    return (
      <span className="flex items-center gap-2 flex-1 min-w-0 w-full">
        <input
          autoFocus
          value={linkDraft}
          onChange={(e) => setLinkDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setLink.mutate({ token, itemId, section, url: linkDraft.trim() });
              setEditingLink(null);
            } else if (e.key === "Escape") setEditingLink(null);
          }}
          placeholder="Paste your Loom / Drive / YouTube link"
          className="flex-1 min-w-0 h-10 rounded-lg border border-primary/40 bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/70"
        />
        <button
          disabled={setLink.isPending}
          className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold flex-shrink-0 hover:opacity-90 transition-opacity"
          onClick={() => {
            setLink.mutate({ token, itemId, section, url: linkDraft.trim() });
            setEditingLink(null);
          }}
        >
          Save
        </button>
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <p className="text-sm text-muted-foreground text-center py-16">
        Your recording list is not available right now. Ask your coach for a fresh link.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {data.items.map((item, idx) => {
        const sections = docSections(item.content);
        const checked = item.checkedSections ?? [];
        const pipe = pipelineLink?.(item.docType);
        return (
          <div
            key={item.id}
            className={`rounded-xl border ${
              item.recordedAt ? "border-emerald-500/30 bg-emerald-500/[0.04]" : "border-border/60 bg-card/30"
            }`}
          >
            <div className="flex items-center gap-3 p-4">
              <button
                disabled={mark.isPending}
                onClick={() => mark.mutate({ token, itemId: item.id, recorded: !item.recordedAt })}
                className="flex-shrink-0"
                title={item.recordedAt ? "Mark as not recorded" : "Mark as recorded"}
              >
                {item.recordedAt ? (
                  <span className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </span>
                ) : (
                  <Circle className="w-7 h-7 text-muted-foreground/50 hover:text-primary transition-colors" />
                )}
              </button>
              <button className="flex-1 text-left min-w-0" onClick={() => setOpen(open === item.id ? null : item.id)}>
                <p
                  className={`text-[15px] font-semibold leading-snug ${
                    item.recordedAt ? "text-muted-foreground line-through" : "text-foreground"
                  }`}
                >
                  {idx + 1}. {item.title}
                </p>
                {sections.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {checked.length}/{sections.length} videos recorded
                  </p>
                )}
              </button>
              {pipe && (
                <button
                  onClick={pipe.go}
                  className="hidden sm:block text-xs font-medium text-primary hover:underline flex-shrink-0"
                >
                  {pipe.label} →
                </button>
              )}
              <CopyButton text={item.content} label="Copy script" className="flex-shrink-0" />
              <button
                onClick={() => setOpen(open === item.id ? null : item.id)}
                className="flex-shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground"
              >
                {open === item.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
            </div>
            {open === item.id && (
              <div className="px-5 pb-5 border-t border-border/40 pt-4 space-y-4">
                {sections.length === 0 && (
                  <div className="rounded-lg border border-border/40 bg-background/40 p-4">
                    <p className="text-sm font-semibold text-foreground mb-2">
                      Filmed it? Paste the link and it moves to editing.
                    </p>
                    <LinkField itemId={item.id} saved={item.recordingUrl} />
                  </div>
                )}
                {sections.length > 0 && (
                  <div className="rounded-lg border border-border/40 bg-background/40 p-4">
                    <p className="text-sm font-semibold text-foreground mb-3">
                      Tick each video as you film it — paste its link and it counts as done
                    </p>
                    <div className="space-y-3">
                      {sections.map((s) => {
                        const done = checked.includes(s);
                        return (
                          <div key={s}>
                            <button
                              disabled={toggleSection.isPending}
                              onClick={() => toggleSection.mutate({ token, itemId: item.id, section: s })}
                              className="flex items-center gap-3 text-left min-w-0"
                            >
                              {done ? (
                                <span className="w-5 h-5 rounded bg-emerald-500 flex items-center justify-center flex-shrink-0">
                                  <Check className="w-3.5 h-3.5 text-white" />
                                </span>
                              ) : (
                                <span className="w-5 h-5 rounded border border-border flex-shrink-0" />
                              )}
                              <span className={`text-sm ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                {s}
                              </span>
                            </button>
                            <div className="pl-8 mt-1.5">
                              <LinkField itemId={item.id} section={s} saved={item.sectionLinks?.[s]} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Page-code blocks never render for the client. Scripts only. */}
                {stripHtmlBlock(item.content).trim().length > 40 ? (
                  <MarkdownDoc content={stripHtmlBlock(item.content)} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This item is a web page build, not a recording script. Ask your coach for the script version.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
      {!data.items.length && (
        <p className="text-sm text-muted-foreground text-center py-16">
          Nothing to record right now. New scripts land here when your coach sends them.
        </p>
      )}
    </div>
  );
}
