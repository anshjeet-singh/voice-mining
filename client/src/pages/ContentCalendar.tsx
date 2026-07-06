import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Sparkles,
  Vault as VaultIcon,
  X,
} from "lucide-react";

// Content type colour coding per the spec:
// hooks = green, emails = blue, Skool posts = purple, scripts = orange, ads = red
const TYPE_STYLES: Record<string, { label: string; chip: string; dot: string }> = {
  hook: { label: "Hook", chip: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30", dot: "bg-emerald-400" },
  email: { label: "Email", chip: "bg-blue-400/15 text-blue-300 border-blue-400/30", dot: "bg-blue-400" },
  skool_post: { label: "Skool", chip: "bg-purple-400/15 text-purple-300 border-purple-400/30", dot: "bg-purple-400" },
  script: { label: "Script", chip: "bg-orange-400/15 text-orange-300 border-orange-400/30", dot: "bg-orange-400" },
  ad_copy: { label: "Ad", chip: "bg-red-400/15 text-red-300 border-red-400/30", dot: "bg-red-400" },
  youtube_idea: { label: "YouTube", chip: "bg-rose-400/15 text-rose-300 border-rose-400/30", dot: "bg-rose-400" },
};

const toDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function ContentCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [draggingItemId, setDraggingItemId] = useState<number | null>(null);
  const [draggingEntryId, setDraggingEntryId] = useState<number | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const fromDate = toDateStr(monthStart);
  const toDate = toDateStr(monthEnd);

  const utils = trpc.useUtils();
  const { data: entries, isLoading: entriesLoading } = trpc.calendar.list.useQuery({ fromDate, toDate });
  const { data: vaultItems, isLoading: vaultLoading } = trpc.vault.list.useQuery();

  const invalidate = () => utils.calendar.list.invalidate();

  const addMutation = trpc.calendar.add.useMutation({
    onSuccess: invalidate,
    onError: () => toast.error("Could not schedule that piece"),
  });
  const moveMutation = trpc.calendar.move.useMutation({
    onSuccess: invalidate,
    onError: () => toast.error("Could not move that piece"),
  });
  const removeMutation = trpc.calendar.remove.useMutation({
    onSuccess: invalidate,
  });
  const autoFillMutation = trpc.calendar.autoFill.useMutation({
    onSuccess: ({ created }) => {
      invalidate();
      toast.success(
        created > 0
          ? `Scheduled ${created} pieces across the month`
          : "Nothing left to schedule. Save more content to your Vault first."
      );
    },
    onError: () => toast.error("Auto-fill failed. Try again."),
  });

  const entriesByDate = useMemo(() => {
    const map = new Map<string, NonNullable<typeof entries>>();
    for (const e of entries ?? []) {
      if (!map.has(e.scheduledDate)) map.set(e.scheduledDate, []);
      map.get(e.scheduledDate)!.push(e);
    }
    return map;
  }, [entries]);

  const scheduledItemIds = useMemo(() => new Set((entries ?? []).map((e) => e.vaultItemId)), [entries]);
  const unscheduled = (vaultItems ?? []).filter((i) => !scheduledItemIds.has(i.id));

  // Calendar grid: pad to start on Monday
  const firstDayOffset = (monthStart.getDay() + 6) % 7; // 0 = Monday
  const daysInMonth = monthEnd.getDate();
  const cells: Array<{ date: string; day: number } | null> = [
    ...Array.from({ length: firstDayOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => ({
      date: toDateStr(new Date(year, month, i + 1)),
      day: i + 1,
    })),
  ];

  const monthLabel = monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const todayStr = toDateStr(now);

  const changeMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const handleDropOnDate = (date: string) => {
    setDragOverDate(null);
    if (draggingEntryId !== null) {
      moveMutation.mutate({ id: draggingEntryId, scheduledDate: date });
      setDraggingEntryId(null);
    } else if (draggingItemId !== null) {
      addMutation.mutate({ vaultItemId: draggingItemId, scheduledDate: date });
      setDraggingItemId(null);
    }
  };

  const exportCsv = () => {
    const rows = [["Date", "Type", "Label", "Content"]];
    const sorted = [...(entries ?? [])].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
    for (const e of sorted) {
      rows.push([
        e.scheduledDate,
        TYPE_STYLES[e.item.contentType]?.label ?? e.item.contentType,
        e.item.label,
        e.item.content.replace(/\n/g, " "),
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `content-calendar-${fromDate.slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Calendar exported as CSV");
  };

  const exportPdf = () => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const sorted = [...(entries ?? [])].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
    const body = sorted
      .map(
        (e) =>
          `<div class="entry"><div class="date">${esc(
            new Date(`${e.scheduledDate}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
          )}</div><div class="type">${esc(TYPE_STYLES[e.item.contentType]?.label ?? e.item.contentType)}</div><div class="label">${esc(e.item.label)}</div><div class="content">${esc(e.item.content).replace(/\n/g, "<br/>")}</div></div>`
      )
      .join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Content Calendar ${esc(monthLabel)}</title><style>
      body { font-family: Georgia, serif; font-size: 11pt; color: #1a1a1a; padding: 40px; max-width: 800px; margin: 0 auto; }
      h1 { font-size: 20pt; border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; margin-bottom: 24px; }
      .entry { margin-bottom: 20px; page-break-inside: avoid; border: 1px solid #e0e0e0; border-radius: 6px; padding: 14px; }
      .date { font-weight: bold; font-size: 11pt; margin-bottom: 2px; }
      .type { display: inline-block; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.06em; color: #555; margin-bottom: 6px; }
      .label { font-weight: bold; font-size: 10.5pt; margin-bottom: 6px; }
      .content { font-size: 10pt; line-height: 1.5; color: #333; white-space: pre-wrap; }
    </style></head><body><h1>Content Calendar &mdash; ${esc(monthLabel)}</h1>${body || "<p>No content scheduled this month.</p>"}</body></html>`;
    const win = window.open("", "_blank");
    if (!win) { toast.error("Pop-up blocked. Please allow pop-ups for this site."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  const isLoading = entriesLoading || vaultLoading;

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-foreground tracking-tight">Content Calendar</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Drag content from your Vault onto the days you'll post it
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => autoFillMutation.mutate({ monthStart: fromDate })}
              disabled={autoFillMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {autoFillMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              )}
              Auto-Fill Month
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv} className="border-border/50 text-muted-foreground hover:text-foreground">
              <Download className="w-3.5 h-3.5 mr-1.5" />
              CSV
            </Button>
            <Button size="sm" variant="outline" onClick={exportPdf} className="border-border/50 text-muted-foreground hover:text-foreground">
              <Download className="w-3.5 h-3.5 mr-1.5" />
              PDF
            </Button>
          </div>
        </div>

        {/* Legend + month nav */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(TYPE_STYLES).map(([key, s]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => changeMonth(-1)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-foreground min-w-[140px] text-center">{monthLabel}</span>
            <button onClick={() => changeMonth(1)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
            {/* Calendar grid */}
            <div>
              <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div key={d} className="text-xs font-semibold text-muted-foreground/60 text-center py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {cells.map((cell, i) =>
                  cell ? (
                    <div
                      key={cell.date}
                      onDragOver={(e) => { e.preventDefault(); setDragOverDate(cell.date); }}
                      onDragLeave={() => setDragOverDate((d) => (d === cell.date ? null : d))}
                      onDrop={() => handleDropOnDate(cell.date)}
                      className={`min-h-[92px] rounded-lg border p-1.5 transition-colors ${
                        dragOverDate === cell.date
                          ? "border-primary/60 bg-primary/10"
                          : cell.date === todayStr
                            ? "border-primary/30 bg-card/40"
                            : "border-border/30 bg-card/20"
                      }`}
                    >
                      <div className={`text-xs font-medium mb-1 ${cell.date === todayStr ? "text-primary" : "text-muted-foreground/60"}`}>
                        {cell.day}
                      </div>
                      <div className="space-y-1">
                        {(entriesByDate.get(cell.date) ?? []).map((entry) => {
                          const style = TYPE_STYLES[entry.item.contentType] ?? TYPE_STYLES.hook;
                          return (
                            <div
                              key={entry.id}
                              draggable
                              onDragStart={() => setDraggingEntryId(entry.id)}
                              onDragEnd={() => setDraggingEntryId(null)}
                              className={`group flex items-center gap-1 px-1.5 py-1 rounded border text-xs cursor-grab active:cursor-grabbing ${style.chip}`}
                              title={entry.item.label}
                            >
                              <span className="truncate flex-1">{entry.item.label}</span>
                              <button
                                onClick={() => removeMutation.mutate({ id: entry.id })}
                                className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                title="Remove from calendar"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div key={`pad-${i}`} />
                  )
                )}
              </div>
            </div>

            {/* Unscheduled vault items */}
            <div className="rounded-xl border border-border/40 bg-card/30 p-4 h-fit xl:sticky xl:top-4">
              <div className="flex items-center gap-2 mb-3">
                <VaultIcon className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Vault Content</h3>
                <span className="text-xs text-muted-foreground ml-auto">{unscheduled.length} unscheduled</span>
              </div>
              {unscheduled.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarIcon className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {(vaultItems?.length ?? 0) === 0
                      ? "Your Vault is empty. Save hooks, emails, and posts from a report first."
                      : "Everything in your Vault is scheduled. Nice."}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
                  {unscheduled.map((item) => {
                    const style = TYPE_STYLES[item.contentType] ?? TYPE_STYLES.hook;
                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={() => setDraggingItemId(item.id)}
                        onDragEnd={() => setDraggingItemId(null)}
                        className={`px-2.5 py-2 rounded-lg border text-xs cursor-grab active:cursor-grabbing ${style.chip}`}
                        title="Drag onto a day"
                      >
                        <span className="font-medium block truncate">{item.label}</span>
                        <span className="text-muted-foreground/60 text-xs">{style.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
