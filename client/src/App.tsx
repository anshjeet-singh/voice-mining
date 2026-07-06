import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import ErrorBoundary from "./components/ErrorBoundary";
import { CommandPaletteProvider } from "./components/CommandPalette";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import NewSearch from "./pages/NewSearch";
import SearchResults from "./pages/SearchResults";
import ReportView from "./pages/ReportView";
import ContentCalendar from "./pages/ContentCalendar";
import SavedReports from "./pages/SavedReports";
import SharedReport from "./pages/SharedReport";
import BulkProgress from "./pages/BulkProgress";
import NicheComparison from "./pages/NicheComparison";
import Vault from "./pages/Vault";
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
            <Route path="/" component={Home} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/search/new" component={NewSearch} />
            <Route path="/search/bulk" component={BulkProgress} />
            <Route path="/search/:id" component={SearchResults} />
            <Route path="/report/:id" component={ReportView} />
            <Route path="/share/:token" component={SharedReport} />
            <Route path="/calendar" component={ContentCalendar} />
            <Route path="/calendar/:searchId" component={ContentCalendar} />
            <Route path="/compare" component={NicheComparison} />
            <Route path="/reports" component={SavedReports} />
            <Route path="/vault" component={Vault} />
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
