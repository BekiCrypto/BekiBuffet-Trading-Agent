"use client";

import type { MarketRegime, MarketStructureReading, Timeframe } from "@/lib/trading/types";

interface Props {
  regime: MarketRegime;
  structures: Record<Timeframe, MarketStructureReading>;
  htfBias: "Up" | "Down" | "Flat";
  ltfBias: "Up" | "Down" | "Flat";
}

const regimeColor: Record<string, string> = {
  Trend: "var(--bb-green)",
  Range: "var(--bb-amber)",
  Transition: "var(--bb-blue)",
  HighVolatility: "var(--bb-red)",
};

const regimeBg: Record<string, string> = {
  Trend: "rgba(63, 185, 80, 0.12)",
  Range: "rgba(210, 153, 34, 0.12)",
  Transition: "rgba(88, 166, 255, 0.12)",
  HighVolatility: "rgba(248, 81, 73, 0.12)",
};

export function RegimePanel({ regime, structures, htfBias, ltfBias }: Props) {
  const color = regimeColor[regime.type];
  const bg = regimeBg[regime.type];

  const biasColor = (b: string) =>
    b === "Up" ? "var(--bb-green)" : b === "Down" ? "var(--bb-red)" : "var(--bb-muted)";

  return (
    <div className="bb-panel p-4 h-full">
      <div className="text-xs uppercase tracking-wider text-[var(--bb-muted)] mb-2">Market Regime Engine</div>

      <div className="rounded-md p-3 mb-3" style={{ background: bg, border: `1px solid ${color}` }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-lg font-bold" style={{ color }}>
            {regime.type}
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded bb-mono font-bold"
            style={{ color: biasColor(regime.direction), background: "rgba(0,0,0,0.3)" }}
          >
            {regime.direction.toUpperCase()}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div>
            <div className="text-[var(--bb-muted)]">Strength</div>
            <div className="bb-mono font-bold" style={{ color }}>
              {regime.strength.toFixed(0)}/100
            </div>
          </div>
          <div>
            <div className="text-[var(--bb-muted)]">Volatility</div>
            <div className="bb-mono font-bold" style={{ color }}>
              {regime.volatilityPct.toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      {/* Multi-timeframe structure */}
      <div className="text-[10px] uppercase tracking-wider text-[var(--bb-muted)] mb-1.5">Multi-Timeframe Structure</div>
      <div className="space-y-1">
        {(["H4", "H1", "M15", "M5"] as Timeframe[]).map((tf) => {
          const s = structures[tf];
          if (!s) return null;
          const stateColor =
            s.state === "Trend" || s.state === "Breakout"
              ? "var(--bb-green)"
              : s.state === "Reversal"
              ? "var(--bb-red)"
              : s.state === "Pullback" || s.state === "Compression"
              ? "var(--bb-blue)"
              : "var(--bb-amber)";
          return (
            <div key={tf} className="flex items-center justify-between text-[11px] py-1 border-b border-[var(--bb-border)] last:border-0">
              <div className="flex items-center gap-2">
                <span className="bb-mono text-[var(--bb-muted)] w-7">{tf}</span>
                <span className="font-medium" style={{ color: stateColor }}>
                  {s.state}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-[9px] px-1 rounded bb-mono"
                  style={{ color: biasColor(s.trendDirection), background: "rgba(0,0,0,0.3)" }}
                >
                  {s.trendDirection.toUpperCase()}
                </span>
                {s.bos && (
                  <span className="text-[8px] px-1 rounded bg-[var(--bb-green-dim)] text-[var(--bb-green)] font-bold">
                    BoS
                  </span>
                )}
                {s.choch && (
                  <span className="text-[8px] px-1 rounded bg-[var(--bb-red-dim)] text-[var(--bb-red)] font-bold">
                    CHoCH
                  </span>
                )}
                {s.liquiditySwept && (
                  <span className="text-[8px] px-1 rounded bg-[var(--bb-amber-dim)] text-[var(--bb-amber)] font-bold">
                    LIQ
                  </span>
                )}
                <span className="text-[9px] text-[var(--bb-muted)] bb-mono w-7 text-right">
                  {s.confidence.toFixed(0)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* HTF / LTF bias row */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="bb-panel-2 p-2">
          <div className="text-[9px] uppercase text-[var(--bb-muted)]">HTF Bias</div>
          <div className="text-sm font-bold bb-mono" style={{ color: biasColor(htfBias) }}>
            {htfBias.toUpperCase()}
          </div>
        </div>
        <div className="bb-panel-2 p-2">
          <div className="text-[9px] uppercase text-[var(--bb-muted)]">LTF Bias</div>
          <div className="text-sm font-bold bb-mono" style={{ color: biasColor(ltfBias) }}>
            {ltfBias.toUpperCase()}
          </div>
        </div>
      </div>
    </div>
  );
}
