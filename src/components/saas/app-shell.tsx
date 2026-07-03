"use client";

import { useSession, signOut } from "next-auth/react";
import { useSaaS } from "./saas-provider";
import { useState, type ReactNode } from "react";

interface NavItem {
  id: string;
  label: string;
  icon: string;
  view: "dashboard" | "terminal" | "brokers" | "backtest" | "edge" | "ai-agent" | "subscription" | "settings" | "admin";
  badge?: string;
  requiredTier?: string[];
}

const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "▣", view: "dashboard" },
  { id: "terminal", label: "Live Terminal", icon: "◉", view: "terminal", badge: "LIVE" },
  { id: "ai-agent", label: "AI Agent", icon: "✦", view: "ai-agent", badge: "AI", requiredTier: ["PRO", "ELITE", "INSTITUTIONAL"] },
  { id: "backtest", label: "Backtesting", icon: "⟲", view: "backtest" },
  { id: "edge", label: "Edge Discovery", icon: "◎", view: "edge", badge: "AUTO", requiredTier: ["PRO", "ELITE", "INSTITUTIONAL"] },
  { id: "brokers", label: "Brokers", icon: "⌁", view: "brokers" },
  { id: "subscription", label: "Subscription", icon: "★", view: "subscription" },
  { id: "settings", label: "Settings", icon: "⚙", view: "settings" },
  { id: "admin", label: "Admin", icon: "⚑", view: "admin" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { view, setView } = useSaaS();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  const tier = (session?.user as any)?.tier ?? "FREE";

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bb-bg)", color: "var(--bb-text)" }}>
      {/* Sidebar */}
      <aside
        className={`fixed md:relative z-40 md:z-0 w-60 h-screen md:h-screen flex-shrink-0 border-r border-[var(--bb-border)] flex flex-col transition-transform ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        style={{ background: "var(--bb-panel)" }}
      >
        <div className="p-4 border-b border-[var(--bb-border)]">
          <button onClick={() => setView("dashboard")} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-sm" style={{ background: "linear-gradient(135deg, #58a6ff, #bc8cff)", color: "#0a0e14" }}>B</div>
            <div>
              <div className="text-sm font-bold">BekiBuffet</div>
              <div className="text-[9px] text-[var(--bb-muted)] uppercase tracking-wider">{tier} Tier</div>
            </div>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto bb-scroll p-2">
          {NAV.map((item) => {
            const locked = item.requiredTier && !item.requiredTier.includes(tier);
            const isActive = view === item.view;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (locked) {
                    setView("subscription");
                  } else {
                    setView(item.view);
                    setMobileOpen(false);
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all mb-0.5 group"
                style={{
                  background: isActive ? "var(--bb-panel-2)" : "transparent",
                  color: isActive ? "var(--bb-text)" : "var(--bb-muted)",
                  border: isActive ? "1px solid var(--bb-border)" : "1px solid transparent",
                }}
              >
                <span className={`text-base ${isActive ? "text-[var(--bb-blue)]" : ""}`}>{item.icon}</span>
                <span className="flex-1 text-left font-medium">{item.label}</span>
                {item.badge && (
                  <span
                    className="text-[8px] px-1 rounded font-bold"
                    style={{
                      background: item.badge === "LIVE" ? "rgba(63, 185, 80, 0.15)" : item.badge === "AI" ? "rgba(188, 140, 255, 0.15)" : "rgba(88, 166, 255, 0.15)",
                      color: item.badge === "LIVE" ? "var(--bb-green)" : item.badge === "AI" ? "var(--bb-purple)" : "var(--bb-blue)",
                    }}
                  >
                    {item.badge}
                  </span>
                )}
                {locked && <span className="text-[10px]">🔒</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[var(--bb-border)]">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "var(--bb-panel-2)", border: "1px solid var(--bb-border)" }}>
              {session?.user?.name?.[0]?.toUpperCase() ?? session?.user?.email?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate">{session?.user?.name ?? "Trader"}</div>
              <div className="text-[10px] text-[var(--bb-muted)] truncate">{session?.user?.email}</div>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full text-xs text-[var(--bb-muted)] hover:text-[var(--bb-red)] py-1.5 rounded transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {mobileOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden border-b border-[var(--bb-border)] p-3 flex items-center justify-between" style={{ background: "var(--bb-panel)" }}>
          <button onClick={() => setMobileOpen(true)} className="text-lg">☰</button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold" style={{ background: "linear-gradient(135deg, #58a6ff, #bc8cff)", color: "#0a0e14" }}>B</div>
            <span className="text-sm font-bold">BekiBuffet</span>
          </div>
          <div className="w-6" />
        </header>
        <main className="flex-1 overflow-y-auto bb-scroll">{children}</main>
      </div>
    </div>
  );
}
