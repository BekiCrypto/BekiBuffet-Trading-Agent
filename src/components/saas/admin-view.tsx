"use client";

import { useSaaS } from "./saas-provider";
import { useBekiBuffet } from "@/lib/trading/agent";

export function Admin() {
  const { setView } = useSaaS();
  const state = useBekiBuffet();

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-0.5">Agent Telemetry</h1>
        <p className="text-sm text-[var(--bb-muted)]">Internal agent state, engine performance, and self-learning diagnostics.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Ticks Processed" value={state.ticksProcessed.toString()} color="var(--bb-blue)" />
        <Stat label="Uptime" value={`${(state.status.uptime / 60000).toFixed(1)}m`} color="var(--bb-text)" />
        <Stat label="Campaigns Active" value={state.campaigns.filter(c => c.status !== "Closed").length.toString()} color="var(--bb-green)" />
        <Stat label="Closed Trades" value={state.closedTrades.length.toString()} color="var(--bb-purple)" />
        <Stat label="Decisions Taken" value={state.status.decisionsTaken.toString()} color="var(--bb-green)" />
        <Stat label="Decisions Rejected" value={state.status.decisionsRejected.toString()} color="var(--bb-red)" />
        <Stat label="Decisions Waiting" value={state.status.decisionsWaiting.toString()} color="var(--bb-amber)" />
        <Stat label="Consecutive Losses" value={state.consecutiveLosses.toString()} color={state.consecutiveLosses >= 3 ? "var(--bb-red)" : "var(--bb-green)"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Self-learning snapshot */}
        <div className="bb-panel p-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)] mb-3">Self-Learning Module</h3>
          <div className="space-y-2 text-xs">
            <Row label="Total trades recorded" value={state.selfLearning.totalTrades.toString()} />
            <Row label="Since last adjustment" value={`${state.selfLearning.sinceLastAdjustment}/200`} />
            <Row label="Adjustments made" value={state.selfLearning.adjustmentsLog.length.toString()} />
            <Row label="Tracked setups" value={Object.keys(state.selfLearning.setupStats).length.toString()} />
            <Row label="Setups with samples" value={Object.values(state.selfLearning.setupStats).filter(s => s.trades > 0).length.toString()} />
          </div>
          <div className="mt-4">
            <div className="text-[10px] uppercase text-[var(--bb-muted)] mb-2">All Setup Weights</div>
            <div className="space-y-1 max-h-60 overflow-y-auto bb-scroll">
              {Object.entries(state.selfLearning.setupStats)
                .sort((a, b) => b[1].trades - a[1].trades)
                .map(([k, s]) => (
                  <div key={k} className="flex items-center justify-between text-[10px] py-1 border-b border-[var(--bb-border)] last:border-0">
                    <span className="font-bold">{k}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[var(--bb-muted)] bb-mono">{s.trades}t</span>
                      <span className="bb-mono" style={{ color: s.winRate >= 55 ? "var(--bb-green)" : s.winRate >= 45 ? "var(--bb-amber)" : "var(--bb-red)" }}>{s.winRate.toFixed(0)}% WR</span>
                      <span className="bb-mono font-bold" style={{ color: s.weight > 1.1 ? "var(--bb-green)" : s.weight < 0.9 ? "var(--bb-red)" : "var(--bb-muted)" }}>×{s.weight.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Equity protection */}
        <div className="bb-panel p-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)] mb-3">Equity Protection</h3>
          <div className="space-y-2 text-xs">
            <Row label="Day Start Equity" value={`$${state.dayStartEquity.toLocaleString()}`} />
            <Row label="Current Equity" value={`$${state.equity.toLocaleString()}`} color={state.equity >= state.dayStartEquity ? "var(--bb-green)" : "var(--bb-red)"} />
            <Row label="Floating PnL" value={`${state.floatingPnl >= 0 ? "+" : ""}$${state.floatingPnl.toFixed(0)}`} color={state.floatingPnl >= 0 ? "var(--bb-green)" : "var(--bb-red)"} />
            <Row label="Consecutive Losses" value={`${state.consecutiveLosses}/4`} color={state.consecutiveLosses >= 3 ? "var(--bb-red)" : "var(--bb-text)"} />
            <Row label="Agent Mode" value={state.mode} color={state.mode === "Running" ? "var(--bb-green)" : state.mode === "Halted" ? "var(--bb-red)" : "var(--bb-amber)"} />
          </div>
          <div className="mt-4 p-3 rounded" style={{ background: "var(--bb-panel-2)" }}>
            <div className="text-[10px] uppercase text-[var(--bb-muted)] mb-1">Halt Conditions</div>
            <ul className="text-[10px] text-[var(--bb-muted)] space-y-0.5">
              <li>• Equity drops below 50% of day start → HALT</li>
              <li>• Daily loss reaches 3% → block new entries</li>
              <li>• 4 consecutive losses → block new entries</li>
              <li>• Max portfolio exposure 6% → block new entries</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Adjustment log */}
      <div className="bb-panel p-4 mt-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)] mb-3">Self-Learning Adjustment Log</h3>
        {state.selfLearning.adjustmentsLog.length === 0 ? (
          <div className="text-center py-6 text-xs text-[var(--bb-muted)]">No adjustments yet. Weights tune every 200 trades.</div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto bb-scroll">
            {state.selfLearning.adjustmentsLog.slice().reverse().slice(0, 10).map((a, i) => (
              <div key={i} className="text-xs p-2 rounded" style={{ background: "var(--bb-panel-2)" }}>
                <div className="text-[10px] text-[var(--bb-muted)] bb-mono mb-1">{new Date(a.at).toLocaleString()}</div>
                <div className="text-[var(--bb-text)]">{a.summary}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-center mt-6 text-xs text-[var(--bb-muted)]">
        <button onClick={() => setView("dashboard")} className="hover:text-[var(--bb-text)]">← Back to dashboard</button>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bb-panel p-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--bb-muted)]">{label}</div>
      <div className="text-xl font-bold bb-mono mt-0.5" style={{ color }}>{value}</div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-[var(--bb-border)] last:border-0">
      <span className="text-[var(--bb-muted)]">{label}</span>
      <span className="font-bold bb-mono" style={{ color: color ?? "var(--bb-text)" }}>{value}</span>
    </div>
  );
}
