"use client";

import type { RiskState, AssetPreset } from "@/lib/trading/types";

interface Props {
  risk: RiskState | null;
  preset: AssetPreset;
}

export function RiskPanel({ risk, preset }: Props) {
  if (!risk) {
    return (
      <div className="bb-panel p-4">
        <div className="text-xs uppercase tracking-wider text-[var(--bb-muted)] mb-2">Risk Commander</div>
        <div className="text-[var(--bb-muted)] text-sm">No data</div>
      </div>
    );
  }

  const equityColor = risk.equity >= risk.balance ? "var(--bb-green)" : "var(--bb-red)";
  const dailyLossColor = risk.dailyLossPct >= risk.maxDailyLossPct * 0.7 ? "var(--bb-red)" : risk.dailyLossPct > 0 ? "var(--bb-amber)" : "var(--bb-muted)";
  const exposureColor = risk.currentExposurePct >= risk.maxExposurePct * 0.7 ? "var(--bb-red)" : risk.currentExposurePct > 0 ? "var(--bb-amber)" : "var(--bb-muted)";
  const consecColor = risk.consecutiveLosses >= risk.maxConsecutiveLosses - 1 ? "var(--bb-red)" : risk.consecutiveLosses >= 2 ? "var(--bb-amber)" : "var(--bb-green)";

  return (
    <div className="bb-panel p-4 h-full">
      <div className="text-xs uppercase tracking-wider text-[var(--bb-muted)] mb-2">Risk Commander</div>

      {/* Equity */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="bb-panel-2 p-2">
          <div className="text-[9px] uppercase text-[var(--bb-muted)]">Equity</div>
          <div className="text-sm bb-mono font-bold" style={{ color: equityColor }}>
            ${risk.equity.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="bb-panel-2 p-2">
          <div className="text-[9px] uppercase text-[var(--bb-muted)]">Floating PnL</div>
          <div
            className="text-sm bb-mono font-bold"
            style={{ color: risk.floatingPnl >= 0 ? "var(--bb-green)" : "var(--bb-red)" }}
          >
            {risk.floatingPnl >= 0 ? "+" : ""}${risk.floatingPnl.toFixed(0)}
          </div>
        </div>
      </div>

      {/* Daily loss / Exposure */}
      <div className="space-y-2 mb-3">
        <RiskBar
          label="Daily Loss"
          value={risk.dailyLossPct}
          max={risk.maxDailyLossPct}
          color={dailyLossColor}
          unit="%"
          threshold={risk.maxDailyLossPct}
        />
        <RiskBar
          label="Exposure"
          value={risk.currentExposurePct}
          max={risk.maxExposurePct}
          color={exposureColor}
          unit="%"
          threshold={risk.maxExposurePct}
        />
      </div>

      {/* Consecutive losses */}
      <div className="bb-panel-2 p-2 mb-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase text-[var(--bb-muted)]">Consecutive Losses</span>
          <span className="text-xs bb-mono font-bold" style={{ color: consecColor }}>
            {risk.consecutiveLosses}/{risk.maxConsecutiveLosses}
          </span>
        </div>
        <div className="flex gap-0.5 mt-1">
          {Array.from({ length: risk.maxConsecutiveLosses }).map((_, i) => (
            <div
              key={i}
              className="h-1.5 flex-1 rounded-sm"
              style={{
                background: i < risk.consecutiveLosses ? "var(--bb-red)" : "#1f2937",
              }}
            />
          ))}
        </div>
      </div>

      {/* Risk parameters */}
      <div className="space-y-1 text-[10px]">
        <Row label="Risk per trade" value={`${preset.riskPctMin}-${preset.riskPctMax}%`} />
        <Row label="ATR multiplier" value={`×${preset.atrMultiplier}`} />
        <Row label="Min confluence" value={`${preset.minScore}/100`} />
        <Row label="Max campaign" value={`${preset.campaignEntries} scales`} />
        <Row label="Portfolio corr" value={`${(risk.portfolioCorrelation * 100).toFixed(0)}%`} />
        <Row label="Margin level" value={`${risk.marginLevelPct.toFixed(0)}%`} />
      </div>
    </div>
  );
}

function RiskBar({
  label,
  value,
  max,
  color,
  unit,
  threshold,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  unit: string;
  threshold: number;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const thresholdPct = (threshold / max) * 100;
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-0.5">
        <span className="text-[var(--bb-muted)]">{label}</span>
        <span className="bb-mono font-bold" style={{ color }}>
          {value.toFixed(2)}{unit} / {max}{unit}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[#1f2937] overflow-hidden relative">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color, transition: "width 0.4s ease, background 0.3s ease" }}
        />
        {thresholdPct < 100 && (
          <div
            className="absolute top-0 h-full w-0.5 bg-white opacity-60"
            style={{ left: `${thresholdPct}%` }}
          />
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--bb-muted)]">{label}</span>
      <span className="bb-mono font-bold">{value}</span>
    </div>
  );
}
