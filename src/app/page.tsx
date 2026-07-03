"use client";

import { SaaSProvider, useSaaS } from "@/components/saas/saas-provider";
import { AppShell } from "@/components/saas/app-shell";
import { Landing } from "@/components/saas/landing";
import { SignIn } from "@/components/saas/signin";
import { Dashboard } from "@/components/saas/dashboard";
import { Terminal } from "@/components/saas/terminal";
import { Brokers } from "@/components/saas/brokers-view";
import { Backtest } from "@/components/saas/backtest-view";
import { Edge } from "@/components/saas/edge-view";
import { AIAgent } from "@/components/saas/ai-agent-view";
import { Subscription } from "@/components/saas/subscription-view";
import { Settings } from "@/components/saas/settings-view";
import { Admin } from "@/components/saas/admin-view";

function Router() {
  const { view } = useSaaS();

  // Public views (no auth required)
  if (view === "landing") return <Landing />;
  if (view === "signin") return <SignIn />;

  // Authenticated views (wrapped in app shell)
  return (
    <AppShell>
      {view === "dashboard" && <Dashboard />}
      {view === "terminal" && <Terminal />}
      {view === "brokers" && <Brokers />}
      {view === "backtest" && <Backtest />}
      {view === "edge" && <Edge />}
      {view === "ai-agent" && <AIAgent />}
      {view === "subscription" && <Subscription />}
      {view === "settings" && <Settings />}
      {view === "admin" && <Admin />}
    </AppShell>
  );
}

export default function Home() {
  return (
    <SaaSProvider>
      <Router />
    </SaaSProvider>
  );
}
