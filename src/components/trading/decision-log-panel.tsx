"use client";

import type { DecisionLogEntry } from "@/lib/trading/types";

interface Props {
  log: DecisionLogEntry[];
}

const actionColor: Record<string, string> = {
  Open: "var(--bb-green)",
  Scale: "var(--bb-green)",
  Trail: "var(--bb-blue)",
  Breakeven: "var(--bb-amber)",
  Close: "var(--bb-purple)",
  Reject: "var(--bb-red)",
  Wait: "var(--bb-muted)",
};

const actionBg: Record<string, string> = {
  Open: "rgba(63, 185, 80, 0.1)",
  Scale: "rgba(63, 185, 80, 0.06)",
  Trail: "rgba(88, 166, 255, 0.08)",
  Breakeven: "rgba(210, 153, 34, 0.08)",
  Close: "rgba(188, 140, 255, 0.08)",
  Reject: "rgba(248, 81, 73, 0.08)",
  Wait: "rgba(125, 133, 144, 0.06)",
};

export function DecisionLogPanel({ log }: Props) {
  const recent = log.slice(-50).reverse();

  return (
    <div className="bb-panel p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-[var(--bb-muted)]">Decision Log</div>
        <div className="text-[10px] text-[var(--bb-muted)]">{log.length} total · last 50</div>
      </div>

      <div className="flex-1 overflow-y-auto bb-scroll pr-1 min-h-0">
        {recent.length === 0 && (
          <div className="text-[var(--bb-muted)] text-xs text-center py-4">
            No decisions yet. Start the agent to begin.
          </div>
        )}
        {recent.map((d) => {
          const color = actionColor[d.action] ?? "var(--bb-muted)";
          const bg = actionBg[d.action] ?? "transparent";
          return (
            <div
              key={d.id}
              className="flex items-start gap-2 py-1.5 border-b border-[var(--bb-border)] last:border-0 text-[10px]"
            >
              <div
                className="text-[9px] bb-mono text-[var(--bb-muted)] flex-shrink-0 w-12 mt-0.5"
                title={new Date(d.time).toLocaleString()}
              >
                {new Date(d.time).toLocaleTimeString("en-US", { hour12: false })}
              </div>
              <div
                className="text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                style={{ color, background: bg, border: `1px solid ${color}` }}
              >
                {d.action.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="bb-mono font-bold text-[var(--bb-text)]">{d.asset}</span>
                  {d.direction && (
                    <span
                      className="text-[9px] font-bold"
                      style={{ color: d.direction === "Long" ? "var(--bb-green)" : "var(--bb-red)" }}
                    >
                      {d.direction === "Long" ? "▲" : "▼"} {d.direction.toUpperCase()}
                    </span>
                  )}
                  {d.score !== undefined && (
                    <span className="bb-mono text-[var(--bb-muted)]">{d.score}/100</span>
                  )}
                  {d.price !== undefined && (
                    <span className="bb-mono text-[var(--bb-muted)]">@{d.price.toFixed(d.price > 1000 ? 1 : 4)}</span>
                  )}
                </div>
                <div className="text-[var(--bb-muted)] text-[9px] mt-0.5 leading-tight">{d.reason}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
