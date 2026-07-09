import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { trpc } from "@/lib/trpc";
import {
  FileText,
  LayoutDashboard,
  Plus,
  TrendingUp,
  Users,
} from "lucide-react";

const CommandPaletteContext = createContext<{ open: () => void }>({ open: () => {} });

export const useCommandPalette = () => useContext(CommandPaletteContext);

/**
 * Global command palette (Cmd+K) with fuzzy search across pages, clients, and
 * reports. Also wires app-wide keyboard shortcuts:
 *   Cmd+K palette, N new search, C clients (single keys only outside inputs)
 */
export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();

  const { data: reports } = trpc.reports.list.useQuery(undefined, { enabled: open });
  const { data: clients } = trpc.clients.list.useQuery(undefined, { enabled: open });

  const go = useCallback(
    (path: string) => {
      setOpen(false);
      navigate(path);
    },
    [navigate]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Cmd/Ctrl+K opens the palette (works everywhere)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      // Single-key shortcuts when not typing
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        navigate("/search/new");
      } else if (e.key.toLowerCase() === "c") {
        e.preventDefault();
        navigate("/clients");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  return (
    <CommandPaletteContext.Provider value={{ open: () => setOpen(true) }}>
      {children}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search clients, reports, or jump anywhere..." />
        <CommandList>
          <CommandEmpty>Nothing found. Try a different search.</CommandEmpty>
          <CommandGroup heading="Go to">
            <CommandItem onSelect={() => go("/search/new")}>
              <Plus className="w-4 h-4 mr-2" />
              New Search
              <span className="ml-auto text-xs text-muted-foreground">N</span>
            </CommandItem>
            <CommandItem onSelect={() => go("/dashboard")}>
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Dashboard
            </CommandItem>
            <CommandItem onSelect={() => go("/clients")}>
              <Users className="w-4 h-4 mr-2" />
              Clients
              <span className="ml-auto text-xs text-muted-foreground">C</span>
            </CommandItem>
            <CommandItem onSelect={() => go("/reports")}>
              <FileText className="w-4 h-4 mr-2" />
              Saved Reports
            </CommandItem>
            <CommandItem onSelect={() => go("/trends")}>
              <TrendingUp className="w-4 h-4 mr-2" />
              Trend Tracker
            </CommandItem>
          </CommandGroup>

          {(clients?.length ?? 0) > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Clients">
                {(clients ?? []).slice(0, 25).map((client) => (
                  <CommandItem key={`c-${client.id}`} onSelect={() => go(`/clients/${client.id}`)}>
                    <Users className="w-4 h-4 mr-2 text-primary" />
                    <span className="truncate">{client.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {(reports?.length ?? 0) > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Reports">
                {(reports ?? []).slice(0, 25).map((report) => (
                  <CommandItem key={`r-${report.id}`} onSelect={() => go(`/report/${report.id}`)}>
                    <FileText className="w-4 h-4 mr-2 text-primary" />
                    <span className="truncate">{report.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </CommandPaletteContext.Provider>
  );
}
