import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  Command,
  FileText,
  LayoutDashboard,
  LogOut,
  Plus,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { useCommandPalette } from "@/components/CommandPalette";
import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [location, navigate] = useLocation();
  const { open: openPalette } = useCommandPalette();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex">
        {/* Left panel */}
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-card/30 border-r border-border/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold text-foreground tracking-tight">VoiceMining</span>
          </div>
          <div className="space-y-4">
            <p className="text-xs font-semibold text-primary uppercase tracking-widest">What you get</p>
            {[
              "Mine verbatim language from Reddit, YouTube, forums, and reviews",
              "Extract pain points, desires, and buying triggers automatically",
              "Generate viral hooks, Facebook ads, Skool posts, and email sequences",
              "Build market intelligence reports in minutes, not weeks",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <p className="text-sm text-muted-foreground leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/50">AI-Powered Market Intelligence Platform</p>
        </div>
        {/* Right panel */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-sm space-y-8">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sign in to your account</h1>
              <p className="text-sm text-muted-foreground">Access your market intelligence workspace</p>
            </div>
            <div className="space-y-4">
              <Button
                onClick={() => (window.location.href = getLoginUrl())}
                size="lg"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 h-12 text-sm font-medium"
              >
                Continue with VoiceMining
              </Button>
              <p className="text-xs text-center text-muted-foreground/60">
                By continuing, you agree to our Terms of Service and Privacy Policy
              </p>
            </div>
            <div className="pt-4 border-t border-border/30">
              <p className="text-xs text-muted-foreground/50 text-center">Secure authentication powered by OAuth 2.0</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
    { label: "Clients", icon: Users, path: "/clients" },
    { label: "Reports", icon: FileText, path: "/reports" },
    { label: "Trend Tracker", icon: TrendingUp, path: "/trends" },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left-side vertical nav */}
      <aside className="w-52 flex-shrink-0 flex flex-col border-r border-border/40 bg-card/20 sticky top-0 h-screen overflow-y-auto">
        {/* Logo */}
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2.5 px-5 py-5 flex-shrink-0"
        >
          <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="font-semibold text-base text-foreground tracking-tight">VoiceMining</span>
        </button>

        {/* New Search CTA */}
        <div className="px-3 pb-4">
          <Button
            onClick={() => navigate("/search/new")}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 text-sm font-medium shadow-sm shadow-primary/20 justify-start"
          >
            <Plus className="w-4 h-4 mr-2 flex-shrink-0" />
            New Search
          </Button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path || location.startsWith(item.path + "/");
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Command palette hint */}
        <div className="px-3 pb-2">
          <button
            onClick={openPalette}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground/60 hover:text-foreground hover:bg-card/60 border border-border/30 transition-all duration-150"
          >
            <Command className="w-3 h-3" />
            <span className="flex-1 text-left">Quick search</span>
            <kbd className="text-xs font-mono bg-card px-1.5 py-0.5 rounded border border-border/40">⌘K</kbd>
          </button>
        </div>

        {/* User menu at bottom */}
        <div className="px-3 py-4 border-t border-border/30 flex-shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-card/60 transition-all duration-150">
                <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary text-xs font-semibold">
                    {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
                  </span>
                </div>
                <span className="flex-1 text-left truncate text-sm">{user?.name?.split(" ")[0] ?? "Account"}</span>
                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-48">
              <div className="px-3 py-2">
                <p className="text-sm font-medium text-foreground truncate">{user?.name ?? "User"}</p>
                {user?.email && (
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => logout()}
                className="text-muted-foreground cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Page content */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
