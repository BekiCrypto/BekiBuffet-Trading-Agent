"use client";

import { useEffect, useRef } from "react";
import { useBekiBuffet } from "@/lib/trading/agent";
import { ASSET_PRESETS } from "@/lib/trading/presets";
import { useSaaS } from "./saas-provider";
import { CandleChart } from "@/components/trading/candle-chart";
import { RegimePanel } from "@/components/trading/regime-panel";
import { IchimokuPanel } from "@/components/trading/ichimoku-panel";
import { PriceActionPanel } from "@/components/trading/price-action-panel";
import { ConfluencePanel } from "@/components/trading/confluence-panel";
import { RiskPanel } from "@/components/trading/risk-panel";
import { DoNotTradePanel } from "@/components/trading/do-not-trade-panel";
import { CampaignsPanel } from "@/components/trading/campaigns-panel";
import { SelfLearningPanel } from "@/components/trading/self-learning-panel";
import { DecisionLogPanel } from "@/components/trading/decision-log-panel";
import { JournalPanel } from "@/components/trading/journal-panel";
import { computeRiskState } from "@/lib/trading/risk";

export function Terminal() {
  const state = useBekiBuffet();
  const { activeAsset, setActiveAsset, setView } = useSaaS();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // M4 FIX: Only depend on startedAt, not the whole store (prevents re-fire every tick)
  useEffect(() => {
    if (state.startedAt === 0) {
      state.init();
    }
  }, [state.startedAt]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (state.mode !== "Halted") {
      const interval = state.mode === "Running" ? state.tickSpeedMs : Math.max(state.tickSpeedMs, 2000);
      intervalRef.current = setInterval(() => {
        useBekiBuffet.getState().tick();
      }, interval);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state.mode, state.tickSpeedMs]);

  const snap = state.snapshots[activeAsset as keyof typeof state.snapshots] ?? state.snapshots.XAUUSD;
  const preset = ASSET_PRESETS[activeAsset as keyof typeof ASSET_PRESETS] ?? ASSET_PRESETS.XAUUSD;

  const riskState = computeRiskState(
    state.equity,
    state.balance,
    state.floatingPnl,
    state.campaigns.filter((c) => c.status !== "Closed"),
    state.consecutiveLosses,
    state.dayStartEquity,
    preset
  );

  const activeCampaignsForAsset = state.campaigns.filter(
    (c) => c.asset === activeAsset && c.status !== "Closed"
  );

  return (
    <div className="p-3 md:p-4">
      {/* Terminal header */}
      <div className="bb-panel p-3 mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md flex items-center justify-center font-bold text-lg" style={{ background: "linear-gradient(135deg, #58a6ff, #bc8cff)", color: "#0a0e14" }}>B</div>
          <div>
            <div className="text-base font-bold tracking-tight flex items-center gap-2">
              BekiBuffet Live Terminal
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bb-panel-2)] text-[var(--bb-muted)] font-normal">AGENT</span>
            </div>
            <div className="text-[10px] text-[var(--bb-muted)]">{preset.symbol} · {preset.session} · Bias {preset.biasTimeframe} / Exec {preset.executionTimeframe}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: "var(--bb-panel-2)" }}>
            <div className={`w-2 h-2 rounded-full ${state.mode === "Running" ? "bb-pulse" : ""}`} style={{ background: state.mode === "Running" ? "var(--bb-green)" : state.mode === "Halted" ? "var(--bb-red)" : "var(--bb-amber)" }} />
            <span className="text-xs font-bold" style={{ color: state.mode === "Running" ? "var(--bb-green)" : state.mode === "Halted" ? "var(--bb-red)" : "var(--bb-amber)" }}>{state.mode.toUpperCase()}</span>
          </div>
          <button onClick={() => state.setMode(state.mode === "Running" ? "Paused" : "Running")} className="px-3 py-1.5 rounded-md text-xs font-bold transition-all hover:opacity-90" style={{ background: state.mode === "Running" ? "rgba(248, 81, 73, 0.15)" : "rgba(63, 185, 80, 0.15)", color: state.mode === "Running" ? "var(--bb-red)" : "var(--bb-green)", border: `1px solid ${state.mode === "Running" ? "var(--bb-red)" : "var(--bb-green)"}` }}>
            {state.mode === "Running" ? "❚❚ Pause" : "▶ Start"}
          </button>
          <button onClick={() => state.reset()} className="px-2.5 py-1.5 rounded-md text-xs font-bold" style={{ background: "rgba(125, 133, 144, 0.1)", color: "var(--bb-muted)", border: "1px solid var(--bb-border)" }}>↺ Reset</button>
          <select value={state.tickSpeedMs} onChange={(e) => state.setTickSpeed(Number(e.target.value))} className="bg-[var(--bb-panel-2)] text-xs px-2 py-1.5 rounded-md border border-[var(--bb-border)] text-[var(--bb-text)]">
            <option value={3000}>0.3x</option>
            <option value={1500}>1x</option>
            <option value={800}>2x</option>
            <option value={400}>4x</option>
            <option value={200}>8x</option>
          </select>
        </div>
      </div>

      {/* Asset selector */}
      <div className="flex gap-1 overflow-x-auto bb-scroll pb-2 mb-3">
        {(["XAUUSD", "EURUSD", "GBPUSD", "EURJPY", "BTCUSD"] as const).map((sym) => {
          const preset2 = ASSET_PRESETS[sym];
          const snap2 = state.snapshots[sym];
          const isActive = sym === activeAsset;
          const verdict = snap2?.confluence?.verdict;
          const borderColor = verdict === "Trade" ? "var(--bb-green)" : verdict === "Wait" ? "var(--bb-amber)" : verdict === "Reject" ? "var(--bb-red)" : "var(--bb-border)";
          return (
            <button key={sym} onClick={() => setActiveAsset(sym)} className="flex-shrink-0 rounded-md p-2 transition-all" style={{ background: isActive ? "rgba(88, 166, 255, 0.08)" : "var(--bb-panel)", border: `1px solid ${isActive ? "var(--bb-blue)" : borderColor}`, minWidth: 130 }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold bb-mono">{sym}</span>
                {snap2 && <span className="text-[9px] px-1 rounded font-bold" style={{ background: "rgba(0,0,0,0.4)", color: verdict === "Trade" ? "var(--bb-green)" : verdict === "Wait" ? "var(--bb-amber)" : verdict === "Reject" ? "var(--bb-red)" : "var(--bb-muted)" }}>{verdict?.toUpperCase() ?? "—"}</span>}
              </div>
              <div className="text-[9px] text-[var(--bb-muted)] truncate">{preset2.displayName}</div>
              {snap2 ? (
                <div className="flex items-center justify-between text-[10px] bb-mono mt-1">
                  <span className="font-bold">{snap2.price.toFixed(snap2.price > 1000 ? 1 : 4)}</span>
                  <span style={{ color: snap2.confluence?.direction === "Long" ? "var(--bb-green)" : snap2.confluence?.direction === "Short" ? "var(--bb-red)" : "var(--bb-muted)" }}>{snap2.confluence?.total ?? 0}/100</span>
                </div>
              ) : <div className="text-[10px] text-[var(--bb-muted)]">Loading...</div>}
            </button>
          );
        })}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 lg:col-span-8">
          <div className="bb-panel p-3 h-full">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-[var(--bb-muted)]">Live Chart</span>
                <span className="text-xs bb-mono font-bold">{preset.symbol}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="text-[var(--bb-muted)]">ATR: <span className="bb-mono font-bold text-[var(--bb-text)]">{snap?.atr.toFixed(snap?.atr > 100 ? 2 : 5) ?? "—"}</span></span>
                <span className="text-[var(--bb-muted)]">ATR%: <span className="bb-mono font-bold text-[var(--bb-amber)]">{snap?.atrPct.toFixed(2)}%</span></span>
                <span className="text-[var(--bb-muted)]">Session: <span className="bb-mono font-bold text-[var(--bb-text)]">{snap?.sessionQuality ?? 0}/100</span></span>
              </div>
            </div>
            {snap ? (
              <CandleChart
                candles={snap.candles[preset.executionTimeframe]}
                ichimoku={snap.ichimoku}
                timeframe={preset.executionTimeframe}
                height={300}
                campaigns={activeCampaignsForAsset.map((c) => ({
                  direction: c.direction,
                  positions: c.positions.filter((p) => p.status !== "Closed").map((p) => ({ entryPrice: p.entryPrice, stopLoss: p.stopLoss, takeProfit: p.takeProfit, scale: p.scale, status: p.status })),
                }))}
              />
            ) : (
              <div className="h-[300px] flex items-center justify-center text-[var(--bb-muted)] text-sm">Initializing market data...</div>
            )}
          </div>
        </div>
        <div className="col-span-12 lg:col-span-4">
          <ConfluencePanel score={snap?.confluence ?? null} />
        </div>
        <div className="col-span-12 md:col-span-6 lg:col-span-4">
          {snap && <RegimePanel regime={snap.regime} structures={snap.structure} htfBias={snap.htfBias} ltfBias={snap.ltfBias} />}
        </div>
        <div className="col-span-12 md:col-span-6 lg:col-span-4">
          <IchimokuPanel ichimoku={snap?.ichimoku ?? null} htfIchimoku={snap?.ichimokuHTF ?? null} />
        </div>
        <div className="col-span-12 md:col-span-12 lg:col-span-4">
          <PriceActionPanel reading={snap?.priceAction ?? null} />
        </div>
        <div className="col-span-12 md:col-span-6 lg:col-span-6">
          <RiskPanel risk={riskState} preset={preset} />
        </div>
        <div className="col-span-12 md:col-span-6 lg:col-span-6">
          <DoNotTradePanel evaluation={snap?.doNotTrade ?? null} />
        </div>
        <div className="col-span-12 lg:col-span-6">
          <CampaignsPanel campaigns={state.campaigns} activeAsset={activeAsset} />
        </div>
        <div className="col-span-12 lg:col-span-6">
          <DecisionLogPanel log={state.decisionLog} />
        </div>
        <div className="col-span-12 lg:col-span-6">
          <SelfLearningPanel state={state.selfLearning} />
        </div>
        <div className="col-span-12 lg:col-span-6">
          <JournalPanel trades={state.closedTrades} />
        </div>
      </div>

      <div className="text-center mt-4 mb-2 text-[10px] text-[var(--bb-muted)]">
        <button onClick={() => setView("dashboard")} className="hover:text-[var(--bb-text)]">← Back to dashboard</button>
        <span className="mx-2">·</span>
        <span className="bb-mono">{state.ticksProcessed} ticks processed</span>
      </div>
    </div>
  );
}
