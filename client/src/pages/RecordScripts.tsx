import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { MarkdownDoc } from "@/components/MarkdownDoc";
import { CopyButton, stripHtmlBlock } from "@/components/engines";
import { Check, ChevronDown, ChevronUp, Circle, Clapperboard, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Public recording queue: the CLIENT opens this from a magic link
 * (/record/:token), reads each script word for word, and ticks it off once
 * filmed. No login — the token is the auth. Read-only besides the tick.
 */
/** Section titles of a multi-part script doc (each section = one video). */
function docSections(content: string): string[] {
  const clean = stripHtmlBlock(content);
  for (const level of ["##", "###"]) {
    const re = new RegExp(`^${level}\\s+(.+)$`, "gm");
    const titles = Array.from(clean.matchAll(re)).map((m) => m[1].replace(/\*+/g, "").trim().slice(0, 280));
    if (titles.length >= 2) return titles;
  }
  return [];
}

export default function RecordScripts() {
  const { token = "" } = useParams<{ token: string }>();
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.recording.get.useQuery({ token }, { enabled: !!token });
  const [open, setOpen] = useState<number | null>(null);

  const mark = trpc.recording.markRecorded.useMutation({
    onSuccess: () => utils.recording.get.invalidate({ token }),
    onError: (err) => toast.error(err.message),
  });
  const toggleSection = trpc.recording.toggleSection.useMutation({
    onSuccess: () => utils.recording.get.invalidate({ token }),
    onError: (err) => toast.error(err.message),
  });
  const setLink = trpc.recording.setLink.useMutation({
    onSuccess: () => {
      utils.recording.get.invalidate({ token });
      toast.success("Link saved — your coach can see it now");
    },
    onError: (err) => toast.error(err.message),
  });
  const [editingLink, setEditingLink] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState("");

  /** Saved-or-editable recording URL for one video (Loom/Wistia/YouTube). */
  const LinkField = ({ itemId, section, saved }: { itemId: number; section?: string; saved?: string | null }) => {
    const key = `${itemId}:${section ?? ""}`;
    if (editingLink !== key && saved) {
      return (
        <span className="flex items-center gap-1.5 min-w-0">
          <a href={saved} target="_blank" rel="noreferrer" className="text-[11px] text-primary underline truncate max-w-48">
            {saved.replace(/^https?:\/\//, "")}
          </a>
          <button
            className="text-[10px] text-muted-foreground hover:text-foreground flex-shrink-0"
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
          className="text-[11px] text-muted-foreground hover:text-primary underline decoration-dotted flex-shrink-0"
          onClick={() => {
            setEditingLink(key);
            setLinkDraft("");
          }}
        >
          + add video link
        </button>
      );
    }
    return (
      <span className="flex items-center gap-1.5 flex-1 min-w-0">
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
          placeholder="Paste your Loom / Wistia / YouTube link, press Enter"
          className="flex-1 min-w-0 h-7 rounded-lg border border-primary/40 bg-background px-2 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
        <button
          disabled={setLink.isPending}
          className="text-[10px] font-semibold text-primary flex-shrink-0"
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6 text-center">
        <div>
          <h1 className="text-lg font-semibold text-foreground mb-1">Recording list not found</h1>
          <p className="text-sm text-muted-foreground">This link may have been replaced. Ask your coach for a fresh one.</p>
        </div>
      </div>
    );
  }

  const done = data.items.filter((i) => i.recordedAt).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-5 py-10">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Clapperboard className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground tracking-tight">Your recording list</h1>
            <p className="text-xs text-muted-foreground">
              {data.clientName} · {done}/{data.items.length} recorded
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3 mb-6">
          Each card is one video, scripted word for word. Open it, film it, tick it off. Read it out loud a couple of
          times first so it sounds like you.
        </p>

        <div className="space-y-3">
          {data.items.map((item, idx) => {
            const sections = docSections(item.content);
            const checked = item.checkedSections ?? [];
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
                    <span className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-white" />
                    </span>
                  ) : (
                    <Circle className="w-6 h-6 text-muted-foreground/50 hover:text-primary transition-colors" />
                  )}
                </button>
                <button className="flex-1 text-left min-w-0" onClick={() => setOpen(open === item.id ? null : item.id)}>
                  <p className={`text-sm font-medium leading-snug ${item.recordedAt ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    {idx + 1}. {item.title}
                  </p>
                  {sections.length > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {checked.length}/{sections.length} videos recorded
                    </p>
                  )}
                </button>
                <CopyButton text={item.content} label="Copy" className="flex-shrink-0" />
                <button
                  onClick={() => setOpen(open === item.id ? null : item.id)}
                  className="flex-shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  {open === item.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
              {open === item.id && (
                <div className="px-5 pb-5 border-t border-border/40 pt-4 space-y-4">
                  {sections.length === 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground flex-shrink-0">Your recording:</span>
                      <LinkField itemId={item.id} saved={item.recordingUrl} />
                    </div>
                  )}
                  {sections.length > 0 && (
                    <div className="rounded-lg border border-border/40 bg-background/40 p-3">
                      <p className="text-xs font-semibold text-foreground mb-2">Tick each video off as you film it</p>
                      <div className="space-y-1.5">
                        {sections.map((s) => {
                          const done = checked.includes(s);
                          return (
                            <div key={s} className="flex items-center gap-2.5">
                              <button
                                disabled={toggleSection.isPending}
                                onClick={() => toggleSection.mutate({ token, itemId: item.id, section: s })}
                                className="flex items-center gap-2.5 text-left min-w-0"
                              >
                                {done ? (
                                  <span className="w-4 h-4 rounded bg-emerald-500 flex items-center justify-center flex-shrink-0">
                                    <Check className="w-2.5 h-2.5 text-white" />
                                  </span>
                                ) : (
                                  <span className="w-4 h-4 rounded border border-border flex-shrink-0" />
                                )}
                                <span className={`text-xs truncate ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>{s}</span>
                              </button>
                              <span className="flex-1" />
                              <LinkField itemId={item.id} section={s} saved={item.sectionLinks?.[s]} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Page-code blocks never render for the client — scripts only. */}
                  {stripHtmlBlock(item.content).trim().length > 40 ? (
                    <MarkdownDoc content={stripHtmlBlock(item.content)} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      This item is a web page build, not a recording script — ask your coach for the script version.
                    </p>
                  )}
                </div>
              )}
            </div>
            );
          })}
          {!data.items.length && (
            <p className="text-sm text-muted-foreground text-center py-16">Nothing to record yet. Check back soon.</p>
          )}
        </div>
      </div>
    </div>
  );
}
