"use client";

import type { DoNotTradeEvaluation } from "@/lib/trading/types";

interface Props {
  evaluation: DoNotTradeEvaluation | null;
}

export function DoNotTradePanel({ evaluation }: Props) {
  if (!evaluation) {
    return (
      <div className="bb-panel p-4">
        <div className="text-xs uppercase tracking-wider text-[var(--bb-muted)] mb-2">Do-Not-Trade Engine</div>
        <div className="text-[var(--bb-muted)] text-sm">No data</div>
      </div>
    );
  }

  const headerColor = evaluation.allowTrade ? "var(--bb-green)" : "var(--bb-red)";
  const headerBg = evaluation.allowTrade ? "rgba(63, 185, 80, 0.12)" : "rgba(248, 81, 73, 0.12)";

  return (
    <div className="bb-panel p-4 h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-[var(--bb-muted)]">Do-Not-Trade Engine</div>
        <div
          className="text-[10px] px-2 py-0.5 rounded font-bold"
          style={{ color: headerColor, background: headerBg }}
        >
          {evaluation.allowTrade ? "ALLOW" : "BLOCK"}
        </div>
      </div>

      <div className="space-y-1 text-[11px] max-h-72 overflow-y-auto bb-scroll pr-1">
        {evaluation.reasons.map((r, i) => (
          <div
            key={i}
            className="flex items-start gap-2 p-1.5 rounded"
            style={{
              background: r.triggered ? "rgba(248, 81, 73, 0.08)" : "transparent",
              border: r.triggered ? "1px solid rgba(248, 81, 73, 0.3)" : "1px solid transparent",
            }}
          >
            <div
              className="w-3 h-3 rounded-sm flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5"
              style={{
                background: r.triggered ? "var(--bb-red)" : "var(--bb-green)",
                color: "#0a0e14",
              }}
            >
              {r.triggered ? "✕" : "✓"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium" style={{ color: r.triggered ? "var(--bb-red)" : "var(--bb-text)" }}>
                {r.rule}
              </div>
              <div className="text-[9px] text-[var(--bb-muted)] leading-tight mt-0.5">{r.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {evaluation.blockingReasons.length > 0 && (
        <div className="mt-2 p-2 rounded text-[10px]" style={{ background: "rgba(248, 81, 73, 0.1)", color: "var(--bb-red)" }}>
          <span className="font-bold">Blocking: </span>
          {evaluation.blockingReasons.join(", ")}
        </div>
      )}
    </div>
  );
}
