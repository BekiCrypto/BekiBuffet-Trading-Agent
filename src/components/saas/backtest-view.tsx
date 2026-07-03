"use client";

import { useSaaS } from "./saas-provider";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { ASSET_PRESETS, ASSET_ORDER } from "@/lib/trading/presets";

const STRATEGIES = [
  { id: "BEKIBUFFET_V1", name: "BekiBuffet V1 (Full)", desc: "Complete agent — confluence + do-not-trade + campaigns" },
  { id: "ICHIMOKU_BREAKOUT", name: "Ichimoku Breakout", desc: "Cloud breakout with momentum confirmation" },
  { id: "MOMENTUM_SCALPER", name: "Momentum Scalper", desc: "Tight ATR, momentum candles, fast in/out" },
  { id: "MEAN_REVERSION", name: "Mean Reversion", desc: "Reversion from cloud extremes, low score threshold" },
];

const TIMEFRAMES = ["M15", "H1"] as const;

export function Backtest() {
  const { setView } = useSaaS();
  const { data: session } = useSession();
  const credits = (session?.user as any)?.backtestCredits ?? 0;

  const [name, setName] = useState("XAUUSD Backtest");
  const [asset, setAsset] = useState<string>("XAUUSD");
  const [strategy, setStrategy] = useState<string>("BEKIBUFFET_V1");
  const [timeframe, setTimeframe] = useState<string>("M15");
  const [initialCapital, setInitialCapital] = useState(10000);
  const [minScore, setMinScore] = useState<number | undefined>(undefined);
  const [atrMult, setAtrMult] = useState<number | undefined>(undefined);
  const [risk, setRisk] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = () => fetch("/api/backtest").then(r => r.json()).then(d => setHistory(d.backtests ?? []));
  // M6 FIX: use useEffect for side effects, not useState lazy initializer
  useEffect(() => { loadHistory(); }, []);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 180 * 24 * 60 * 60 * 1000);
    const params: any = {};
    if (minScore !== undefined) params.minScoreOverride = minScore;
    if (atrMult !== undefined) params.atrMultiplierOverride = atrMult;
    if (risk !== undefined) params.riskPerTradeOverride = risk;
    try {
      const r = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, asset, strategy, timeframe,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          initialCapital,
          parameters: params,
        }),
      });
      const data = await r.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data.result);
        loadHistory();
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const preset = ASSET_PRESETS[asset as keyof typeof ASSET_PRESETS];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-0.5">Backtesting Engine</h1>
        <p className="text-sm text-[var(--bb-muted)]">Run strategies against 6 months of historical data with walk-forward validation. {credits} credits remaining.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Config */}
        <div className="bb-panel p-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)] mb-3">Configuration</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[var(--bb-muted)] block mb-1">Backtest Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 rounded-md text-sm" style={{ background: "var(--bb-panel-2)", border: "1px solid var(--bb-border)", color: "var(--bb-text)" }} />
            </div>
            <div>
              <label className="text-xs text-[var(--bb-muted)] block mb-1">Asset</label>
              <select value={asset} onChange={e => setAsset(e.target.value)} className="w-full px-3 py-2 rounded-md text-sm" style={{ background: "var(--bb-panel-2)", border: "1px solid var(--bb-border)", color: "var(--bb-text)" }}>
                {ASSET_ORDER.map(a => <option key={a} value={a}>{a} — {ASSET_PRESETS[a].displayName}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--bb-muted)] block mb-1">Strategy</label>
              <select value={strategy} onChange={e => setStrategy(e.target.value)} className="w-full px-3 py-2 rounded-md text-sm" style={{ background: "var(--bb-panel-2)", border: "1px solid var(--bb-border)", color: "var(--bb-text)" }}>
                {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="text-[10px] text-[var(--bb-muted)] mt-1">{STRATEGIES.find(s => s.id === strategy)?.desc}</div>
            </div>
            <div>
              <label className="text-xs text-[var(--bb-muted)] block mb-1">Timeframe</label>
              <div className="flex gap-1">
                {TIMEFRAMES.map(tf => (
                  <button key={tf} onClick={() => setTimeframe(tf)} className="flex-1 py-1.5 rounded text-xs font-bold" style={{ background: timeframe === tf ? "var(--bb-blue)" : "var(--bb-panel-2)", color: timeframe === tf ? "#0a0e14" : "var(--bb-text)", border: "1px solid var(--bb-border)" }}>{tf}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--bb-muted)] block mb-1">Initial Capital ($)</label>
              <input type="number" value={initialCapital} onChange={e => setInitialCapital(Number(e.target.value))} className="w-full px-3 py-2 rounded-md text-sm bb-mono" style={{ background: "var(--bb-panel-2)", border: "1px solid var(--bb-border)", color: "var(--bb-text)" }} />
            </div>
            <details className="text-xs">
              <summary className="text-[var(--bb-muted)] cursor-pointer hover:text-[var(--bb-text)]">Advanced overrides (defaults from preset)</summary>
              <div className="space-y-2 mt-2">
                <div>
                  <label className="text-[10px] text-[var(--bb-muted)] block mb-0.5">Min Score (default {preset.minScore})</label>
                  <input type="number" value={minScore ?? ""} onChange={e => setMinScore(e.target.value ? Number(e.target.value) : undefined)} className="w-full px-2 py-1 rounded text-xs bb-mono" style={{ background: "var(--bb-panel-2)", border: "1px solid var(--bb-border)", color: "var(--bb-text)" }} />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--bb-muted)] block mb-0.5">ATR Multiplier (default ×{preset.atrMultiplier})</label>
                  <input type="number" step="0.1" value={atrMult ?? ""} onChange={e => setAtrMult(e.target.value ? Number(e.target.value) : undefined)} className="w-full px-2 py-1 rounded text-xs bb-mono" style={{ background: "var(--bb-panel-2)", border: "1px solid var(--bb-border)", color: "var(--bb-text)" }} />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--bb-muted)] block mb-0.5">Risk % (default {preset.riskPctMax}%)</label>
                  <input type="number" step="0.1" value={risk ?? ""} onChange={e => setRisk(e.target.value ? Number(e.target.value) : undefined)} className="w-full px-2 py-1 rounded text-xs bb-mono" style={{ background: "var(--bb-panel-2)", border: "1px solid var(--bb-border)", color: "var(--bb-text)" }} />
                </div>
              </div>
            </details>
            {error && <div className="text-xs text-[var(--bb-red)] p-2 rounded" style={{ background: "rgba(248, 81, 73, 0.1)" }}>{error}</div>}
            <button onClick={run} disabled={loading || credits <= 0} className="w-full text-sm font-bold py-2.5 rounded-md transition-all hover:opacity-90 disabled:opacity-50" style={{ background: "linear-gradient(135deg, #58a6ff, #bc8cff)", color: "#0a0e14" }}>
              {loading ? "Running backtest..." : credits <= 0 ? "No credits — upgrade" : "▶ Run Backtest (1 credit)"}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="lg:col-span-2 space-y-4">
          {result ? (
            <>
              <div className="bb-panel p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)]">Results — {name}</h3>
                  <span className="text-[10px] text-[var(--bb-muted)] bb-mono">{result.durationMs}ms · {result.totalTrades} trades</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <Metric label="Final Equity" value={`$${result.finalEquity.toFixed(0)}`} color={result.finalEquity >= initialCapital ? "var(--bb-green)" : "var(--bb-red)"} />
                  <Metric label="Total Return" value={`${result.totalReturn >= 0 ? "+" : ""}${result.totalReturn.toFixed(2)}%`} color={result.totalReturn >= 0 ? "var(--bb-green)" : "var(--bb-red)"} />
                  <Metric label="Max Drawdown" value={`${result.maxDrawdown.toFixed(2)}%`} color="var(--bb-red)" />
                  <Metric label="Sharpe Ratio" value={result.sharpeRatio.toFixed(2)} color={result.sharpeRatio >= 1 ? "var(--bb-green)" : "var(--bb-amber)"} />
                  <Metric label="Win Rate" value={`${result.winRate.toFixed(1)}%`} color={result.winRate >= 50 ? "var(--bb-green)" : "var(--bb-amber)"} />
                  <Metric label="Profit Factor" value={result.profitFactor.toFixed(2)} color={result.profitFactor >= 1.5 ? "var(--bb-green)" : "var(--bb-amber)"} />
                  <Metric label="Avg Win" value={`$${result.avgWinUsd.toFixed(0)}`} color="var(--bb-green)" />
                  <Metric label="Avg Loss" value={`$${result.avgLossUsd.toFixed(0)}`} color="var(--bb-red)" />
                </div>
                {/* Equity curve */}
                <EquityCurve curve={result.equityCurve} initial={initialCapital} />
              </div>

              <div className="bb-panel p-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)] mb-3">Trade Distribution</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div className="bb-panel-2 p-2">
                    <div className="text-[9px] uppercase text-[var(--bb-muted)]">Long Trades</div>
                    <div className="bb-mono font-bold text-[var(--bb-green)]">{result.stats.byDirection.long}</div>
                  </div>
                  <div className="bb-panel-2 p-2">
                    <div className="text-[9px] uppercase text-[var(--bb-muted)]">Short Trades</div>
                    <div className="bb-mono font-bold text-[var(--bb-red)]">{result.stats.byDirection.short}</div>
                  </div>
                  <div className="bb-panel-2 p-2">
                    <div className="text-[9px] uppercase text-[var(--bb-muted)]">Avg ROI/Trade</div>
                    <div className="bb-mono font-bold" style={{ color: result.avgRoiPerTrade >= 0 ? "var(--bb-green)" : "var(--bb-red)" }}>{result.avgRoiPerTrade.toFixed(2)}%</div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-[9px] uppercase text-[var(--bb-muted)] mb-1">Exit Reasons</div>
                  <div className="space-y-1">
                    {Object.entries(result.stats.byExitReason).map(([reason, count]: any) => (
                      <div key={reason} className="flex items-center justify-between text-xs">
                        <span className="text-[var(--bb-text)]">{reason}</span>
                        <span className="bb-mono text-[var(--bb-muted)]">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bb-panel p-8 text-center">
              <div className="text-4xl mb-3 opacity-30">⟲</div>
              <div className="text-sm text-[var(--bb-muted)] mb-1">No results yet</div>
              <div className="text-xs text-[var(--bb-muted)]">Configure your backtest and click Run.</div>
            </div>
          )}

          {/* History */}
          <div className="bb-panel p-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)] mb-3">Recent Backtests</h3>
            {history.length === 0 ? (
              <div className="text-center py-4 text-xs text-[var(--bb-muted)]">No backtests run yet.</div>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto bb-scroll">
                {history.slice(0, 15).map((bt) => (
                  <div key={bt.id} className="flex items-center justify-between py-2 border-b border-[var(--bb-border)] last:border-0 text-xs">
                    <div>
                      <div className="font-bold">{bt.name}</div>
                      <div className="text-[10px] text-[var(--bb-muted)]">{bt.asset} · {bt.strategy} · {bt.timeframe} · {new Date(bt.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                      {bt.status === "COMPLETED" ? (
                        <>
                          <div className="bb-mono font-bold" style={{ color: (bt.totalReturn ?? 0) >= 0 ? "var(--bb-green)" : "var(--bb-red)" }}>{(bt.totalReturn ?? 0) >= 0 ? "+" : ""}{(bt.totalReturn ?? 0).toFixed(1)}%</div>
                          <div className="text-[10px] text-[var(--bb-muted)]">{bt.totalTrades} trades · WR {(bt.winRate ?? 0).toFixed(0)}%</div>
                        </>
                      ) : (
                        <span className="text-[10px] text-[var(--bb-amber)]">{bt.status}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="text-center mt-6 text-xs text-[var(--bb-muted)]">
        <button onClick={() => setView("dashboard")} className="hover:text-[var(--bb-text)]">← Back to dashboard</button>
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bb-panel-2 p-2">
      <div className="text-[9px] uppercase text-[var(--bb-muted)]">{label}</div>
      <div className="text-sm bb-mono font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function EquityCurve({ curve, initial }: { curve: { t: number; equity: number }[]; initial: number }) {
  if (!curve || curve.length === 0) return null;
  const slice = curve;
  const W = 600;
  const H = 160;
  const pad = { l: 8, r: 8, t: 12, b: 18 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const max = Math.max(...slice.map(p => p.equity), initial);
  const min = Math.min(...slice.map(p => p.equity), initial);
  const range = max - min || 1;
  const x = (i: number) => pad.l + (i / (slice.length - 1 || 1)) * plotW;
  const y = (v: number) => pad.t + ((max - v) / range) * plotH;
  const linePath = slice.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.equity)}`).join(" ");
  const areaPath = `${linePath} L ${x(slice.length - 1)} ${pad.t + plotH} L ${x(0)} ${pad.t + plotH} Z`;
  const lastEquity = slice[slice.length - 1].equity;
  const lineColor = lastEquity >= initial ? "var(--bb-green)" : "var(--bb-red)";
  const fillColor = lastEquity >= initial ? "rgba(63, 185, 80, 0.15)" : "rgba(248, 81, 73, 0.15)";
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 160 }}>
        <path d={areaPath} fill={fillColor} />
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth={1.5} />
        <line x1={pad.l} x2={W - pad.r} y1={y(initial)} y2={y(initial)} stroke="var(--bb-border)" strokeWidth={0.5} strokeDasharray="3 2" />
        <text x={pad.l + 4} y={pad.t + 10} fill="var(--bb-muted)" fontSize={9} fontFamily="monospace">Max ${max.toFixed(0)}</text>
        <text x={pad.l + 4} y={H - 6} fill="var(--bb-muted)" fontSize={9} fontFamily="monospace">Min ${min.toFixed(0)}</text>
      </svg>
    </div>
  );
}
