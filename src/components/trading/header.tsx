"use client";

import type { AgentMode, AgentStatus } from "@/lib/trading/types";
import { ASSET_PRESETS } from "@/lib/trading/presets";
import type { AssetSymbol } from "@/lib/trading/types";

interface Props {
  mode: AgentMode;
  status: AgentStatus;
  balance: number;
  equity: number;
  floatingPnl: number;
  consecutiveLosses: number;
  tickSpeedMs: number;
  activeAsset: AssetSymbol;
  onToggleMode: () => void;
  onReset: () => void;
  onSpeedChange: (ms: number) => void;
}

export function Header({
  mode,
  status,
  balance,
  equity,
  floatingPnl,
  consecutiveLosses,
  tickSpeedMs,
  activeAsset,
  onToggleMode,
  onReset,
  onSpeedChange,
}: Props) {
  const preset = ASSET_PRESETS[activeAsset];
  const uptimeMin = status.uptime / 60000;
  const pnlColor = floatingPnl >= 0 ? "var(--bb-green)" : "var(--bb-red)";

  return (
    <header className="bb-panel p-3 mb-3">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md flex items-center justify-center font-bold text-lg" style={{ background: "linear-gradient(135deg, #58a6ff, #bc8cff)", color: "#0a0e14" }}>
            B
          </div>
          <div>
            <div className="text-base font-bold tracking-tight flex items-center gap-2">
              BekiBuffet
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bb-panel-2)] text-[var(--bb-muted)] font-normal">
                Autonomous Trading Agent
              </span>
            </div>
            <div className="text-[10px] text-[var(--bb-muted)] flex items-center gap-2">
              <span>{preset.symbol} · {preset.session}</span>
              <span>·</span>
              <span>Bias {preset.biasTimeframe} / Exec {preset.executionTimeframe}</span>
            </div>
          </div>
        </div>

        {/* Mode + status */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: "var(--bb-panel-2)" }}>
            <div
              className={`w-2 h-2 rounded-full ${mode === "Running" ? "bb-pulse" : ""}`}
              style={{
                background: mode === "Running" ? "var(--bb-green)" : mode === "Halted" ? "var(--bb-red)" : "var(--bb-amber)",
              }}
            />
            <span className="text-xs font-bold" style={{ color: mode === "Running" ? "var(--bb-green)" : mode === "Halted" ? "var(--bb-red)" : "var(--bb-amber)" }}>
              {mode.toUpperCase()}
            </span>
          </div>
          <button
            onClick={onToggleMode}
            className="px-3 py-1.5 rounded-md text-xs font-bold transition-all hover:opacity-90"
            style={{
              background: mode === "Running" ? "rgba(248, 81, 73, 0.15)" : "rgba(63, 185, 80, 0.15)",
              color: mode === "Running" ? "var(--bb-red)" : "var(--bb-green)",
              border: `1px solid ${mode === "Running" ? "var(--bb-red)" : "var(--bb-green)"}`,
            }}
          >
            {mode === "Running" ? "❚❚ Pause" : "▶ Start"}
          </button>
          <button
            onClick={onReset}
            className="px-2.5 py-1.5 rounded-md text-xs font-bold transition-all hover:opacity-90"
            style={{
              background: "rgba(125, 133, 144, 0.1)",
              color: "var(--bb-muted)",
              border: "1px solid var(--bb-border)",
            }}
            title="Reset agent and simulator"
          >
            ↺ Reset
          </button>
          <select
            value={tickSpeedMs}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            className="bg-[var(--bb-panel-2)] text-xs px-2 py-1.5 rounded-md border border-[var(--bb-border)] text-[var(--bb-text)]"
          >
            <option value={3000}>0.3x</option>
            <option value={1500}>1x</option>
            <option value={800}>2x</option>
            <option value={400}>4x</option>
            <option value={200}>8x</option>
          </select>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-3">
        <HeaderStat label="Balance" value={`$${balance.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} color="var(--bb-text)" />
        <HeaderStat label="Equity" value={`$${equity.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} color={equity >= balance ? "var(--bb-green)" : "var(--bb-red)"} />
        <HeaderStat label="Floating PnL" value={`${floatingPnl >= 0 ? "+" : ""}$${floatingPnl.toFixed(0)}`} color={pnlColor} />
        <HeaderStat label="Uptime" value={`${uptimeMin.toFixed(1)}m`} color="var(--bb-muted)" />
        <HeaderStat label="Decisions" value={`${status.decisionsTaken}/${status.decisionsRejected}/${status.decisionsWaiting}`} sub="open/reject/wait" color="var(--bb-blue)" />
        <HeaderStat label="Consec Loss" value={`${consecutiveLosses}`} color={consecutiveLosses >= 3 ? "var(--bb-red)" : consecutiveLosses >= 2 ? "var(--bb-amber)" : "var(--bb-green)"} />
      </div>
    </header>
  );
}

function HeaderStat({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="bb-panel-2 p-2">
      <div className="text-[9px] uppercase text-[var(--bb-muted)] tracking-wider">{label}</div>
      <div className="text-sm bb-mono font-bold" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[8px] text-[var(--bb-muted)]">{sub}</div>}
    </div>
  );
}
