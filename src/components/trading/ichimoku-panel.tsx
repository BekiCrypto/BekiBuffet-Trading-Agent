"use client";

import type { IchimokuReading } from "@/lib/trading/types";

interface Props {
  ichimoku: IchimokuReading | null;
  htfIchimoku: IchimokuReading | null;
}

function cloudColorStyle(color: string): { color: string; bg: string } {
  switch (color) {
    case "Bullish":
      return { color: "var(--bb-green)", bg: "rgba(63, 185, 80, 0.12)" };
    case "Bearish":
      return { color: "var(--bb-red)", bg: "rgba(248, 81, 73, 0.12)" };
    default:
      return { color: "var(--bb-muted)", bg: "rgba(125, 133, 144, 0.08)" };
  }
}

export function IchimokuPanel({ ichimoku, htfIchimoku }: Props) {
  if (!ichimoku) {
    return (
      <div className="bb-panel p-4">
        <div className="text-xs uppercase tracking-wider text-[var(--bb-muted)] mb-2">Ichimoku Intelligence</div>
        <div className="text-[var(--bb-muted)] text-sm">No data</div>
      </div>
    );
  }

  const cloudStyle = cloudColorStyle(ichimoku.cloudColor);
  const futureCloudStyle = cloudColorStyle(ichimoku.futureCloudColor);
  const score = ichimoku.score;
  const scoreColor =
    score > 30 ? "var(--bb-green)" : score < -30 ? "var(--bb-red)" : score > 10 || score < -10 ? "var(--bb-amber)" : "var(--bb-muted)";

  return (
    <div className="bb-panel p-4 h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-[var(--bb-muted)]">Ichimoku Intelligence</div>
        <div className="text-xs bb-mono font-bold" style={{ color: scoreColor }}>
          {score > 0 ? "+" : ""}
          {score.toFixed(0)}
        </div>
      </div>

      {/* Cloud summary */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bb-panel-2 p-2">
          <div className="text-[9px] uppercase text-[var(--bb-muted)]">Current Cloud</div>
          <div className="text-sm font-bold" style={{ color: cloudStyle.color }}>
            {ichimoku.cloudColor}
          </div>
          <div className="text-[10px] text-[var(--bb-muted)] bb-mono">
            {ichimoku.cloudThickness.toFixed(3)}% thick
          </div>
        </div>
        <div className="bb-panel-2 p-2">
          <div className="text-[9px] uppercase text-[var(--bb-muted)]">Future Cloud</div>
          <div className="text-sm font-bold" style={{ color: futureCloudStyle.color }}>
            {ichimoku.futureCloudColor}
          </div>
          <div className="text-[10px] text-[var(--bb-muted)] bb-mono">
            {ichimoku.futureCloudThickness.toFixed(3)}% thick
          </div>
        </div>
      </div>

      {/* Components */}
      <div className="space-y-1 text-[11px]">
        <Row label="Tenkan-sen" value={ichimoku.tenkan.toFixed(4)} sub={`angle ${ichimoku.tenkanAngle.toFixed(1)}°`} />
        <Row label="Kijun-sen" value={ichimoku.kijun.toFixed(4)} sub={`angle ${ichimoku.kijunAngle.toFixed(1)}°`} />
        <Row label="Senkou A" value={ichimoku.senkouA.toFixed(4)} />
        <Row label="Senkou B" value={ichimoku.senkouB.toFixed(4)} />
        <Row label="Chikou Span" value={ichimoku.chikou.toFixed(4)} sub={ichimoku.chikouClearance ? "clearance ✓" : "no clearance"} />
        <Row
          label="Price vs Cloud"
          value={ichimoku.priceVsCloud}
          sub={`${ichimoku.distanceFromCloudPct.toFixed(3)}% away`}
        />
        <Row label="Tenkan vs Kijun" value={ichimoku.tenkanVsKijun} />
      </div>

      {/* HTF Ichimoku mini */}
      {htfIchimoku && (
        <div className="mt-3 pt-2 border-t border-[var(--bb-border)]">
          <div className="text-[9px] uppercase tracking-wider text-[var(--bb-muted)] mb-1">HTF Ichimoku (Bias TF)</div>
          <div className="grid grid-cols-3 gap-1 text-[10px]">
            <div>
              <span className="text-[var(--bb-muted)]">Cloud: </span>
              <span style={{ color: cloudColorStyle(htfIchimoku.cloudColor).color }} className="font-bold">
                {htfIchimoku.cloudColor}
              </span>
            </div>
            <div>
              <span className="text-[var(--bb-muted)]">Pos: </span>
              <span className="font-bold">{htfIchimoku.priceVsCloud}</span>
            </div>
            <div>
              <span className="text-[var(--bb-muted)]">T/K: </span>
              <span className="font-bold">{htfIchimoku.tenkanVsKijun}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-0.5 border-b border-[var(--bb-border)] last:border-0">
      <span className="text-[var(--bb-muted)]">{label}</span>
      <span className="flex items-center gap-2">
        <span className="bb-mono font-bold">{value}</span>
        {sub && <span className="text-[9px] text-[var(--bb-muted)]">{sub}</span>}
      </span>
    </div>
  );
}
