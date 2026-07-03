"use client";

import { useSaaS } from "./saas-provider";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";

export function Edge() {
  const { setView } = useSaaS();
  const { data: session } = useSession();
  const enabled = (session?.user as any)?.edgeDiscoveryEnabled ?? false;
  const isSuperAdmin = (session?.user as any)?.isSuperAdmin ?? false;
  const hasAccess = enabled || isSuperAdmin;
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [edges, setEdges] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => fetch("/api/edge").then(r => r.json()).then(d => setEdges(d.edges ?? []));
  useEffect(() => { load(); }, []);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const r = await fetch("/api/edge", { method: "POST" });
      const data = await r.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data.result);
        load();
      }
    } catch (e: any) {
      setError(e.message);
    }
    setRunning(false);
  };

  if (!hasAccess) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="bb-panel p-8 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="text-xl font-bold mb-2">Edge Discovery Requires Pro</h1>
          <p className="text-sm text-[var(--bb-muted)] mb-4">Autonomous parameter search and walk-forward validation is available on Pro, Elite, and Institutional plans.</p>
          <button onClick={() => setView("subscription")} className="text-sm font-bold px-4 py-2 rounded" style={{ background: "linear-gradient(135deg, #58a6ff, #bc8cff)", color: "#0a0e14" }}>Upgrade Now</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-0.5">Edge Discovery</h1>
          <p className="text-sm text-[var(--bb-muted)]">Autonomous parameter search across {5} assets × {2} timeframes × {4} strategies × {6} parameter sets = 240 configurations, walk-forward validated.</p>
        </div>
        <button onClick={run} disabled={running} className="text-sm font-bold px-4 py-2 rounded-md transition-all hover:opacity-90 disabled:opacity-50" style={{ background: "linear-gradient(135deg, #3fb950, #58a6ff)", color: "#0a0e14" }}>
          {running ? "◎ Searching..." : "◎ Run Discovery"}
        </button>
      </div>

      {error && <div className="bb-panel p-3 mb-4 text-xs text-[var(--bb-red)]" style={{ background: "rgba(248, 81, 73, 0.1)" }}>{error}</div>}

      {/* Best edge */}
      {result?.bestEdge && (
        <div className="bb-panel p-5 mb-4" style={{ background: "linear-gradient(135deg, rgba(63, 185, 80, 0.08), rgba(88, 166, 255, 0.08))", borderColor: "rgba(63, 185, 80, 0.3)" }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-bold" style={{ background: "rgba(63, 185, 80, 0.2)", color: "var(--bb-green)" }}>★ Best Edge</span>
            <span className="text-xs text-[var(--bb-muted)]">Composite score {result.bestEdge.compositeScore}/100 · {result.durationMs}ms · {result.totalConfigs} configs tested</span>
          </div>
          <h3 className="text-lg font-bold mb-2">{result.bestEdge.id}</h3>
          <p className="text-xs text-[var(--bb-muted)] mb-3">{result.bestEdge.strategy} on {result.bestEdge.asset} {result.bestEdge.timeframe} — min score {result.bestEdge.parameters.minScore}, ATR ×{result.bestEdge.parameters.atrMultiplier}, risk {result.bestEdge.parameters.riskPerTrade}%</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div><div className="text-[var(--bb-muted)]">Walk-Forward Score</div><div className="bb-mono font-bold text-[var(--bb-blue)]">{result.bestEdge.walkForwardScore}/100</div></div>
            <div><div className="text-[var(--bb-muted)]">In-Sample</div><div className="bb-mono font-bold">{result.bestEdge.inSampleScore}/100</div></div>
            <div><div className="text-[var(--bb-muted)]">Out-of-Sample</div><div className="bb-mono font-bold">{result.bestEdge.outOfSampleScore}/100</div></div>
            <div><div className="text-[var(--bb-muted)]">Recommendation</div><div className="font-bold" style={{ color: result.bestEdge.recommendation === "DEPLOY" ? "var(--bb-green)" : "var(--bb-amber)" }}>{result.bestEdge.recommendation}</div></div>
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div><div className="text-[var(--bb-muted)]">Win Rate</div><div className="bb-mono font-bold">{result.bestEdge.outOfSample.winRate.toFixed(1)}%</div></div>
            <div><div className="text-[var(--bb-muted)]">Profit Factor</div><div className="bb-mono font-bold">{result.bestEdge.outOfSample.profitFactor.toFixed(2)}</div></div>
            <div><div className="text-[var(--bb-muted)]">Sharpe</div><div className="bb-mono font-bold">{result.bestEdge.outOfSample.sharpeRatio.toFixed(2)}</div></div>
            <div><div className="text-[var(--bb-muted)]">Max DD</div><div className="bb-mono font-bold text-[var(--bb-red)]">{result.bestEdge.outOfSample.maxDrawdown.toFixed(1)}%</div></div>
          </div>
        </div>
      )}

      {/* All candidates */}
      {result?.candidates && result.candidates.length > 0 && (
        <div className="bb-panel p-4 mb-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)] mb-3">Top {result.candidates.length} Candidates</h3>
          <div className="overflow-x-auto bb-scroll">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase text-[var(--bb-muted)] border-b border-[var(--bb-border)]">
                  <th className="text-left py-2 px-2">Config</th>
                  <th className="text-right py-2 px-2">Composite</th>
                  <th className="text-right py-2 px-2">WF Score</th>
                  <th className="text-right py-2 px-2">Win Rate</th>
                  <th className="text-right py-2 px-2">PF</th>
                  <th className="text-right py-2 px-2">Sharpe</th>
                  <th className="text-right py-2 px-2">Max DD</th>
                  <th className="text-right py-2 px-2">Trades</th>
                  <th className="text-center py-2 px-2">Rec</th>
                </tr>
              </thead>
              <tbody>
                {result.candidates.map((c: any) => (
                  <tr key={c.id} className="border-b border-[var(--bb-border)] hover:bg-[var(--bb-panel-2)]">
                    <td className="py-2 px-2">
                      <div className="font-bold bb-mono text-[10px]">{c.id}</div>
                      <div className="text-[9px] text-[var(--bb-muted)]">{c.strategy}</div>
                    </td>
                    <td className="text-right py-2 px-2 bb-mono font-bold" style={{ color: c.compositeScore >= 65 ? "var(--bb-green)" : c.compositeScore >= 45 ? "var(--bb-amber)" : "var(--bb-red)" }}>{c.compositeScore}</td>
                    <td className="text-right py-2 px-2 bb-mono">{c.walkForwardScore}</td>
                    <td className="text-right py-2 px-2 bb-mono">{c.outOfSample.winRate.toFixed(0)}%</td>
                    <td className="text-right py-2 px-2 bb-mono">{c.outOfSample.profitFactor.toFixed(2)}</td>
                    <td className="text-right py-2 px-2 bb-mono">{c.outOfSample.sharpeRatio.toFixed(2)}</td>
                    <td className="text-right py-2 px-2 bb-mono text-[var(--bb-red)]">{c.outOfSample.maxDrawdown.toFixed(1)}%</td>
                    <td className="text-right py-2 px-2 bb-mono">{c.outOfSample.totalTrades}</td>
                    <td className="text-center py-2 px-2">
                      <span className="text-[9px] px-1.5 rounded font-bold" style={{ background: c.recommendation === "DEPLOY" ? "rgba(63, 185, 80, 0.2)" : "rgba(210, 153, 34, 0.2)", color: c.recommendation === "DEPLOY" ? "var(--bb-green)" : "var(--bb-amber)" }}>{c.recommendation}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Saved edges */}
      <div className="bb-panel p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)] mb-3">Discovered Edges ({edges.length})</h3>
        {edges.length === 0 ? (
          <div className="text-center py-6 text-xs text-[var(--bb-muted)]">No edges discovered yet. Click "Run Discovery" to start.</div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto bb-scroll">
            {edges.map(e => (
              <div key={e.id} className="bb-panel-2 p-3">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <div className="text-sm font-bold bb-mono">{e.name}</div>
                    <div className="text-[10px] text-[var(--bb-muted)]">{e.description}</div>
                  </div>
                  <span className="text-[9px] px-1.5 rounded font-bold" style={{ background: e.status === "DEPLOYED" ? "rgba(63, 185, 80, 0.2)" : e.status === "VALIDATED" ? "rgba(88, 166, 255, 0.2)" : "rgba(125, 133, 144, 0.1)", color: e.status === "DEPLOYED" ? "var(--bb-green)" : e.status === "VALIDATED" ? "var(--bb-blue)" : "var(--bb-muted)" }}>{e.status}</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-[10px] mt-2">
                  <div><div className="text-[var(--bb-muted)]">Win Rate</div><div className="bb-mono font-bold">{e.winRate.toFixed(0)}%</div></div>
                  <div><div className="text-[var(--bb-muted)]">PF</div><div className="bb-mono font-bold">{e.profitFactor.toFixed(2)}</div></div>
                  <div><div className="text-[var(--bb-muted)]">WF Score</div><div className="bb-mono font-bold text-[var(--bb-blue)]">{e.walkForwardScore}/100</div></div>
                  <div><div className="text-[var(--bb-muted)]">Trades</div><div className="bb-mono font-bold">{e.totalTrades}</div></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-center mt-6 text-xs text-[var(--bb-muted)]">
        <button onClick={() => setView("dashboard")} className="hover:text-[var(--bb-text)]">← Back to dashboard</button>
      </div>
    </div>
  );
}
