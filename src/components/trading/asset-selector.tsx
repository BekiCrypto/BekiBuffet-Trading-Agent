"use client";

import type { AssetSymbol } from "@/lib/trading/types";
import { ASSET_PRESETS, ASSET_ORDER } from "@/lib/trading/presets";
import type { AssetSnapshot } from "@/lib/trading/agent";

interface Props {
  activeAsset: AssetSymbol;
  onSelect: (s: AssetSymbol) => void;
  snapshots: Record<AssetSymbol, AssetSnapshot | null>;
}

export function AssetSelector({ activeAsset, onSelect, snapshots }: Props) {
  return (
    <div className="flex gap-1 overflow-x-auto bb-scroll pb-1">
      {ASSET_ORDER.map((sym) => {
        const preset = ASSET_PRESETS[sym];
        const snap = snapshots[sym];
        const isActive = sym === activeAsset;
        const confluence = snap?.confluence;
        const verdict = confluence?.verdict;
        const borderColor =
          verdict === "Trade"
            ? "var(--bb-green)"
            : verdict === "Wait"
            ? "var(--bb-amber)"
            : verdict === "Reject"
            ? "var(--bb-red)"
            : "var(--bb-border)";
        const bg = isActive ? "rgba(88, 166, 255, 0.08)" : "var(--bb-panel)";

        return (
          <button
            key={sym}
            onClick={() => onSelect(sym)}
            className="flex-shrink-0 rounded-md p-2 transition-all"
            style={{
              background: bg,
              border: `1px solid ${isActive ? "var(--bb-blue)" : borderColor}`,
              minWidth: 130,
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold bb-mono">{sym}</span>
              {snap && (
                <span
                  className="text-[9px] px-1 rounded font-bold"
                  style={{
                    background: "rgba(0,0,0,0.4)",
                    color:
                      verdict === "Trade"
                        ? "var(--bb-green)"
                        : verdict === "Wait"
                        ? "var(--bb-amber)"
                        : verdict === "Reject"
                        ? "var(--bb-red)"
                        : "var(--bb-muted)",
                  }}
                >
                  {verdict?.toUpperCase() ?? "—"}
                </span>
              )}
            </div>
            <div className="text-[9px] text-[var(--bb-muted)] leading-tight mb-1 truncate" title={preset.description}>
              {preset.displayName}
            </div>
            {snap ? (
              <div className="flex items-center justify-between text-[10px] bb-mono">
                <span className="font-bold">{snap.price.toFixed(snap.price > 1000 ? 1 : 4)}</span>
                <span
                  style={{
                    color:
                      snap.confluence?.direction === "Long"
                        ? "var(--bb-green)"
                        : snap.confluence?.direction === "Short"
                        ? "var(--bb-red)"
                        : "var(--bb-muted)",
                  }}
                >
                  {snap.confluence?.total ?? 0}/100
                </span>
              </div>
            ) : (
              <div className="text-[10px] text-[var(--bb-muted)]">Loading...</div>
            )}
          </button>
        );
      })}
    </div>
  );
}
