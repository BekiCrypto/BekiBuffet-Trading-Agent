"use client";

import type { PriceActionReading } from "@/lib/trading/types";

interface Props {
  reading: PriceActionReading | null;
}

const patternLabels: Record<string, string> = {
  BullishEngulfing: "Bullish Engulfing",
  BearishEngulfing: "Bearish Engulfing",
  BullishPinBar: "Bullish Pin Bar",
  BearishPinBar: "Bearish Pin Bar",
  InsideBar: "Inside Bar",
  OutsideBar: "Outside Bar",
  BreakOfStructure: "Break of Structure",
  LiquiditySweep: "Liquidity Sweep",
  MomentumCandle: "Momentum Candle",
  StrongRejection: "Strong Rejection",
  BreakAndRetest: "Break & Retest",
  None: "None",
};

export function PriceActionPanel({ reading }: Props) {
  if (!reading) {
    return (
      <div className="bb-panel p-4">
        <div className="text-xs uppercase tracking-wider text-[var(--bb-muted)] mb-2">Price Action Intelligence</div>
        <div className="text-[var(--bb-muted)] text-sm">No data</div>
      </div>
    );
  }

  const dirColor =
    reading.direction === "Bullish"
      ? "var(--bb-green)"
      : reading.direction === "Bearish"
      ? "var(--bb-red)"
      : "var(--bb-muted)";

  const isNone = reading.pattern === "None";

  return (
    <div className="bb-panel p-4 h-full">
      <div className="text-xs uppercase tracking-wider text-[var(--bb-muted)] mb-2">Price Action Intelligence</div>

      <div
        className="rounded-md p-3 mb-2"
        style={{
          background: isNone ? "rgba(125, 133, 144, 0.06)" : "rgba(0, 0, 0, 0.25)",
          border: `1px solid ${isNone ? "var(--bb-border)" : dirColor}`,
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-bold" style={{ color: isNone ? "var(--bb-muted)" : dirColor }}>
            {patternLabels[reading.pattern]}
          </span>
          {!isNone && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-bold"
              style={{ color: dirColor, background: "rgba(0,0,0,0.4)" }}
            >
              {reading.direction.toUpperCase()}
            </span>
          )}
        </div>
        {!isNone && (
          <>
            <div className="text-[10px] text-[var(--bb-muted)] mb-2">{reading.description}</div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <div className="text-[var(--bb-muted)]">Hist. Win Rate</div>
                <div className="bb-mono font-bold" style={{ color: "var(--bb-blue)" }}>
                  {reading.winRate.toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="text-[var(--bb-muted)]">Confidence</div>
                <div className="bb-mono font-bold" style={{ color: "var(--bb-amber)" }}>
                  {reading.confidence.toFixed(0)}%
                </div>
              </div>
            </div>
          </>
        )}
        {isNone && <div className="text-[10px] text-[var(--bb-muted)]">{reading.description}</div>}
      </div>
    </div>
  );
}
