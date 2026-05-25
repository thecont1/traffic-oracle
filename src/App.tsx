import { lazy, Suspense, useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

const queryClient = new QueryClient();

/* ── Viewport-based shell selection ─────────────────────────────── */
const MOBILE_BREAKPOINT = 768;

function useIsMobileView() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= MOBILE_BREAKPOINT : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
    handler(mq);
    mq.addEventListener("change", handler as any);
    return () => mq.removeEventListener("change", handler as any);
  }, []);
  return isMobile;
}

/* ── Lazy-loaded shells ─────────────────────────────────────────── */
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const MobileApp = lazy(() => import("@/mobile/MobileApp"));
const NotFound = lazy(() => import("@/pages/not-found"));

function Shell() {
  const isMobile = useIsMobileView();

  return (
    <Suspense fallback={
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", fontFamily: "var(--app-font-display)",
        fontSize: 14, color: "#888",
      }}>
        Loading…
      </div>
    }>
      {isMobile ? (
        <MobileApp />
      ) : (
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route component={NotFound} />
        </Switch>
      )}
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Shell />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
