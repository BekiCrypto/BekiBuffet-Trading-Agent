"use client";

import { useSaaS } from "./saas-provider";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useBekiBuffet } from "@/lib/trading/agent";
import { ASSET_PRESETS, ASSET_ORDER } from "@/lib/trading/presets";

export function AIAgent() {
  const { setView, activeAsset, setActiveAsset } = useSaaS();
  const { data: session } = useSession();
  const enabled = (session?.user as any)?.aiAgentEnabled ?? false;
  const state = useBekiBuffet();
  const [loading, setLoading] = useState(false);
  const [decision, setDecision] = useState<any>(null);
  const [review, setReview] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = () => {
    // For demo, derive from store (real impl would fetch from DB)
    // Skip if not authenticated
  };
  useEffect(() => { loadHistory(); }, []);

  const askAI = async () => {
    if (!snap) {
      setError("No market snapshot available. Open the Live Terminal and start the agent first.");
      return;
    }
    setLoading(true);
    setError(null);
    const preset = ASSET_PRESETS[activeAsset as keyof typeof ASSET_PRESETS];
    // Build context from client-side agent state
    const riskState = {
      equity: state.equity,
      balance: state.balance,
      floatingPnl: state.floatingPnl,
      riskPerTradePct: preset.riskPctMax,
      atrStopPips: 0,
      positionSizeUnits: 0,
      positionSizeLots: 0,
      dailyLossPct: Math.max(0, ((state.dayStartEquity - state.equity) / state.dayStartEquity) * 100),
      maxDailyLossPct: 3.0,
      maxExposurePct: 6.0,
      currentExposurePct: 0,
      consecutiveLosses: state.consecutiveLosses,
      maxConsecutiveLosses: 4,
      portfolioCorrelation: 0,
      marginLevelPct: 100,
    };
    const openCampaigns = state.campaigns
      .filter(c => c.asset === activeAsset && c.status !== "Closed")
      .map(c => ({
        id: c.id,
        asset: c.asset,
        direction: c.direction,
        status: c.status,
        positions: c.positions.map(p => ({
          id: p.id,
          direction: p.direction,
          entryPrice: p.entryPrice,
          stopLoss: p.stopLoss,
          status: p.status,
          scale: p.scale,
        })),
        averageEntry: c.averageEntry,
        aggregateStop: c.aggregateStop,
        aggregatePnl: c.aggregatePnl,
        maxScale: c.maxScale,
      }));
    const context = {
      price: snap.price,
      regime: snap.regime,
      structure: snap.structure[preset.executionTimeframe],
      ichimoku: snap.ichimoku,
      priceAction: snap.priceAction,
      confluence: snap.confluence,
      risk: riskState,
      openCampaigns,
      recentTrades: state.closedTrades.slice(-20).map(t => ({
        asset: t.asset,
        pnl: t.pnl,
        direction: t.direction, // H11 FIX: use actual trade direction, not PnL-derived
        exitReason: t.exitReason,
        openTime: t.openTime,
      })),
      selfLearningStats: Object.values(state.selfLearning.setupStats)
        .filter(s => s.trades > 0)
        .sort((a, b) => b.trades - a.trades)
        .slice(0, 10),
      marketContext: {
        session: preset.session,
        newsVolatility: snap.newsVolatility,
        spreadPips: snap.spreadPips,
        htfBias: snap.htfBias,
        ltfBias: snap.ltfBias,
      },
    };
    try {
      const r = await fetch("/api/ai-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset: activeAsset, context }),
      });
      const data = await r.json();
      if (data.error) {
        setError(data.error);
      } else {
        setDecision(data.decision);
        setHistory([data.decision, ...history].slice(0, 20));
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const askReview = async () => {
    setLoading(true);
    setError(null);

    // Calculate real performance metrics from closed trades
    const trades = state.closedTrades;
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl < 0);
    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

    // Calculate real max drawdown from equity curve
    let peak = 100000; // starting equity
    let maxDD = 0;
    let runningPnl = 0;
    for (const t of trades) {
      runningPnl += t.pnl;
      const equity = 100000 + runningPnl;
      if (equity > peak) peak = equity;
      const dd = ((peak - equity) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    }

    // Calculate Sharpe ratio from trade returns
    const returns = trades.length > 1
      ? trades.map(t => t.pnlPct / 100)
      : [0];
    const meanReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
    const stdReturn = returns.length > 1
      ? Math.sqrt(returns.reduce((a, b) => a + (b - meanReturn) ** 2, 0) / (returns.length - 1))
      : 0;
    const sharpe = stdReturn === 0 ? 0 : (meanReturn / stdReturn) * Math.sqrt(252);

    const reviewStats = {
      totalTrades: trades.length,
      winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
      totalPnl: trades.reduce((s, t) => s + t.pnl, 0),
      sharpeRatio: sharpe,
      maxDrawdown: maxDD,
      profitFactor: grossLoss === 0 ? (grossProfit > 0 ? 99 : 0) : grossProfit / grossLoss,
      byAsset: trades.reduce((acc: any, t) => {
        const a = acc[t.asset] ?? { trades: 0, pnl: 0, winRate: 0 };
        a.trades++;
        a.pnl += t.pnl;
        acc[t.asset] = a;
        return acc;
      }, {}),
      bySetup: Object.values(state.selfLearning.setupStats)
        .filter(s => s.trades > 0)
        .map(s => ({ setup: s.setup, winRate: s.winRate, weight: s.weight, trades: s.trades, pnl: s.totalPnl })),
      recentStreaks: [],
    };
    try {
      const r = await fetch("/api/ai-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset: activeAsset, mode: "review", reviewStats }),
      });
      const data = await r.json();
      if (data.error) {
        setError(data.error);
      } else {
        setReview(data.review);
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  if (!enabled) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="bb-panel p-8 text-center">
          <div className="text-4xl mb-3">✦</div>
          <h1 className="text-xl font-bold mb-2">AI Agent Requires Pro</h1>
          <p className="text-sm text-[var(--bb-muted)] mb-4">The LLM-powered meta-decision layer synthesizes market context and proposes risk-adjusted actions. Available on Pro, Elite, and Institutional.</p>
          <button onClick={() => setView("subscription")} className="text-sm font-bold px-4 py-2 rounded" style={{ background: "linear-gradient(135deg, #58a6ff, #bc8cff)", color: "#0a0e14" }}>Upgrade Now</button>
        </div>
      </div>
    );
  }

  const snap = state.snapshots[activeAsset as keyof typeof state.snapshots];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-0.5 flex items-center gap-2">
            AI Agent Decision Layer
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: "rgba(188, 140, 255, 0.15)", color: "var(--bb-purple)" }}>LLM-POWERED</span>
          </h1>
          <p className="text-sm text-[var(--bb-muted)]">Meta-decisioning on top of the rule-based engine. Synthesizes all market context into one actionable recommendation.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={askAI} disabled={loading} className="text-sm font-bold px-4 py-2 rounded-md transition-all hover:opacity-90 disabled:opacity-50" style={{ background: "linear-gradient(135deg, #bc8cff, #58a6ff)", color: "#0a0e14" }}>
            {loading && !review ? "✦ Thinking..." : "✦ Ask AI Agent"}
          </button>
          <button onClick={askReview} disabled={loading} className="text-sm font-bold px-4 py-2 rounded-md transition-all hover:opacity-90 disabled:opacity-50" style={{ background: "var(--bb-panel-2)", color: "var(--bb-text)", border: "1px solid var(--bb-border)" }}>
            Strategy Review
          </button>
        </div>
      </div>

      {/* Asset selector */}
      <div className="flex flex-wrap gap-1 mb-4">
        {ASSET_ORDER.map(a => (
          <button key={a} onClick={() => setActiveAsset(a)} className="text-xs px-3 py-1.5 rounded font-bold transition-all" style={{ background: activeAsset === a ? "var(--bb-purple)" : "var(--bb-panel-2)", color: activeAsset === a ? "#0a0e14" : "var(--bb-text)", border: "1px solid var(--bb-border)" }}>{a}</button>
        ))}
      </div>

      {error && <div className="bb-panel p-3 mb-4 text-xs text-[var(--bb-red)]" style={{ background: "rgba(248, 81, 73, 0.1)" }}>{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Current context */}
        <div className="bb-panel p-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)] mb-3">Current Context — {activeAsset}</h3>
          {snap ? (
            <div className="space-y-2 text-xs">
              <ContextRow label="Price" value={snap.price.toFixed(snap.price > 1000 ? 1 : 4)} />
              <ContextRow label="Regime" value={`${snap.regime.type} (${snap.regime.direction}, ${snap.regime.strength}/100)`} color={snap.regime.type === "Trend" ? "var(--bb-green)" : snap.regime.type === "Range" ? "var(--bb-amber)" : "var(--bb-blue)"} />
              <ContextRow label="Structure" value={`${snap.structure[ASSET_PRESETS[activeAsset as keyof typeof ASSET_PRESETS].executionTimeframe].state} (${snap.structure[ASSET_PRESETS[activeAsset as keyof typeof ASSET_PRESETS].executionTimeframe].trendDirection})`} />
              <ContextRow label="Ichimoku" value={`Score ${snap.ichimoku.score.toFixed(0)} · ${snap.ichimoku.cloudColor} cloud`} color={snap.ichimoku.score > 20 ? "var(--bb-green)" : snap.ichimoku.score < -20 ? "var(--bb-red)" : "var(--bb-muted)"} />
              <ContextRow label="Price Action" value={`${snap.priceAction.pattern} (${snap.priceAction.direction}, ${snap.priceAction.winRate}% WR)`} />
              <ContextRow label="Confluence" value={`${snap.confluence?.total}/100 → ${snap.confluence?.verdict}`} color={snap.confluence?.verdict === "Trade" ? "var(--bb-green)" : snap.confluence?.verdict === "Wait" ? "var(--bb-amber)" : "var(--bb-red)"} />
              <ContextRow label="HTF Bias" value={snap.htfBias} color={snap.htfBias === "Up" ? "var(--bb-green)" : snap.htfBias === "Down" ? "var(--bb-red)" : "var(--bb-muted)"} />
              <ContextRow label="News Vol" value={snap.newsVolatility} color={snap.newsVolatility === "High" ? "var(--bb-red)" : snap.newsVolatility === "Medium" ? "var(--bb-amber)" : "var(--bb-green)"} />
              <ContextRow label="Do-Not-Trade" value={snap.doNotTrade?.allowTrade ? "PASS" : `BLOCK: ${snap.doNotTrade?.blockingReasons.join(", ")}`} color={snap.doNotTrade?.allowTrade ? "var(--bb-green)" : "var(--bb-red)"} />
            </div>
          ) : (
            <div className="text-xs text-[var(--bb-muted)]">No context available. Open the live terminal to start the agent.</div>
          )}
        </div>

        {/* AI Decision */}
        <div className="bb-panel p-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)] mb-3">AI Decision</h3>
          {!decision && !loading && (
            <div className="text-center py-12">
              <div className="text-4xl mb-3 opacity-30">✦</div>
              <div className="text-sm text-[var(--bb-muted)] mb-1">No decision yet</div>
              <div className="text-xs text-[var(--bb-muted)]">Click "Ask AI Agent" to generate a meta-decision.</div>
            </div>
          )}
          {loading && !decision && (
            <div className="text-center py-12">
              <div className="text-4xl mb-3 bb-pulse">✦</div>
              <div className="text-sm text-[var(--bb-muted)]">AI is synthesizing context...</div>
            </div>
          )}
          {decision && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="text-3xl font-bold" style={{ color: decisionColor(decision.decision) }}>{decision.decision}</div>
                {decision.direction && <div className="text-base font-bold" style={{ color: decision.direction === "Long" ? "var(--bb-green)" : "var(--bb-red)" }}>{decision.direction}</div>}
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[10px] text-[var(--bb-muted)]">Confidence</span>
                  <div className="w-16 h-1.5 rounded-full bg-[var(--bb-border)] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${decision.confidence * 100}%`, background: "var(--bb-purple)" }} />
                  </div>
                  <span className="text-xs bb-mono font-bold" style={{ color: "var(--bb-purple)" }}>{(decision.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div className="text-xs text-[var(--bb-text)] mb-3 leading-relaxed">{decision.reasoning}</div>

              {decision.factors && decision.factors.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] uppercase text-[var(--bb-muted)] mb-1">Contributing Factors</div>
                  <div className="space-y-1">
                    {decision.factors.map((f: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <div className="w-12 h-1 rounded-full bg-[var(--bb-border)] relative">
                          <div className="absolute top-0 h-full rounded-full" style={{ width: `${Math.abs(f.influence) * 100}%`, left: f.influence >= 0 ? "50%" : `${50 - Math.abs(f.influence) * 50}%`, background: f.influence >= 0 ? "var(--bb-green)" : "var(--bb-red)" }} />
                          <div className="absolute top-[-2px] left-1/2 w-px h-2 bg-[var(--bb-text)]" />
                        </div>
                        <span className="font-bold w-32 truncate">{f.name}</span>
                        <span className="text-[var(--bb-muted)] flex-1 truncate">{f.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {decision.riskAdjustment && (
                <div className="p-2 rounded mb-3" style={{ background: "rgba(210, 153, 34, 0.08)", border: "1px solid rgba(210, 153, 34, 0.3)" }}>
                  <div className="text-[10px] uppercase text-[var(--bb-amber)] font-bold mb-1">⚠ Risk Adjustment</div>
                  <div className="text-xs text-[var(--bb-text)]">{decision.riskAdjustment.reason}</div>
                </div>
              )}

              <div className="p-2 rounded" style={{ background: "rgba(188, 140, 255, 0.08)", border: "1px solid rgba(188, 140, 255, 0.3)" }}>
                <div className="text-[10px] uppercase text-[var(--bb-purple)] font-bold mb-1">✦ Insight for Self-Learning</div>
                <div className="text-xs text-[var(--bb-text)] italic">"{decision.insight}"</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Strategy Review */}
      {review && (
        <div className="bb-panel p-4 mt-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--bb-muted)] mb-3">AI Strategy Review</h3>
          <div className="text-sm text-[var(--bb-text)] mb-4 leading-relaxed">{review.summary}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-bold text-[var(--bb-green)] mb-2 uppercase">✓ Strengths</div>
              <ul className="space-y-1 text-xs">
                {review.strengths?.map((s: string, i: number) => <li key={i} className="text-[var(--bb-text)]">• {s}</li>)}
              </ul>
            </div>
            <div>
              <div className="text-xs font-bold text-[var(--bb-red)] mb-2 uppercase">✕ Weaknesses</div>
              <ul className="space-y-1 text-xs">
                {review.weaknesses?.map((s: string, i: number) => <li key={i} className="text-[var(--bb-text)]">• {s}</li>)}
              </ul>
            </div>
          </div>
          <div className="mt-4 p-3 rounded" style={{ background: "var(--bb-panel-2)" }}>
            <div className="text-xs font-bold text-[var(--bb-amber)] mb-1 uppercase">⚠ Risk Assessment</div>
            <div className="text-xs text-[var(--bb-text)]">{review.riskAssessment}</div>
          </div>
          <div className="mt-3">
            <div className="text-xs font-bold text-[var(--bb-blue)] mb-2 uppercase">→ Next Actions</div>
            <ol className="space-y-1 text-xs list-decimal list-inside">
              {review.nextActions?.map((s: string, i: number) => <li key={i} className="text-[var(--bb-text)]">{s}</li>)}
            </ol>
          </div>
        </div>
      )}

      <div className="text-center mt-6 text-xs text-[var(--bb-muted)]">
        <button onClick={() => setView("dashboard")} className="hover:text-[var(--bb-text)]">← Back to dashboard</button>
      </div>
    </div>
  );
}

function ContextRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-[var(--bb-border)] last:border-0">
      <span className="text-[var(--bb-muted)]">{label}</span>
      <span className="font-bold" style={{ color: color ?? "var(--bb-text)" }}>{value}</span>
    </div>
  );
}

function decisionColor(d: string): string {
  return d === "OPEN" || d === "SCALE" ? "#3fb950" : d === "CLOSE" ? "#bc8cff" : d === "REJECT" ? "#f85149" : d === "HEDGE" || d === "REBALANCE" ? "#d29922" : "#7d8590";
}
