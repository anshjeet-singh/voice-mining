import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import {
  ArrowRight,
  BarChart3,
  Brain,
  FileText,
  Globe,
  Layers,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

const FEATURES = [
  {
    icon: Globe,
    title: "Multi-Platform Mining",
    description:
      "Aggregate conversations from Reddit, Twitter, YouTube, forums, Amazon reviews, and 10+ sources simultaneously.",
  },
  {
    icon: Brain,
    title: "AI Intelligence Engine",
    description:
      "Extract pain points, desires, objections, buying triggers, and emotional language using advanced LLM analysis.",
  },
  {
    icon: BarChart3,
    title: "Market Intelligence Reports",
    description:
      "Get executive-level summaries with trending topics, competitor patterns, and emerging market opportunities.",
  },
  {
    icon: Zap,
    title: "Viral Hooks Generator",
    description:
      "Produce scroll-stopping hooks, contrarian takes, and curiosity gaps using real human language from the data.",
  },
  {
    icon: MessageSquare,
    title: "Ad Copy Engine",
    description:
      "Generate Facebook, YouTube, TikTok, and UGC-style ad copy grounded in authentic customer voice.",
  },
  {
    icon: Layers,
    title: "Content Calendar",
    description:
      "Auto-generate 4-week content calendars with daily topics, angles, formats, and hooks derived from mined data.",
  },
  {
    icon: TrendingUp,
    title: "Niche Comparison",
    description:
      "Compare voice mining results across multiple keywords side by side to identify cross-niche opportunities.",
  },
  {
    icon: FileText,
    title: "Exportable Reports",
    description:
      "Save, organize, and export your market intelligence reports for team sharing and future reference.",
  },
];

const PLATFORMS = [
  "Reddit", "Twitter/X", "YouTube", "Forums", "Amazon Reviews",
  "Trustpilot", "Quora", "LinkedIn", "News Headlines", "Blog Articles",
];

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    document.title = "VoiceMining — AI Market Research & Copy Generator";
  }, []);

  const handleCTA = () => {
    if (isAuthenticated) {
      navigate("/dashboard");
    } else {
      window.location.href = getLoginUrl();
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold text-foreground tracking-tight">VoiceMining</span>
          </div>
          <div className="flex items-center gap-3">
            {!loading && (
              isAuthenticated ? (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => navigate("/dashboard")}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Dashboard
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.location.href = getLoginUrl()}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Sign in
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleCTA}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Get Started
                  </Button>
                </>
              )
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-4 overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-20 left-1/4 w-[300px] h-[300px] bg-primary/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative container max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/25 bg-primary/8 text-primary text-xs font-medium mb-8">
            <Sparkles className="w-3 h-3" />
            AI-Powered Market Intelligence
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-light tracking-tight text-foreground mb-6 leading-[1.05]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Mine the exact words
            <br />
            <span className="font-semibold" style={{
              background: "linear-gradient(135deg, oklch(0.82 0.18 285), oklch(0.65 0.16 200))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              your customers use
            </span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed font-light">
            Continuously scrape and analyze public conversations across the internet.
            Extract pain points, desires, viral hooks, and buying triggers — then turn
            them into high-converting copy and content automatically.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              size="lg"
              onClick={handleCTA}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 h-12 text-sm font-medium shadow-lg shadow-primary/20"
            >
              Start Mining Conversations
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleCTA}
              className="border-border/60 text-muted-foreground hover:text-foreground hover:border-border h-12 px-8 text-sm"
            >
              View Sample Report
            </Button>
          </div>

          {/* Platform badges */}
          <div className="mt-16">
            <p className="text-xs text-muted-foreground/60 uppercase tracking-widest mb-4 font-medium">
              Mines data from
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {PLATFORMS.map((platform) => (
                <span
                  key={platform}
                  className="px-3 py-1 rounded-full text-xs text-muted-foreground border border-border/50 bg-card/50"
                >
                  {platform}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 px-4 border-t border-border/30">
        <div className="container max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-light text-foreground mb-4 tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
              Everything you need to understand
              <br />
              <span className="font-semibold text-foreground">your market deeply</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto font-light">
              From raw conversation data to polished marketing assets — the complete
              voice-of-customer intelligence platform.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group p-5 rounded-xl border border-border/50 bg-card/50 hover:border-primary/30 hover:bg-card transition-all duration-300"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed font-light">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-4 border-t border-border/30">
        <div className="container max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-light text-foreground mb-4 tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
              From keyword to campaign
              <br />
              <span className="font-semibold">in minutes</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Define your niche",
                desc: "Enter any keyword or topic. Select which platforms to mine. The engine handles the rest.",
              },
              {
                step: "02",
                title: "AI mines & analyzes",
                desc: "Our AI aggregates thousands of conversations and extracts the exact language patterns that matter.",
              },
              {
                step: "03",
                title: "Generate assets",
                desc: "Get your market intelligence report, viral hooks, ad copy, and content calendar instantly.",
              },
            ].map((item) => (
              <div key={item.step} className="relative">
                <div className="text-5xl font-light text-primary/15 mb-4 font-mono">{item.step}</div>
                <h3 className="text-base font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground font-light leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 border-t border-border/30">
        <div className="container max-w-2xl mx-auto text-center">
          <div className="relative p-12 rounded-2xl border border-primary/20 bg-primary/5 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />
            <h2 className="relative text-3xl font-light text-foreground mb-4 tracking-tight">
              Start mining the{" "}
              <span className="font-semibold">voice of your market</span>
            </h2>
            <p className="relative text-muted-foreground mb-8 font-light">
              Join marketers and copywriters who use real human language
              to create content that actually converts.
            </p>
            <Button
              size="lg"
              onClick={handleCTA}
              className="relative bg-primary text-primary-foreground hover:bg-primary/90 px-10 h-12 text-sm font-medium shadow-lg shadow-primary/25"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8 px-4">
        <div className="container flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">VoiceMining</span>
          </div>
          <p className="text-xs text-muted-foreground/50">
            AI-powered market intelligence platform
          </p>
        </div>
      </footer>
    </div>
  );
}
