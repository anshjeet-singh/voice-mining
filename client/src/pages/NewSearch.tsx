import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  Lightbulb,
  Loader2,
  Mic,
  Sparkles,
  X,
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

const NICHE_SUGGESTIONS = [
  "Business Funding", "Credit Repair", "E-commerce", "SaaS",
  "Fitness & Health", "Real Estate", "Relationships", "Personal Finance",
  "Digital Marketing", "Dropshipping", "Crypto", "Career Growth",
];

const BRAND_VOICE_EXAMPLES = [
  { label: "Skool Community About Page", placeholder: "Paste your Skool community about page or description so the AI understands your exact niche, audience, and what you offer..." },
  { label: "Email or Post You've Written", placeholder: "Paste an email, post, or piece of content you've created so the AI understands your niche, avatars, and industry terminology..." },
  { label: "YouTube Video Transcript", placeholder: "Paste a transcript from one of your videos so the AI understands the specific topics, language, and audience you work with..." },
  { label: "Any Content About Your Niche", placeholder: "Paste any content that describes your niche, offer, or audience so the AI targets the right market segment and avatars..." },
];

export default function NewSearch() {
  const [, navigate] = useLocation();
  const [keyword, setKeyword] = useState("");
  const [niche, setNiche] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    PLATFORMS.map((p) => p.id) // All 10 platforms selected by default
  );
  const [brandVoiceOpen, setBrandVoiceOpen] = useState(false);
  const [brandVoiceText, setBrandVoiceText] = useState("");
  const [activeBrandVoiceTab, setActiveBrandVoiceTab] = useState(0);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkKeywords, setBulkKeywords] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");

  // Debounce the keyword so suggestions don't fire on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKeyword(keyword.trim()), 600);
    return () => clearTimeout(t);
  }, [keyword]);

  const { data: suggestions } = trpc.mining.keywordSuggestions.useQuery(
    { keyword: debouncedKeyword },
    { enabled: !bulkMode && debouncedKeyword.length >= 3, staleTime: 5 * 60 * 1000 }
  );

  const utils = trpc.useUtils();
  const createSearch = trpc.mining.create.useMutation({
    onSuccess: async (search) => {
      // Immediately trigger analysis, passing brand voice context
      await startAnalysis.mutateAsync({
        searchId: search.id,
        // brandVoice already saved to DB by createSearch — no need to pass again
      });
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

  const createBulk = trpc.mining.createBulk.useMutation({
    onSuccess: ({ searchIds }) => {
      utils.mining.list.invalidate();
      toast.success(`Mining started for ${searchIds.length} keywords`);
      navigate(`/search/bulk?ids=${searchIds.join(",")}`);
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to start bulk mining");
    },
  });

  const isLoading = createSearch.isPending || startAnalysis.isPending || createBulk.isPending;

  const bulkKeywordList = bulkKeywords
    .split("\n")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 10);

  // Rough pipeline estimate: scraping scales with platform count, then AI analysis + report generation
  const estimatedSeconds = Math.round(20 + selectedPlatforms.length * 4 + 30);

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPlatforms.length === 0) {
      toast.error("Please select at least one platform");
      return;
    }
    if (bulkMode) {
      if (bulkKeywordList.length === 0) {
        toast.error("Enter at least one keyword (one per line)");
        return;
      }
      await createBulk.mutateAsync({
        keywords: bulkKeywordList,
        niche: niche.trim() || undefined,
        platforms: selectedPlatforms,
        brandVoice: brandVoiceText.trim() || undefined,
      });
      return;
    }
    if (!keyword.trim()) {
      toast.error("Please enter a keyword");
      return;
    }
    await createSearch.mutateAsync({
      keyword: keyword.trim(),
      niche: niche.trim() || undefined,
      platforms: selectedPlatforms,
      brandVoice: brandVoiceText.trim() || undefined,
    });
  };

  const hasBrandVoice = brandVoiceText.trim().length > 0;

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
            Define your keyword and select platforms to mine real conversations.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Bulk mode toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-border/40 bg-card/20">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${bulkMode ? "bg-primary/20" : "bg-card/60"}`}>
                <Layers className={`w-4 h-4 ${bulkMode ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Bulk Mode</p>
                <p className="text-xs text-muted-foreground mt-0.5">Mine up to 10 keywords at once, one report each</p>
              </div>
            </div>
            <Switch checked={bulkMode} onCheckedChange={setBulkMode} disabled={isLoading} />
          </div>

          {/* Keyword(s) */}
          {bulkMode ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="bulk-keywords" className="text-sm font-medium text-foreground">
                  Keywords <span className="text-destructive">*</span>
                  <span className="text-muted-foreground font-normal ml-2">one per line, up to 10</span>
                </Label>
                <span className={`text-xs ${bulkKeywordList.length > 10 ? "text-destructive" : "text-muted-foreground"}`}>
                  {bulkKeywordList.length} / 10
                </span>
              </div>
              <Textarea
                id="bulk-keywords"
                placeholder={"business funding\ncredit repair\nSaaS pricing\n..."}
                value={bulkKeywords}
                onChange={(e) => setBulkKeywords(e.target.value)}
                disabled={isLoading}
                rows={6}
                className="bg-input border-border/60 text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 resize-none text-sm leading-relaxed"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <Label htmlFor="keyword" className="text-sm font-medium text-foreground">
                Keyword or Topic <span className="text-destructive">*</span>
              </Label>
              <Input
                id="keyword"
                placeholder="e.g. business funding, credit repair, SaaS pricing..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="h-11 bg-input border-border/60 text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50"
                disabled={isLoading}
              />
              {(suggestions?.length ?? 0) > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Lightbulb className="w-3 h-3 text-amber-400" />
                    People also search for
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(suggestions ?? []).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setKeyword(s)}
                        className="px-2.5 py-1 rounded-full text-xs border border-amber-400/30 bg-amber-400/5 text-amber-300/90 hover:bg-amber-400/15 transition-all duration-150"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Niche */}
          <div className="space-y-3">
            <Label htmlFor="niche" className="text-sm font-medium text-foreground">
              Niche / Industry{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="niche"
              placeholder="e.g. small business owners, entrepreneurs..."
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="h-11 bg-input border-border/60 text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50"
              disabled={isLoading}
            />
            <div className="flex flex-wrap gap-1.5">
              {NICHE_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setNiche(suggestion)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ${
                    niche === suggestion
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  {suggestion}
                </button>
              ))}
            </div>
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

          {/* Brand Voice Upload — collapsible optional section */}
          <div className="rounded-xl border border-border/40 bg-card/20 overflow-hidden">
            <button
              type="button"
              onClick={() => setBrandVoiceOpen(!brandVoiceOpen)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-card/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${hasBrandVoice ? "bg-primary/20" : "bg-card/60"}`}>
                  <Mic className={`w-4 h-4 ${hasBrandVoice ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">Niche Context</p>
                    <span className="text-xs px-2 py-0.5 rounded-full border border-border/40 text-muted-foreground">Optional</span>
                    {hasBrandVoice && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 border border-primary/20 text-primary">
                        Added
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Help the AI target the right niche, avatars, and industry
                  </p>
                </div>
              </div>
              {brandVoiceOpen ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
            </button>

            {brandVoiceOpen && (
              <div className="px-5 pb-5 space-y-4">
                {/* Explanation */}
                <div className="p-4 rounded-lg border border-primary/15 bg-primary/5">
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-primary mb-1">What this does</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        This helps the AI understand your specific niche, target avatars, industry terminology, and what you sell. It sharpens the research so the mining targets the exact audience you're after. The output copy is always driven by the market's verbatim language, not yours.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Tab selector for example types */}
                <div className="flex gap-1 p-1 rounded-lg bg-card/50 border border-border/30 overflow-x-auto">
                  {BRAND_VOICE_EXAMPLES.map((example, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveBrandVoiceTab(i)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                        activeBrandVoiceTab === i
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {example.label}
                    </button>
                  ))}
                </div>

                {/* Textarea */}
                <div className="relative">
                  <Textarea
                    placeholder={BRAND_VOICE_EXAMPLES[activeBrandVoiceTab]?.placeholder ?? "Paste your content here..."}
                    value={brandVoiceText}
                    onChange={(e) => setBrandVoiceText(e.target.value)}
                    disabled={isLoading}
                    rows={8}
                    className="bg-input border-border/60 text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 resize-none text-sm leading-relaxed"
                  />
                  {brandVoiceText && (
                    <button
                      type="button"
                      onClick={() => setBrandVoiceText("")}
                      className="absolute top-2 right-2 p-1 rounded-md hover:bg-card/60 text-muted-foreground hover:text-foreground transition-colors"
                      title="Clear"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Character count */}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {brandVoiceText.length > 0 ? (
                      <span className="text-muted-foreground">
                        {brandVoiceText.length.toLocaleString()} / 100,000 characters
                      </span>
                    ) : (
                      "No content added yet"
                    )}
                  </p>
                  {hasBrandVoice && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Brand voice will be used in AI generation
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Preview */}
          {(bulkMode ? bulkKeywordList.length > 0 : !!keyword) && selectedPlatforms.length > 0 && (
            <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
              <div className="flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground mb-1">Ready to mine</p>
                  <p className="text-xs text-muted-foreground">
                    {bulkMode ? (
                      <>
                        Will analyze <span className="text-foreground font-medium">{bulkKeywordList.length} keywords</span> across{" "}
                        <span className="text-foreground font-medium">{selectedPlatforms.length} platforms</span> and generate one report per keyword.
                      </>
                    ) : (
                      <>
                        Will analyze <span className="text-foreground font-medium">"{keyword}"</span> across{" "}
                        <span className="text-foreground font-medium">{selectedPlatforms.length} platforms</span>.
                      </>
                    )}
                    {hasBrandVoice && (
                      <> Brand voice context will personalise all AI-generated copy.</>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-primary" />
                    Estimated report time: ~{estimatedSeconds} seconds{bulkMode && bulkKeywordList.length > 3 ? " per keyword (3 run at a time)" : ""}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={
              isLoading ||
              selectedPlatforms.length === 0 ||
              (bulkMode ? bulkKeywordList.length === 0 : !keyword.trim())
            }
            className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting analysis...
              </>
            ) : (
              <>
                {bulkMode && bulkKeywordList.length > 1 ? `Start Mining ${bulkKeywordList.length} Keywords` : "Start Mining"}
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
