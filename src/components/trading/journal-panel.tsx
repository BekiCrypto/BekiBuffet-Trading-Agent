"use client";

import type { TradeRecord } from "@/lib/trading/types";

interface Props {
  trades: TradeRecord[];
}

export function JournalPanel({ trades }: Props) {
  const recent = trades.slice(-30).reverse();

  // Aggregate stats
  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl < 0).length;
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  const avgMfe = trades.length > 0 ? trades.reduce((s, t) => s + t.mfe, 0) / trades.length : 0;
  const avgMae = trades.length > 0 ? trades.reduce((s, t) => s + t.mae, 0) / trades.length : 0;

  return (
    <div className="bb-panel p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-[var(--bb-muted)]">Trade Journal</div>
        <div className="text-[10px] text-[var(--bb-muted)]">{trades.length} recorded</div>
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-4 gap-1 mb-3">
        <Stat label="Win Rate" value={`${winRate.toFixed(0)}%`} color={winRate >= 50 ? "var(--bb-green)" : "var(--bb-red)"} />
        <Stat label="W/L" value={`${wins}/${losses}`} color="var(--bb-text)" />
        <Stat label="Total PnL" value={`$${totalPnl.toFixed(0)}`} color={totalPnl >= 0 ? "var(--bb-green)" : "var(--bb-red)"} />
        <Stat label="Avg MFE/MAE" value={`${avgMfe.toFixed(1)}/${avgMae.toFixed(1)}`} color="var(--bb-blue)" />
      </div>

      <div className="flex-1 overflow-y-auto bb-scroll pr-1 min-h-0">
        {recent.length === 0 && (
          <div className="text-[var(--bb-muted)] text-xs text-center py-4">No trades yet</div>
        )}
        {recent.map((t) => {
          const isWin = t.pnl > 0;
          const color = isWin ? "var(--bb-green)" : "var(--bb-red)";
          return (
            <div key={t.id} className="py-1.5 border-b border-[var(--bb-border)] last:border-0 text-[10px]">
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-2">
                  <span className="bb-mono font-bold" style={{ color }}>
                    {t.id}
                  </span>
                  <span className="text-[var(--bb-muted)]">{t.asset}</span>
                  <span className="text-[9px] text-[var(--bb-muted)] bb-mono">{t.setup}</span>
                </div>
                <span className="bb-mono font-bold" style={{ color }}>
                  {isWin ? "+" : ""}${t.pnl.toFixed(1)}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1 text-[9px] text-[var(--bb-muted)] bb-mono">
                <span>Regime: {t.marketRegime}</span>
                <span>Score: {t.entryScore}</span>
                <span>MFE: {t.mfe.toFixed(1)}</span>
                <span>Exit: {t.exitReason}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bb-panel-2 p-1.5">
      <div className="text-[8px] uppercase text-[var(--bb-muted)] leading-tight">{label}</div>
      <div className="text-xs bb-mono font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
