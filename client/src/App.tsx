import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import ErrorBoundary from "./components/ErrorBoundary";
import { CommandPaletteProvider } from "./components/CommandPalette";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import ClientStudio from "./pages/ClientStudio";
import NewSearch from "./pages/NewSearch";
import SearchResults from "./pages/SearchResults";
import ReportView from "./pages/ReportView";
import SavedReports from "./pages/SavedReports";
import SharedReport from "./pages/SharedReport";
import RecordScripts from "./pages/RecordScripts";
import ClientShare from "./pages/ClientShare";
import Portal from "./pages/Portal";
import NicheComparison from "./pages/NicheComparison";
import TrendTracker from "./pages/TrendTracker";

function Router() {
  const [location] = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: "easeInOut" }}
      >
        <ErrorBoundary>
          <Switch>
            {/* No public landing page: this app is the operator's back end. */}
            <Route path="/" component={Dashboard} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/clients" component={Clients} />
            <Route path="/clients/:id/studio" component={ClientStudio} />
            <Route path="/clients/:id" component={ClientDetail} />
            <Route path="/search/new" component={NewSearch} />
            <Route path="/search/:id" component={SearchResults} />
            <Route path="/report/:id" component={ReportView} />
            <Route path="/share/:token" component={SharedReport} />
            <Route path="/record/:token" component={RecordScripts} />
            <Route path="/c/:token" component={ClientShare} />
            {/* Client portal: email + password login, read-only client view. */}
            <Route path="/portal" component={Portal} />
            <Route path="/portal/:tab" component={Portal} />
            <Route path="/compare" component={NicheComparison} />
            <Route path="/reports" component={SavedReports} />
            <Route path="/trends" component={TrendTracker} />
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
        </ErrorBoundary>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster
            theme="dark"
            toastOptions={{
              style: {
                background: "oklch(0.14 0.010 265)",
                border: "1px solid oklch(0.22 0.010 265)",
                color: "oklch(0.96 0.005 265)",
              },
            }}
          />
          <CommandPaletteProvider>
            <Router />
          </CommandPaletteProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
