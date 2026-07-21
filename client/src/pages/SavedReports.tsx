import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { AppShell } from "@/components/AppShell";
import {
  BookOpen,
  Download,
  FileText,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function SavedReports() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: reports, isLoading } = trpc.reports.list.useQuery();

  const deleteReport = trpc.reports.delete.useMutation({
    onSuccess: () => {
      utils.reports.list.invalidate();
      toast.success("Report deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const exportReport = (report: NonNullable<typeof reports>[0]) => {
    const data = JSON.stringify(report, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.name.replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  };

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight mb-1 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Saved Reports
            </h1>
            <p className="text-sm text-muted-foreground">
              Your market intelligence report library
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => navigate("/search/new")}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Search
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : !reports || reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center px-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">No reports yet</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Complete a research search and generate your first report.
            </p>
            <Button
              size="sm"
              onClick={() => navigate("/search/new")}
              className="bg-primary text-primary-foreground"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Start Mining
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report.id}
                className="group flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card/30 hover:border-border/70 hover:bg-card/50 transition-all"
              >
                <div
                  className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 cursor-pointer"
                  onClick={() => navigate(`/report/${report.id}`)}
                >
                  <FileText className="w-4 h-4 text-primary" />
                </div>

                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => navigate(`/report/${report.id}`)}
                >
                  <p className="text-sm font-medium text-foreground truncate">{report.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => exportReport(report)}
                    className="p-2 rounded-lg hover:bg-card/80 text-muted-foreground hover:text-foreground transition-all"
                    title="Export"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Delete this report?")) {
                        deleteReport.mutate({ id: report.id });
                      }
                    }}
                    className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate(`/report/${report.id}`)}
                  className="text-xs text-primary hover:text-primary/80 hover:bg-primary/10 flex-shrink-0"
                >
                  View
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
