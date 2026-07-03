"use client";

import type { ConfluenceScore } from "@/lib/trading/types";

interface Props {
  score: ConfluenceScore | null;
}

export function ConfluencePanel({ score }: Props) {
  if (!score) {
    return (
      <div className="bb-panel p-4">
        <div className="text-xs uppercase tracking-wider text-[var(--bb-muted)] mb-2">Confluence Score</div>
        <div className="text-[var(--bb-muted)] text-sm">No data</div>
      </div>
    );
  }

  const total = score.total;
  const threshold = score.threshold;
  const pct = Math.min(100, (total / 100) * 100);
  const thresholdPct = threshold;

  const verdictColor =
    score.verdict === "Trade"
      ? "var(--bb-green)"
      : score.verdict === "Wait"
      ? "var(--bb-amber)"
      : "var(--bb-red)";
  const verdictBg =
    score.verdict === "Trade"
      ? "rgba(63, 185, 80, 0.15)"
      : score.verdict === "Wait"
      ? "rgba(210, 153, 34, 0.15)"
      : "rgba(248, 81, 73, 0.15)";

  // Conic gradient for the score ring
  const ringPct = pct;
  const ringColor =
    total >= threshold
      ? "var(--bb-green)"
      : total >= threshold - 8
      ? "var(--bb-amber)"
      : "var(--bb-red)";

  return (
    <div className="bb-panel p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wider text-[var(--bb-muted)]">Confluence Score</div>
        <div
          className="text-xs px-2 py-0.5 rounded font-bold"
          style={{ color: verdictColor, background: verdictBg }}
        >
          {score.verdict.toUpperCase()}
        </div>
      </div>

      {/* Score ring */}
      <div className="flex items-center gap-4 mb-3">
        <div className="relative w-20 h-20 flex-shrink-0">
          <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
            <circle cx={40} cy={40} r={34} fill="none" stroke="#1f2937" strokeWidth={6} />
            <circle
              cx={40}
              cy={40}
              r={34}
              fill="none"
              stroke={ringColor}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={`${(2 * Math.PI * 34 * ringPct) / 100} ${2 * Math.PI * 34}`}
              style={{ transition: "stroke-dasharray 0.4s ease, stroke 0.3s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-2xl font-bold bb-mono" style={{ color: ringColor }}>
              {total}
            </div>
            <div className="text-[9px] text-[var(--bb-muted)]">/ 100</div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-xs text-[var(--bb-muted)]">Threshold</span>
            <span className="text-sm bb-mono font-bold" style={{ color: "var(--bb-amber)" }}>
              {threshold}
            </span>
          </div>
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-xs text-[var(--bb-muted)]">Direction</span>
            <span
              className="text-sm font-bold"
              style={{
                color:
                  score.direction === "Long"
                    ? "var(--bb-green)"
                    : score.direction === "Short"
                    ? "var(--bb-red)"
                    : "var(--bb-muted)",
              }}
            >
              {score.direction === "Long" ? "LONG" : score.direction === "Short" ? "SHORT" : "NEUTRAL"}
            </span>
          </div>
          <div className="text-[10px] text-[var(--bb-muted)] leading-tight">
            {score.verdict === "Trade"
              ? "All factors aligned — executing entry"
              : score.verdict === "Wait"
              ? `Score within ${threshold - total} of threshold — monitoring`
              : `Score ${threshold - total} below threshold — rejected`}
          </div>
        </div>
      </div>

      {/* Factor breakdown */}
      <div className="space-y-1.5 flex-1 overflow-y-auto bb-scroll pr-1">
        {score.factors.map((f) => {
          const fPct = (f.score / f.maxScore) * 100;
          const fColor =
            f.status === "pass"
              ? "var(--bb-green)"
              : f.status === "partial"
              ? "var(--bb-amber)"
              : f.status === "fail"
              ? "var(--bb-red)"
              : "var(--bb-muted)";
          return (
            <div key={f.name} className="text-[11px]">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[var(--bb-text)] font-medium">{f.name}</span>
                <span className="bb-mono" style={{ color: fColor }}>
                  +{f.score}
                  <span className="text-[var(--bb-muted)]">/{f.maxScore}</span>
                </span>
              </div>
              <div className="h-1 rounded-full bg-[#1f2937] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${fPct}%`,
                    background: fColor,
                    transition: "width 0.4s ease, background 0.3s ease",
                  }}
                />
              </div>
              <div className="text-[9px] text-[var(--bb-muted)] mt-0.5 leading-tight">{f.reason}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
