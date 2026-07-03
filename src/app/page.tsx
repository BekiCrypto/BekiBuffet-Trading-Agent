"use client";

import { useEffect, useRef } from "react";
import { useBekiBuffet } from "@/lib/trading/agent";
import { ASSET_PRESETS } from "@/lib/trading/presets";
import { Header } from "@/components/trading/header";
import { AssetSelector } from "@/components/trading/asset-selector";
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
import type { Timeframe } from "@/lib/trading/types";

export default function Home() {
  const state = useBekiBuffet();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Prime the simulator once on mount so the dashboard isn't empty
  useEffect(() => {
    if (state.startedAt === 0) {
      state.init();
    }
  }, [state]);

  // Tick loop driven by tickSpeedMs.
  // When Running: full agent cycle (analysis + campaign management + decisions).
  // When Paused: analysis-only ticks (snapshots update so user can see market state).
  // When Halted: no ticks.
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (state.mode !== "Halted") {
      // Use a slower cadence when paused so the dashboard "breathes" without burning CPU
      const interval = state.mode === "Running" ? state.tickSpeedMs : Math.max(state.tickSpeedMs, 2000);
      intervalRef.current = setInterval(() => {
        useBekiBuffet.getState().tick();
      }, interval);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state.mode, state.tickSpeedMs]);

  const snap = state.snapshots[state.activeAsset];
  const preset = ASSET_PRESETS[state.activeAsset];

  // Risk state for the active asset's preset
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
    (c) => c.asset === state.activeAsset && c.status !== "Closed"
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bb-bg)" }}>
      <div className="flex-1 p-3 md:p-4 max-w-[1800px] mx-auto w-full bb-grid">
        <Header
          mode={state.mode}
          status={state.status}
          balance={state.balance}
          equity={state.equity}
          floatingPnl={state.floatingPnl}
          consecutiveLosses={state.consecutiveLosses}
          tickSpeedMs={state.tickSpeedMs}
          activeAsset={state.activeAsset}
          onToggleMode={() => {
            const newMode = state.mode === "Running" ? "Paused" : "Running";
            state.setMode(newMode);
          }}
          onReset={() => state.reset()}
          onSpeedChange={(ms) => state.setTickSpeed(ms)}
        />

        {/* Asset selector */}
        <div className="mb-3">
          <AssetSelector
            activeAsset={state.activeAsset}
            onSelect={(s) => state.setActiveAsset(s)}
            snapshots={state.snapshots}
          />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-12 gap-3">
          {/* Row 1: Chart (8) + Confluence (4) */}
          <div className="col-span-12 lg:col-span-8">
            <div className="bb-panel p-3 h-full">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-[var(--bb-muted)]">Live Chart</span>
                  <span className="text-xs bb-mono font-bold">{preset.symbol}</span>
                  <span className="text-[10px] text-[var(--bb-muted)] bb-mono">
                    Exec TF: {preset.executionTimeframe}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-[var(--bb-muted)]">
                    ATR:{" "}
                    <span className="bb-mono font-bold text-[var(--bb-text)]">
                      {snap?.atr.toFixed(snap?.atr > 100 ? 2 : 5) ?? "—"}
                    </span>
                  </span>
                  <span className="text-[var(--bb-muted)]">
                    ATR%:{" "}
                    <span className="bb-mono font-bold text-[var(--bb-amber)]">
                      {snap?.atrPct.toFixed(2)}%
                    </span>
                  </span>
                  <span className="text-[var(--bb-muted)]">
                    Session:{" "}
                    <span className="bb-mono font-bold text-[var(--bb-text)]">
                      {snap?.sessionQuality ?? 0}/100
                    </span>
                  </span>
                  <span className="text-[var(--bb-muted)]">
                    News:{" "}
                    <span
                      className="bb-mono font-bold"
                      style={{
                        color:
                          snap?.newsVolatility === "High"
                            ? "var(--bb-red)"
                            : snap?.newsVolatility === "Medium"
                            ? "var(--bb-amber)"
                            : "var(--bb-green)",
                      }}
                    >
                      {snap?.newsVolatility ?? "—"}
                    </span>
                  </span>
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
                    positions: c.positions
                      .filter((p) => p.status !== "Closed")
                      .map((p) => ({
                        entryPrice: p.entryPrice,
                        stopLoss: p.stopLoss,
                        takeProfit: p.takeProfit,
                        scale: p.scale,
                        status: p.status,
                      })),
                  }))}
                />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-[var(--bb-muted)] text-sm">
                  Initializing market data...
                </div>
              )}
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4">
            <ConfluencePanel score={snap?.confluence ?? null} />
          </div>

          {/* Row 2: Regime + Ichimoku + Price Action */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4">
            {snap && (
              <RegimePanel
                regime={snap.regime}
                structures={snap.structure}
                htfBias={snap.htfBias}
                ltfBias={snap.ltfBias}
              />
            )}
          </div>
          <div className="col-span-12 md:col-span-6 lg:col-span-4">
            <IchimokuPanel ichimoku={snap?.ichimoku ?? null} htfIchimoku={snap?.ichimokuHTF ?? null} />
          </div>
          <div className="col-span-12 md:col-span-12 lg:col-span-4">
            <PriceActionPanel reading={snap?.priceAction ?? null} />
          </div>

          {/* Row 3: Risk + Do-Not-Trade */}
          <div className="col-span-12 md:col-span-6 lg:col-span-6">
            <RiskPanel risk={riskState} preset={preset} />
          </div>
          <div className="col-span-12 md:col-span-6 lg:col-span-6">
            <DoNotTradePanel evaluation={snap?.doNotTrade ?? null} />
          </div>

          {/* Row 4: Campaigns + Decision Log */}
          <div className="col-span-12 lg:col-span-6">
            <CampaignsPanel campaigns={state.campaigns} activeAsset={state.activeAsset} />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <DecisionLogPanel log={state.decisionLog} />
          </div>

          {/* Row 5: Self-Learning + Journal */}
          <div className="col-span-12 lg:col-span-6">
            <SelfLearningPanel state={state.selfLearning} />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <JournalPanel trades={state.closedTrades} />
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-4 mb-2 text-center text-[10px] text-[var(--bb-muted)]">
          BekiBuffet — Autonomous Trading Decision Engine · Journal-trained · Confluence-scored · Campaign-managed
          <span className="mx-2">·</span>
          <span className="bb-mono">{state.ticksProcessed} ticks processed</span>
        </footer>
      </div>
    </div>
  );
}
