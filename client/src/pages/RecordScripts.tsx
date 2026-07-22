import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { RecordingChecklist } from "@/components/RecordingChecklist";
import { Clapperboard, Loader2 } from "lucide-react";

/**
 * Public recording queue: the CLIENT opens this from a magic link
 * (/record/:token), reads each script word for word, and ticks it off once
 * filmed. No login — the token is the auth. The same checklist renders in
 * the portal's To-Do tab via RecordingChecklist.
 */
export default function RecordScripts() {
  const { token = "" } = useParams<{ token: string }>();
  const { data, isLoading, error } = trpc.recording.get.useQuery({ token }, { enabled: !!token });

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
        <RecordingChecklist token={token} />
      </div>
    </div>
  );
}
