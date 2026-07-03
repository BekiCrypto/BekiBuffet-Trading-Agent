"use client";

import { useSaaS } from "./saas-provider";
import { useBekiBuffet } from "@/lib/trading/agent";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

export function Dashboard() {
  const { setView, activeAsset, setActiveAsset } = useSaaS();
  const { data: session } = useSession();
  const state = useBekiBuffet();
  const [brokers, setBrokers] = useState<any[]>([]);
  const [sub, setSub] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/broker").then(r => r.json()).then(d => setBrokers(d.brokers ?? []));
    fetch("/api/subscription").then(r => r.json()).then(d => setSub(d.subscription));
    fetch("/api/activity?limit=20").then(r => r.json()).then(d => setActivity(d.activity ?? []));
  }, []);

  const tier = (session?.user as any)?.tier ?? "FREE";
  const credits = (session?.user as any)?.backtestCredits ?? 0;
  const trialEnd = sub?.trialEndsAt ? new Date(sub.trialEndsAt) : null;
  const trialDaysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : null;

  const recentDecisions = state.decisionLog.slice(-8).reverse();

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-0.5">Welcome back, {session?.user?.name?.split(" ")[0] ?? "Trader"}</h1>
          <p className="text-sm text-[var(--bb-muted)]">Your autonomous trading agent is ready.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setView("terminal")} className="text-sm font-bold px-4 py-2 rounded-md transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #58a6ff, #bc8cff)", color: "#0a0e14" }}>
            ▶ Open Live Terminal
          </button>
        </div>
      </div>

      {/* Trial banner */}
      {trialDaysLeft !== null && trialDaysLeft > 0 && (
        <div className="bb-panel p-3 mb-4 flex items-center justify-between" style={{ background: "rgba(88, 166, 255, 0.08)", borderColor: "rgba(88, 166, 255, 0.3)" }}>
          <div className="flex items-center gap-2">
            <span className="text-base">✦</span>
            <div>
              <div className="text-sm font-bold text-[var(--bb-blue)]">Pro Trial — {trialDaysLeft} days left</div>
              <div className="text-xs text-[var(--bb-muted)]">Full access to AI Agent, Edge Discovery, and live broker connections.</div>
            </div>
          </div>
          <button onClick={() => setView("subscription")} className="text-xs font-bold px-3 py-1.5 rounded" style={{ background: "var(--bb-blue)", color: "#0a0e14" }}>
            Upgrade
          </button>
        </div>
      )}

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Account Equity" value={`$${state.equity.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} sub={`Balance $${state.balance.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} color={state.equity >= state.balance ? "var(--bb-green)" : "var(--bb-red)"} />
        <StatCard label="Floating PnL" value={`${state.floatingPnl >= 0 ? "+" : ""}$${state.floatingPnl.toFixed(0)}`} sub={`${state.campaigns.filter(c => c.status !== "Closed").length} active campaigns`} color={state.floatingPnl >= 0 ? "var(--bb-green)" : "var(--bb-red)"} />
        <StatCard label="Agent Status" value={state.mode} sub={`${state.ticksProcessed} ticks processed`} color={state.mode === "Running" ? "var(--bb-green)" : state.mode === "Halted" ? "var(--bb-red)" : "var(--bb-amber)"} />
        <StatCard label="Decisions Today" value={`${state.status.decisionsTaken}`} sub={`${state.status.decisionsRejected} rejected · ${state.status.decisionsWaiting} waiting`} color="var(--bb-blue)" />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <ActionCard icon="✦" label="Ask AI Agent" desc="Get a meta-decision on any asset" onClick={() => setView("ai-agent")} color="#bc8cff" />
        <ActionCard icon="⟲" label="Run Backtest" desc={`${credits} credits remaining`} onClick={() => setView("backtest")} color="#58a6ff" />
        <ActionCard icon="◎" label="Discover Edges" desc="Autonomous parameter search" onClick={() => setView("edge")} color="#3fb950" />
        <ActionCard icon="⌁" label="Connect Broker" desc={`${brokers.length} connected`} onClick={() => setView("brokers")} color="#d29922" />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent decisions */}
        <div className="bb-panel p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)]">Recent Agent Decisions</h3>
            <button onClick={() => setView("terminal")} className="text-xs text-[var(--bb-blue)] hover:underline">View all →</button>
          </div>
          {recentDecisions.length === 0 ? (
            <div className="text-center py-8 text-[var(--bb-muted)] text-sm">
              No decisions yet. <button onClick={() => setView("terminal")} className="text-[var(--bb-blue)] hover:underline">Open the live terminal</button> and start the agent.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto bb-scroll">
              {recentDecisions.map((d) => (
                <div key={d.id} className="flex items-center gap-3 py-2 border-b border-[var(--bb-border)] last:border-0">
                  <div className="text-[10px] bb-mono text-[var(--bb-muted)] w-16">{new Date(d.time).toLocaleTimeString("en-US", { hour12: false })}</div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: `${actionColor(d.action)}20`, color: actionColor(d.action), border: `1px solid ${actionColor(d.action)}40` }}>{d.action.toUpperCase()}</span>
                  <span className="text-xs bb-mono font-bold">{d.asset}</span>
                  {d.direction && <span className="text-xs font-bold" style={{ color: d.direction === "Long" ? "var(--bb-green)" : "var(--bb-red)" }}>{d.direction}</span>}
                  {d.score !== undefined && <span className="text-[10px] text-[var(--bb-muted)] bb-mono">{d.score}/100</span>}
                  <span className="text-xs text-[var(--bb-muted)] truncate flex-1">{d.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Asset overview */}
        <div className="bb-panel p-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)] mb-3">Asset Overview</h3>
          <div className="space-y-1.5">
            {(["XAUUSD", "EURUSD", "GBPUSD", "EURJPY", "BTCUSD"] as const).map((a) => {
              const snap = state.snapshots[a];
              const verdict = snap?.confluence?.verdict;
              const score = snap?.confluence?.total ?? 0;
              const isActive = a === activeAsset;
              return (
                <button
                  key={a}
                  onClick={() => {
                    setActiveAsset(a);
                    setView("terminal");
                  }}
                  className="w-full flex items-center justify-between p-2 rounded text-xs hover:bg-[var(--bb-panel-2)] transition-colors"
                  style={{ background: isActive ? "var(--bb-panel-2)" : "transparent", border: `1px solid ${isActive ? "var(--bb-border)" : "transparent"}` }}
                >
                  <span className="font-bold bb-mono">{a}</span>
                  <div className="flex items-center gap-2">
                    {snap ? (
                      <>
                        <span className="text-[var(--bb-muted)] bb-mono">{snap.price.toFixed(snap.price > 1000 ? 1 : 4)}</span>
                        <span className="text-[10px] px-1 rounded font-bold" style={{ background: `${verdictColor(verdict)}20`, color: verdictColor(verdict) }}>{verdict ?? "—"}</span>
                        <span className="bb-mono font-bold" style={{ color: verdictColor(verdict) }}>{score}</span>
                      </>
                    ) : (
                      <span className="text-[var(--bb-muted)]">—</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Connected brokers */}
      <div className="bb-panel p-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)]">Connected Broker Accounts</h3>
          <button onClick={() => setView("brokers")} className="text-xs text-[var(--bb-blue)] hover:underline">Manage →</button>
        </div>
        {brokers.length === 0 ? (
          <div className="text-center py-6 text-[var(--bb-muted)] text-sm">
            No brokers connected. <button onClick={() => setView("brokers")} className="text-[var(--bb-blue)] hover:underline">Connect your first account</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {brokers.map((b) => (
              <div key={b.id} className="bb-panel-2 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">{b.accountName}</span>
                  <span className="text-[9px] px-1.5 rounded font-bold" style={{ background: b.isConnected ? "rgba(63, 185, 80, 0.15)" : "rgba(125, 133, 144, 0.1)", color: b.isConnected ? "var(--bb-green)" : "var(--bb-muted)" }}>
                    {b.isConnected ? "● LIVE" : "○ OFFLINE"}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--bb-muted)] mb-1">{b.brokerType} · {b.accountId}</div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs bb-mono font-bold">${b.equity.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                  <span className="text-[10px] text-[var(--bb-muted)]">equity</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bb-panel p-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--bb-muted)]">{label}</div>
      <div className="text-xl font-bold bb-mono mt-0.5" style={{ color }}>{value}</div>
      <div className="text-[10px] text-[var(--bb-muted)] mt-0.5">{sub}</div>
    </div>
  );
}

function ActionCard({ icon, label, desc, onClick, color }: { icon: string; label: string; desc: string; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} className="bb-panel p-3 text-left hover:border-[var(--bb-blue)] transition-all">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded flex items-center justify-center text-sm font-bold" style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>{icon}</div>
        <div className="text-sm font-bold">{label}</div>
      </div>
      <div className="text-[10px] text-[var(--bb-muted)]">{desc}</div>
    </button>
  );
}

function actionColor(action: string): string {
  return action === "Open" || action === "Scale" ? "#3fb950"
    : action === "Close" ? "#bc8cff"
    : action === "Reject" ? "#f85149"
    : action === "Wait" ? "#7d8590"
    : action === "Trail" || action === "Breakeven" ? "#58a6ff"
    : "#7d8590";
}

function verdictColor(verdict?: string): string {
  return verdict === "Trade" ? "#3fb950" : verdict === "Wait" ? "#d29922" : verdict === "Reject" ? "#f85149" : "#7d8590";
}
