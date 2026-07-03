"use client";

import type { Campaign } from "@/lib/trading/types";

interface Props {
  campaigns: Campaign[];
  activeAsset: string;
}

export function CampaignsPanel({ campaigns, activeAsset }: Props) {
  const active = campaigns.filter((c) => c.status !== "Closed");
  const closed = campaigns.filter((c) => c.status === "Closed").slice(-8);

  return (
    <div className="bb-panel p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-[var(--bb-muted)]">Campaign Manager</div>
        <div className="text-[10px] text-[var(--bb-muted)]">
          {active.length} active · {closed.length} recent closed
        </div>
      </div>

      {/* Active campaigns */}
      <div className="flex-1 overflow-y-auto bb-scroll pr-1 min-h-0">
        {active.length === 0 && (
          <div className="text-[var(--bb-muted)] text-xs text-center py-4">No active campaigns</div>
        )}
        {active.map((c) => {
          const dirColor = c.direction === "Long" ? "var(--bb-green)" : "var(--bb-red)";
          const dirBg = c.direction === "Long" ? "rgba(63, 185, 80, 0.08)" : "rgba(248, 81, 73, 0.08)";
          const pnlColor = c.aggregatePnl >= 0 ? "var(--bb-green)" : "var(--bb-red)";
          const scaleCount = c.positions.filter((p) => p.status !== "Closed").length;
          const isActiveAsset = c.asset === activeAsset;

          return (
            <div
              key={c.id}
              className="rounded-md p-2 mb-2"
              style={{
                background: dirBg,
                border: `1px solid ${isActiveAsset ? dirColor : "var(--bb-border)"}`,
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold" style={{ color: dirColor }}>
                    {c.direction === "Long" ? "▲" : "▼"} {c.asset}
                  </span>
                  <span className="text-[9px] text-[var(--bb-muted)] bb-mono">{c.id}</span>
                  <span
                    className="text-[8px] px-1 rounded font-bold"
                    style={{ background: "rgba(0,0,0,0.4)", color: "var(--bb-muted)" }}
                  >
                    {c.status.toUpperCase()}
                  </span>
                </div>
                <span className="text-xs bb-mono font-bold" style={{ color: pnlColor }}>
                  {c.aggregatePnl >= 0 ? "+" : ""}${c.aggregatePnl.toFixed(0)}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1 text-[9px] mb-1">
                <div>
                  <div className="text-[var(--bb-muted)]">Avg Entry</div>
                  <div className="bb-mono font-bold">{c.averageEntry.toFixed(c.averageEntry > 1000 ? 1 : 4)}</div>
                </div>
                <div>
                  <div className="text-[var(--bb-muted)]">Stop</div>
                  <div className="bb-mono font-bold text-[var(--bb-red)]">{c.aggregateStop.toFixed(c.aggregateStop > 1000 ? 1 : 4)}</div>
                </div>
                <div>
                  <div className="text-[var(--bb-muted)]">Size</div>
                  <div className="bb-mono font-bold">{c.aggregateSize.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[var(--bb-muted)]">Scale</div>
                  <div className="bb-mono font-bold" style={{ color: dirColor }}>
                    {scaleCount}/{c.maxScale}
                  </div>
                </div>
              </div>

              {/* Scale visualization */}
              <div className="flex gap-0.5">
                {Array.from({ length: c.maxScale }).map((_, i) => {
                  const pos = c.positions[i];
                  const filled = pos && pos.status !== "Closed";
                  const be = pos?.status === "Breakeven" || pos?.status === "Trail";
                  return (
                    <div
                      key={i}
                      className="h-1.5 flex-1 rounded-sm"
                      style={{
                        background: filled ? (be ? "var(--bb-amber)" : dirColor) : "#1f2937",
                      }}
                      title={pos ? `${pos.id} scale ${pos.scale} (${pos.status})` : `Scale ${i + 1} empty`}
                    />
                  );
                })}
              </div>

              {/* Positions detail */}
              {c.positions.filter((p) => p.status !== "Closed").length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {c.positions
                    .filter((p) => p.status !== "Closed")
                    .map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-[9px] text-[var(--bb-muted)]">
                        <span className="bb-mono">
                          S{p.scale} @ {p.entryPrice.toFixed(p.entryPrice > 1000 ? 1 : 4)}
                        </span>
                        <span className="bb-mono">SL {p.stopLoss.toFixed(p.stopLoss > 1000 ? 1 : 4)}</span>
                        <span
                          className="text-[8px] px-1 rounded font-bold"
                          style={{
                            color:
                              p.status === "Open"
                                ? "var(--bb-muted)"
                                : p.status === "Breakeven"
                                ? "var(--bb-amber)"
                                : "var(--bb-green)",
                          }}
                        >
                          {p.status.toUpperCase()}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Recently closed */}
        {closed.length > 0 && (
          <>
            <div className="text-[9px] uppercase tracking-wider text-[var(--bb-muted)] mt-3 mb-1">Recently Closed</div>
            {closed
              .slice()
              .reverse()
              .map((c) => {
                const pnlColor = c.aggregatePnl >= 0 ? "var(--bb-green)" : "var(--bb-red)";
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between text-[10px] py-1 border-b border-[var(--bb-border)] last:border-0"
                  >
                    <span className="bb-mono">
                      {c.direction === "Long" ? "▲" : "▼"} {c.asset} {c.id}
                    </span>
                    <span className="bb-mono font-bold" style={{ color: pnlColor }}>
                      {c.aggregatePnl >= 0 ? "+" : ""}${c.aggregatePnl.toFixed(0)}
                    </span>
                  </div>
                );
              })}
          </>
        )}
      </div>
    </div>
  );
}
