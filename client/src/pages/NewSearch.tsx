import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Clock,
  Lightbulb,
  Loader2,
  Sparkles,
} from "lucide-react";

const PLATFORMS = [
  { id: "reddit", label: "Reddit", description: "Threads + comment mining" },
  { id: "youtube", label: "YouTube", description: "Deep comment mining" },
  { id: "hackernews", label: "Hacker News", description: "Stories & comments" },
  { id: "trustpilot", label: "Trustpilot", description: "Real review text" },
  { id: "quora", label: "Quora", description: "Q&A discussions" },
  { id: "forums", label: "Forums", description: "Niche communities" },
  { id: "google", label: "Google", description: "Organic + questions" },
  { id: "duckduckgo", label: "DuckDuckGo", description: "Alt index coverage" },
  { id: "twitter", label: "Twitter/X", description: "Tweets & threads" },
  { id: "news", label: "News", description: "Headlines & articles" },
];

export default function NewSearch() {
  const [, navigate] = useLocation();
  const [keywordsText, setKeywordsText] = useState("");
  const [context, setContext] = useState("");
  const [competitorsText, setCompetitorsText] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    PLATFORMS.map((p) => p.id) // All 10 platforms selected by default
  );
  const [debouncedKeyword, setDebouncedKeyword] = useState("");

  const keywordList = keywordsText
    .split("\n")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 10);

  // Loose count of links in the paste — server does the real extraction.
  // Users paste whole Notion blocks, not clean URL lists.
  const detectedUrls = Array.from(
    new Set([
      ...(competitorsText.match(/https?:\/\/[^\s)\]"'<>*]+/g) ?? []),
      ...(competitorsText.match(/(?:^|[\s(])((?:www\.)?(?:instagram|facebook|youtube|skool|tiktok|linkedin)\.com\/[^\s)\]"'<>*]+)/gi) ?? []),
    ].map((u) => u.trim().replace(/^https?:\/\/(www\.)?/, "").toLowerCase()))
  ).slice(0, 10);

  // Debounce the first keyword so suggestions don't fire on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKeyword(keywordList[0] ?? ""), 600);
    return () => clearTimeout(t);
  }, [keywordsText]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: suggestions } = trpc.mining.keywordSuggestions.useQuery(
    { keyword: debouncedKeyword },
    { enabled: debouncedKeyword.length >= 3, staleTime: 5 * 60 * 1000 }
  );

  const utils = trpc.useUtils();
  const createSearch = trpc.mining.create.useMutation({
    onSuccess: async (search) => {
      // Immediately trigger analysis (context already saved to the search)
      await startAnalysis.mutateAsync({ searchId: search.id });
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to create search");
    },
  });

  const startAnalysis = trpc.analysis.run.useMutation({
    onSuccess: (_, vars) => {
      utils.mining.list.invalidate();
      toast.success("Mining started! Analyzing conversations...");
      navigate(`/search/${vars.searchId}`);
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to start analysis");
    },
  });

  const isLoading = createSearch.isPending || startAnalysis.isPending;

  // Rough pipeline estimate: scraping scales with keyword + platform count
  const estimatedSeconds = Math.round((20 + selectedPlatforms.length * 4 + 30) * Math.max(1, keywordList.length * 0.6));

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const addSuggestion = (s: string) => {
    if (keywordList.includes(s) || keywordList.length >= 10) return;
    setKeywordsText((prev) => (prev.trim() ? `${prev.trimEnd()}\n${s}` : s));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPlatforms.length === 0) {
      toast.error("Please select at least one platform");
      return;
    }
    if (keywordList.length === 0) {
      toast.error("Enter at least one keyword");
      return;
    }
    await createSearch.mutateAsync({
      keywords: keywordList,
      platforms: selectedPlatforms,
      brandVoice: context.trim() || undefined,
      competitors: competitorsText.trim() || undefined,
    });
  };

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Dashboard
          </button>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight mb-2">
            New Voice Mining Search
          </h1>
          <p className="text-sm text-muted-foreground">
            Add your keywords and we'll mine real conversations into one report.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Keywords — one per line, all feed one report */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="keywords" className="text-sm font-medium text-foreground">
                Keywords <span className="text-destructive">*</span>
                <span className="text-muted-foreground font-normal ml-2">one per line, up to 10, all in one report</span>
              </Label>
              <span className={`text-xs ${keywordList.length >= 10 ? "text-destructive" : "text-muted-foreground"}`}>
                {keywordList.length} / 10
              </span>
            </div>
            <Textarea
              id="keywords"
              placeholder={"business funding\nbusiness credit\nstartup loans"}
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              disabled={isLoading}
              rows={4}
              className="bg-input border-border/60 text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 resize-none text-sm leading-relaxed"
            />
            <p className="text-xs text-muted-foreground">
              Press Enter after each keyword to add another. Everything gets mined into a single report.
            </p>
            {(suggestions?.length ?? 0) > 0 && keywordList.length < 10 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Lightbulb className="w-3 h-3 text-amber-400" />
                  People also search for. Click to add
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(suggestions ?? []).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addSuggestion(s)}
                      className="px-2.5 py-1 rounded-full text-xs border border-amber-400/30 bg-amber-400/5 text-amber-300/90 hover:bg-amber-400/15 transition-all duration-150"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Industry context — one simple box */}
          <div className="space-y-3">
            <Label htmlFor="context" className="text-sm font-medium text-foreground">
              Industry Context{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="context"
              placeholder="Any context you have about this industry, in your own words. Who you sell to, what you offer, anything that helps target the right audience..."
              value={context}
              onChange={(e) => setContext(e.target.value)}
              disabled={isLoading}
              rows={4}
              className="bg-input border-border/60 text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 resize-none text-sm leading-relaxed"
            />
          </div>

          {/* Competitors */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="competitors" className="text-sm font-medium text-foreground">
                Competitors{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              {detectedUrls.length > 0 && (
                <span className="text-xs text-emerald-400">{detectedUrls.length} link{detectedUrls.length === 1 ? "" : "s"} detected</span>
              )}
            </div>
            <Textarea
              id="competitors"
              placeholder={"Paste anything about your competitors: links, notes, whole docs.\nInstagram, YouTube, Facebook, Skool, or website links get pulled out automatically, and your notes make the intel sharper."}
              value={competitorsText}
              onChange={(e) => setCompetitorsText(e.target.value)}
              disabled={isLoading}
              rows={4}
              className="bg-input border-border/60 text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 resize-none text-sm leading-relaxed"
            />
            <p className="text-xs text-muted-foreground">
              Doesn't need to be tidy. We find the links, scrape their pages, and use your notes in Competitor Intel.
            </p>
          </div>

          {/* Platforms */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-foreground">
                Data Sources <span className="text-destructive">*</span>
              </Label>
              <span className="text-xs text-muted-foreground">
                {selectedPlatforms.length} selected
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PLATFORMS.map((platform) => {
                const isSelected = selectedPlatforms.includes(platform.id);
                return (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={() => togglePlatform(platform.id)}
                    disabled={isLoading}
                    className={`relative flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all duration-150 ${
                      isSelected
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-border/40 bg-card/30 text-muted-foreground hover:border-border/70 hover:text-foreground"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                        isSelected
                          ? "border-primary bg-primary"
                          : "border-border/60"
                      }`}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{platform.label}</div>
                      <div className="text-xs text-muted-foreground/60 truncate">{platform.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          {keywordList.length > 0 && selectedPlatforms.length > 0 && (
            <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
              <div className="flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground mb-1">Ready to mine</p>
                  <p className="text-xs text-muted-foreground">
                    Will analyze{" "}
                    <span className="text-foreground font-medium">
                      {keywordList.length === 1 ? `"${keywordList[0]}"` : `${keywordList.length} keywords`}
                    </span>{" "}
                    across <span className="text-foreground font-medium">{selectedPlatforms.length} platforms</span> into one report.
                    {detectedUrls.length > 0 && (
                      <> Plus direct analysis of <span className="text-foreground font-medium">{detectedUrls.length} competitor {detectedUrls.length === 1 ? "page" : "pages"}</span>.</>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-primary" />
                    Estimated report time: ~{estimatedSeconds} seconds
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={isLoading || selectedPlatforms.length === 0 || keywordList.length === 0}
            className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting analysis...
              </>
            ) : (
              <>
                Start Mining
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
