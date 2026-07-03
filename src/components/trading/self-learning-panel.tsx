"use client";

import type { SelfLearningState } from "@/lib/trading/types";

interface Props {
  state: SelfLearningState | null;
}

export function SelfLearningPanel({ state }: Props) {
  if (!state) {
    return (
      <div className="bb-panel p-4">
        <div className="text-xs uppercase tracking-wider text-[var(--bb-muted)] mb-2">Self-Learning Module</div>
        <div className="text-[var(--bb-muted)] text-sm">No data</div>
      </div>
    );
  }

  const totalTrades = state.totalTrades;
  const sinceAdjustment = state.sinceLastAdjustment;
  const adjustmentProgress = (sinceAdjustment / 200) * 100;
  const recentAdjustments = state.adjustmentsLog.slice(-3).reverse();
  const setupEntries = Object.entries(state.setupStats)
    .filter(([_, s]) => s.trades > 0)
    .sort((a, b) => b[1].trades - a[1].trades)
    .slice(0, 8);

  return (
    <div className="bb-panel p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-[var(--bb-muted)]">Self-Learning Module</div>
        <div className="text-[10px] bb-mono text-[var(--bb-muted)]">{totalTrades} trades</div>
      </div>

      {/* Next adjustment progress */}
      <div className="bb-panel-2 p-2 mb-3">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-[var(--bb-muted)]">Next weight adjustment</span>
          <span className="bb-mono font-bold" style={{ color: "var(--bb-blue)" }}>
            {sinceAdjustment}/200
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-[#1f2937] overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${adjustmentProgress}%`, background: "var(--bb-blue)", transition: "width 0.4s ease" }}
          />
        </div>
        <div className="text-[9px] text-[var(--bb-muted)] mt-1">
          Weights tune only within [0.5×, 1.5×] — core strategy never altered
        </div>
      </div>

      {/* Setup stats */}
      <div className="flex-1 overflow-y-auto bb-scroll pr-1 min-h-0">
        <div className="text-[9px] uppercase tracking-wider text-[var(--bb-muted)] mb-1">Top Setups by Sample Count</div>
        {setupEntries.length === 0 && (
          <div className="text-[var(--bb-muted)] text-xs text-center py-3">No trades recorded yet</div>
        )}
        {setupEntries.map(([key, s]) => {
          const wrColor =
            s.winRate >= 60 ? "var(--bb-green)" : s.winRate >= 45 ? "var(--bb-amber)" : "var(--bb-red)";
          const wColor =
            s.weight > 1.1 ? "var(--bb-green)" : s.weight < 0.9 ? "var(--bb-red)" : "var(--bb-muted)";
          return (
            <div key={key} className="py-1 border-b border-[var(--bb-border)] last:border-0 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--bb-text)] truncate" title={key}>
                  {key}
                </span>
                <span className="bb-mono font-bold" style={{ color: wColor }}>
                  ×{s.weight.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[9px] text-[var(--bb-muted)] bb-mono">
                <span>{s.trades} trades</span>
                <span style={{ color: wrColor }}>{s.winRate.toFixed(0)}% WR</span>
                <span style={{ color: s.avgPnl >= 0 ? "var(--bb-green)" : "var(--bb-red)" }}>
                  {s.avgPnl >= 0 ? "+" : ""}${s.avgPnl.toFixed(1)} avg
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Adjustment log */}
      {recentAdjustments.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[var(--bb-border)]">
          <div className="text-[9px] uppercase tracking-wider text-[var(--bb-muted)] mb-1">Recent Adjustments</div>
          {recentAdjustments.map((a, i) => (
            <div key={i} className="text-[9px] text-[var(--bb-muted)] mb-1 leading-tight">
              <span className="bb-mono text-[var(--bb-blue)]">{new Date(a.at).toLocaleTimeString()}</span>
              <div className="text-[var(--bb-text)] truncate" title={a.summary}>
                {a.summary}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
