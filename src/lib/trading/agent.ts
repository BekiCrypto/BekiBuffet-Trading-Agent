// ============================================================================
// BekiBuffet — Main Agent Orchestrator
// Coordinates all engines on each tick:
//   1. Pull market data for each asset (multi-timeframe)
//   2. Run Market Structure Engine per timeframe
//   3. Derive Market Regime
//   4. Run Ichimoku Intelligence on bias + execution timeframes
//   5. Run Price Action Engine on execution timeframe
//   6. Run Do-Not-Trade Engine
//   7. If allowed: score Confluence; if >= threshold, open/scale campaign
//   8. Manage open campaigns (breakeven, trail, partial, close)
//   9. Record closed trades into Self-Learning module
//  10. Update risk state and decision log
// ============================================================================

import { create } from "zustand";
import type {
  AgentMode,
  AgentStatus,
  AssetSymbol,
  Campaign,
  ConfluenceScore,
  DecisionLogEntry,
  DoNotTradeEvaluation,
  IchimokuReading,
  MarketRegime,
  MarketStructureReading,
  Position,
  PriceActionReading,
  RiskState,
  SelfLearningState,
  TradeRecord,
  Timeframe,
  Candle,
} from "./types";
import { ASSET_PRESETS, ASSET_ORDER } from "./presets";
import { getCandles, tick as marketTick, resetSimulator, getCurrentPrice } from "./marketData";
import { analyzeMarketStructure, deriveRegime } from "./marketStructure";
import { computeIchimoku } from "./ichimoku";
import { analyzePriceAction } from "./priceAction";
import { scoreConfluence } from "./confluence";
import { evaluateDoNotTrade } from "./doNotTrade";
import {
  computeRiskState,
  computeRisk,
  type RiskContext,
} from "./risk";
import {
  manageCampaigns,
  openCampaign,
  scaleIntoCampaign,
  resetCounters,
} from "./campaign";
import {
  createSelfLearningState,
  seedSetupStats,
  recordTrade,
  buildTradeRecord,
} from "./selfLearning";
import { atr, atrPct } from "./indicators";

// --- Per-asset snapshot stored in the agent state ------------------------

export interface AssetSnapshot {
  symbol: AssetSymbol;
  price: number;
  candles: Record<Timeframe, Candle[]>;
  structure: Record<Timeframe, MarketStructureReading>;
  regime: MarketRegime;
  ichimoku: IchimokuReading;
  ichimokuHTF: IchimokuReading; // bias timeframe ichimoku
  priceAction: PriceActionReading;
  confluence: ConfluenceScore | null;
  doNotTrade: DoNotTradeEvaluation | null;
  atr: number;
  atrPct: number;
  htfBias: "Up" | "Down" | "Flat";
  ltfBias: "Up" | "Down" | "Flat";
  newsVolatility: "Low" | "Medium" | "High";
  sessionQuality: number;
  spreadPips: number;
}

interface BekiBuffetState {
  mode: AgentMode;
  startedAt: number;
  dayStartEquity: number;
  balance: number;
  equity: number;
  floatingPnl: number;
  consecutiveLosses: number;
  snapshots: Record<AssetSymbol, AssetSnapshot | null>;
  campaigns: Campaign[];
  closedTrades: TradeRecord[];
  decisionLog: DecisionLogEntry[];
  selfLearning: SelfLearningState;
  status: AgentStatus;
  activeAsset: AssetSymbol;
  lastTickAt: number;
  tickSpeedMs: number;
  ticksProcessed: number;

  // Actions
  init: () => void;
  tick: () => void;
  setActiveAsset: (s: AssetSymbol) => void;
  setMode: (m: AgentMode) => void;
  setTickSpeed: (ms: number) => void;
  reset: () => void;
}

function initialSnapshots(): Record<AssetSymbol, AssetSnapshot | null> {
  return { XAUUSD: null, EURUSD: null, GBPUSD: null, EURJPY: null, BTCUSD: null };
}

function determineSessionQuality(now: number, preset: AssetSymbol): number {
  const hour = new Date(now).getUTCHours();
  // 7-10 UTC: London open (high), 12-16 UTC: NY overlap (high), 21-23 UTC: Sydney (low)
  if (preset === "BTCUSD") {
    // 24/7 market — peak during NY hours
    if (hour >= 13 && hour <= 21) return 90;
    if (hour >= 0 && hour <= 4) return 50;
    return 70;
  }
  if (hour >= 7 && hour <= 10) return 90; // London open
  if (hour >= 13 && hour <= 16) return 95; // NY overlap
  if (hour >= 10 && hour <= 12) return 75;
  if (hour >= 16 && hour <= 20) return 60;
  if (hour >= 21 || hour <= 5) return 30;
  return 50;
}

function determineNewsVolatility(now: number, asset: AssetSymbol): "Low" | "Medium" | "High" {
  // Simulated: occasional high-impact news windows
  const minute = new Date(now).getUTCMinutes();
  const hour = new Date(now).getUTCHours();
  if (asset === "XAUUSD" && hour === 12 && minute < 30) return "High"; // CPI/NFP window proxy
  if (asset === "EURUSD" && hour === 12 && minute < 45) return "Medium";
  if (asset === "BTCUSD" && hour === 0 && minute < 15) return "Medium";
  if (minute % 30 === 0) return "Low";
  return "Low";
}

function getSpreadPips(asset: AssetSymbol): number {
  const base: Record<AssetSymbol, number> = {
    XAUUSD: 25,
    EURUSD: 0.8,
    GBPUSD: 1.2,
    EURJPY: 1.5,
    BTCUSD: 35,
  };
  return base[asset] + Math.random() * base[asset] * 0.5;
}

function higherTfBiasFromStructure(s: MarketStructureReading): "Up" | "Down" | "Flat" {
  if (s.trendDirection === "Up" && (s.state === "Trend" || s.state === "Breakout" || s.state === "Pullback")) return "Up";
  if (s.trendDirection === "Down" && (s.state === "Trend" || s.state === "Breakout" || s.state === "Pullback")) return "Down";
  return "Flat";
}

function pickNewsVolatility(now: number, asset: AssetSymbol): "Low" | "Medium" | "High" {
  // 5% chance of high-impact news each tick (simplified)
  const r = Math.random();
  if (r < 0.05) return "High";
  if (r < 0.15) return "Medium";
  return "Low";
}

export const useBekiBuffet = create<BekiBuffetState>((set, get) => ({
  mode: "Paused",
  startedAt: 0,
  dayStartEquity: 100000,
  balance: 100000,
  equity: 100000,
  floatingPnl: 0,
  consecutiveLosses: 0,
  snapshots: initialSnapshots(),
  campaigns: [],
  closedTrades: [],
  decisionLog: [],
  selfLearning: seedSetupStats(createSelfLearningState()),
  status: {
    mode: "Paused",
    ticksProcessed: 0,
    uptime: 0,
    lastDecisionTime: 0,
    decisionsTaken: 0,
    decisionsRejected: 0,
    decisionsWaiting: 0,
  },
  activeAsset: "XAUUSD",
  lastTickAt: 0,
  tickSpeedMs: 1500,
  ticksProcessed: 0,

  init: () => {
    // Prime the simulator for all assets so snapshots are populated immediately
    const now = Date.now();
    for (const asset of ASSET_ORDER) {
      marketTick(asset, now);
    }
    set({ startedAt: now, lastTickAt: now });
    get().tick();
  },

  tick: () => {
    const state = get();
    if (state.mode === "Halted") return;
    const now = Date.now();
    const isRunning = state.mode === "Running";

    // 1. Advance market data for every asset
    if (isRunning) {
      for (const asset of ASSET_ORDER) {
        marketTick(asset, now);
      }
    } else {
      // Even when paused, ensure simulator state exists so analysis can run
      for (const asset of ASSET_ORDER) {
        marketTick(asset, now); // marketTick is idempotent for same timestamp
      }
    }

    // 2. Per-asset analysis
    const newSnapshots: Record<AssetSymbol, AssetSnapshot | null> = { ...state.snapshots };
    let totalFloatingPnl = 0;

    for (const asset of ASSET_ORDER) {
      const preset = ASSET_PRESETS[asset];
      const candles = getCandles(asset);
      const execTf = preset.executionTimeframe;
      const biasTf = preset.biasTimeframe;
      const execCandles = candles[execTf];
      const biasCandles = candles[biasTf];

      const execStructure = analyzeMarketStructure(execCandles);
      const biasStructure = analyzeMarketStructure(biasCandles);

      const atrValue = atr(execCandles, 14);
      const atrPercentage = atrPct(execCandles, 14);
      const baselineATR = preset.basePrice * (preset.volatilityProfile === "Extreme" ? 0.01 : preset.volatilityProfile === "High" ? 0.005 : 0.002);
      const regimeInfo = deriveRegime(execStructure, atrPercentage, baselineATR);

      const regime: MarketRegime = {
        type: regimeInfo.type,
        direction: execStructure.trendDirection,
        strength: execStructure.confidence,
        volatilityPct: atrPercentage,
        confidence: regimeInfo.confidence,
      };

      const ichimoku = computeIchimoku(execCandles);
      const ichimokuHTF = computeIchimoku(biasCandles);
      const priceAction = analyzePriceAction(execCandles, execStructure);
      const price = getCurrentPrice(asset);

      const htfBias = higherTfBiasFromStructure(biasStructure);
      const ltfBias = higherTfBiasFromStructure(execStructure);
      const newsVolatility = pickNewsVolatility(now, asset);
      const sessionQuality = determineSessionQuality(now, asset);
      const spreadPips = getSpreadPips(asset);
      const maxSpreadPips = preset.volatilityProfile === "Extreme" ? 80 : preset.volatilityProfile === "High" ? 50 : 5;

      // Find existing open campaign for this asset
      const existingCampaign = state.campaigns.find(
        (c) => c.asset === asset && c.status !== "Closed" && c.status !== "Closing"
      );

      // Risk state
      const riskState = computeRiskState(
        state.equity,
        state.balance,
        state.floatingPnl,
        state.campaigns.filter((c) => c.status !== "Closed"),
        state.consecutiveLosses,
        state.dayStartEquity,
        preset
      );

      // Correlated exposure: aggregate % risk for assets in same group
      const group: AssetSymbol[] =
        asset === "XAUUSD"
          ? ["XAUUSD"]
          : asset === "BTCUSD"
          ? ["BTCUSD"]
          : ["EURUSD", "GBPUSD", "EURJPY"]; // USD/JPY group
      const correlatedExposurePct = state.campaigns
        .filter((c) => c.status !== "Closed" && group.includes(c.asset))
        .reduce((sum, c) => {
          const campaignRisk = c.positions.reduce((s, p) => {
            if (p.status === "Closed") return s;
            const stopDist = Math.abs(p.entryPrice - p.stopLoss);
            return s + stopDist * p.size;
          }, 0);
          return sum + (campaignRisk / state.equity) * 100;
        }, 0);

      // Do-Not-Trade engine
      const minATR = baselineATR * 0.5;
      const doNotTrade = evaluateDoNotTrade({
        ichimoku,
        atr: atrValue,
        minATR,
        structure: execStructure,
        higherTimeframeBias: htfBias,
        executionTimeframeBias: ltfBias,
        newsVolatility,
        correlatedExposurePct,
        maxCorrelationPct: 3.0,
        riskState,
        price,
        majorSupport: execStructure.swingLow,
        majorResistance: execStructure.swingHigh,
        minDistanceFromSRPct: 0.15,
        preset,
      });

      // Confluence scoring
      const confluence = scoreConfluence({
        structure: execStructure,
        ichimoku,
        priceAction,
        regime,
        preset,
        selfLearning: state.selfLearning,
        higherTimeframeBias: htfBias,
        newsVolatility,
        sessionQuality,
        spreadPips,
        maxSpreadPips,
      });

      // Compute floating PnL for any open positions on this asset
      const assetFloatingPnl = state.campaigns
        .filter((c) => c.asset === asset && c.status !== "Closed")
        .reduce((sum, c) => {
          return (
            sum +
            c.positions
              .filter((p) => p.status !== "Closed")
              .reduce((s, p) => {
                const dir = p.direction === "Long" ? 1 : -1;
                return s + (price - p.entryPrice) * dir * p.size;
              }, 0)
          );
        }, 0);
      totalFloatingPnl += assetFloatingPnl;

      newSnapshots[asset] = {
        symbol: asset,
        price,
        candles,
        structure: { H4: analyzeMarketStructure(candles.H4), H1: analyzeMarketStructure(candles.H1), M15: execStructure, M5: analyzeMarketStructure(candles.M5) },
        regime,
        ichimoku,
        ichimokuHTF,
        priceAction,
        confluence,
        doNotTrade,
        atr: atrValue,
        atrPct: atrPercentage,
        htfBias,
        ltfBias,
        newsVolatility,
        sessionQuality,
        spreadPips,
      };
    }

    // 3. Manage existing campaigns (breakeven, trail, partial, close) — only when running
    const candlesByAsset: { [asset: string]: Record<Timeframe, Candle[]> } = {};
    const presetByAsset: { [asset: string]: typeof ASSET_PRESETS[AssetSymbol] } = {};
    for (const asset of ASSET_ORDER) {
      candlesByAsset[asset] = getCandles(asset);
      presetByAsset[asset] = ASSET_PRESETS[asset];
    }
    const managed = isRunning
      ? manageCampaigns(state.campaigns, candlesByAsset, presetByAsset, now)
      : {
          updatedCampaigns: state.campaigns,
          decisions: [] as DecisionLogEntry[],
          closedPositions: [] as { position: Position; campaign: Campaign; reason: string; pnl: number }[],
        };

    // 4. Record closed trades + update balance
    // C4 FIX: Track consecutive losses at the CAMPAIGN level (one increment per
    // closed campaign, not per position). A campaign stop-out closes up to 3
    // positions at once; incrementing per-position would jump the ladder 3x.
    let balanceDelta = 0;
    let newConsecutiveLosses = state.consecutiveLosses;
    const newClosedTrades: TradeRecord[] = [...state.closedTrades];
    const newDecisions: DecisionLogEntry[] = [...state.decisionLog, ...managed.decisions];

    // Group closed positions by campaign to determine campaign-level PnL
    const closedByCampaign = new Map<string, { campaign: typeof managed.closedPositions[0]["campaign"]; totalPnl: number; positions: typeof managed.closedPositions }>();
    for (const closed of managed.closedPositions) {
      const existing = closedByCampaign.get(closed.campaign.id);
      if (existing) {
        existing.totalPnl += closed.pnl;
        existing.positions.push(closed);
      } else {
        closedByCampaign.set(closed.campaign.id, {
          campaign: closed.campaign,
          totalPnl: closed.pnl,
          positions: [closed],
        });
      }
    }

    // C5 FIX: Track starting index so each closed position gets its own trade record
    const tradesStartIdx = newClosedTrades.length;
    let tradeIdx = 0;
    for (const closed of managed.closedPositions) {
      const preset = ASSET_PRESETS[closed.campaign.asset];
      const snapshot = newSnapshots[closed.campaign.asset];
      const regime = snapshot?.regime.type ?? "Range";
      const ichimokuState = snapshot
        ? `${snapshot.ichimoku.cloudColor}/${snapshot.ichimoku.priceVsCloud}`
        : "unknown";
      const priceActionPattern = snapshot?.priceAction.pattern ?? "None";
      const session = preset.session;
      const record = buildTradeRecord(
        closed.position,
        regime,
        closed.reason,
        session,
        ichimokuState,
        priceActionPattern
      );
      newClosedTrades.push(record);
      balanceDelta += closed.pnl;
      tradeIdx++;
    }

    // C4 FIX: Consecutive-loss counter updates per-campaign, not per-position
    for (const [, { totalPnl }] of closedByCampaign) {
      if (totalPnl < 0) {
        newConsecutiveLosses += 1;
      } else if (totalPnl > 0) {
        newConsecutiveLosses = 0;
      }
    }

    // 5. Self-learning update — each closed position gets its own record
    let selfLearning = state.selfLearning;
    for (let i = 0; i < managed.closedPositions.length; i++) {
      const record = newClosedTrades[tradesStartIdx + i];
      if (record) selfLearning = recordTrade(selfLearning, record);
    }

    // 6. Open / scale campaigns based on confluence + do-not-trade (only when running)
    const updatedCampaigns = [...managed.updatedCampaigns];
    let decisionsTaken = state.status.decisionsTaken;
    let decisionsRejected = state.status.decisionsRejected;
    let decisionsWaiting = state.status.decisionsWaiting;

    if (isRunning) {
    for (const asset of ASSET_ORDER) {
      const snap = newSnapshots[asset];
      if (!snap || !snap.confluence || !snap.doNotTrade) continue;
      const preset = ASSET_PRESETS[asset];
      const existing = updatedCampaigns.find(
        (c) => c.asset === asset && c.status !== "Closed" && c.status !== "Closing"
      );

      // Decide action based on verdict
      const verdict = snap.confluence.verdict;
      const direction = snap.confluence.direction;

      if (verdict === "Trade" && direction !== "Neutral") {
        if (!snap.doNotTrade.allowTrade) {
          decisionsRejected++;
          newDecisions.push({
            id: `DEC-${now}-${asset}-dnt`,
            time: now,
            asset,
            action: "Reject",
            direction,
            score: snap.confluence.total,
            reason: `Do-Not-Trade: ${snap.doNotTrade.blockingReasons.join(", ")}`,
            price: snap.price,
          });
          continue;
        }

        if (!existing) {
          // Open new campaign
          const riskCtx: RiskContext = {
            preset,
            equity: state.equity,
            balance: state.balance + balanceDelta,
            floatingPnl: totalFloatingPnl,
            atr: snap.atr,
            atrPct: snap.atrPct,
            currentPrice: snap.price,
            openCampaigns: updatedCampaigns.filter((c) => c.status !== "Closed"),
            consecutiveLosses: newConsecutiveLosses,
            dayStartEquity: state.dayStartEquity,
          };
          const opened = openCampaign(preset, direction, snap.confluence, snap.price, snap.atr, riskCtx, now);
          if (opened) {
            updatedCampaigns.push(opened.campaign);
            newDecisions.push(opened.decision);
            decisionsTaken++;
          }
        } else if (existing.direction === direction && existing.positions.length < existing.maxScale) {
          // Scale in
          const riskCtx: RiskContext = {
            preset,
            equity: state.equity,
            balance: state.balance + balanceDelta,
            floatingPnl: totalFloatingPnl,
            atr: snap.atr,
            atrPct: snap.atrPct,
            currentPrice: snap.price,
            openCampaigns: updatedCampaigns.filter((c) => c.status !== "Closed"),
            consecutiveLosses: newConsecutiveLosses,
            dayStartEquity: state.dayStartEquity,
          };
          const scaled = scaleIntoCampaign(existing, preset, snap.confluence, snap.price, snap.atr, riskCtx, now);
          if (scaled) {
            newDecisions.push(scaled.decision);
            decisionsTaken++;
          }
        }
      } else if (verdict === "Reject") {
        decisionsRejected++;
      } else if (verdict === "Wait") {
        decisionsWaiting++;
      }
    }
    } // end if (isRunning)

    // 7. Compute updated equity and balance
    // C6 FIX: totalFloatingPnl was computed from state.campaigns (pre-mutation)
    // and includes positions that manageCampaigns just closed. Subtract the
    // closed positions' PnL to avoid double-counting (once realized in balance,
    // once still-floating in equity).
    const closedPnlSum = managed.closedPositions.reduce((s, c) => s + c.pnl, 0);
    const adjustedFloatingPnl = totalFloatingPnl - closedPnlSum;
    const newBalance = state.balance + balanceDelta;
    const newEquity = newBalance + adjustedFloatingPnl;

    // C7 FIX: Day rollover — reset dayStartEquity at the start of each UTC day
    const today = new Date(now).getUTCDate();
    const lastDay = new Date(state.lastTickAt || state.startedAt).getUTCDate();
    let newDayStartEquity = state.dayStartEquity;
    if (state.startedAt > 0 && today !== lastDay) {
      newDayStartEquity = newBalance; // reset baseline to start-of-day balance
    }

    // Halt if equity drops below 50% (catastrophic protection)
    let newMode: AgentMode = state.mode;
    if (Number.isFinite(newEquity) && newEquity < newDayStartEquity * 0.5) {
      newMode = "Halted";
      newDecisions.push({
        id: `DEC-${now}-halt`,
        time: now,
        asset: "SYSTEM",
        action: "Close",
        reason: `Agent halted — equity $${newEquity.toFixed(0)} dropped below 50% of day start $${newDayStartEquity.toFixed(0)}`,
        price: 0,
      });
    }
    // Safety: if equity is NaN/Infinity, halt immediately
    if (!Number.isFinite(newEquity)) {
      newMode = "Halted";
      newDecisions.push({
        id: `DEC-${now}-nan-halt`,
        time: now,
        asset: "SYSTEM",
        action: "Close",
        reason: `Agent halted — equity became non-finite (${newEquity})`,
        price: 0,
      });
    }

    // Trim decision log to last 200 entries
    const trimmedDecisions = newDecisions.slice(-200);

    const newTicksProcessed = isRunning ? state.ticksProcessed + 1 : state.ticksProcessed;
    set({
      snapshots: newSnapshots,
      campaigns: updatedCampaigns,
      closedTrades: newClosedTrades.slice(-500),
      decisionLog: trimmedDecisions,
      selfLearning,
      balance: newBalance,
      equity: Number.isFinite(newEquity) ? newEquity : state.balance,
      floatingPnl: adjustedFloatingPnl,
      consecutiveLosses: newConsecutiveLosses,
      dayStartEquity: newDayStartEquity,
      mode: newMode,
      lastTickAt: now,
      ticksProcessed: newTicksProcessed,
      status: {
        mode: newMode,
        ticksProcessed: newTicksProcessed,
        uptime: now - state.startedAt,
        lastDecisionTime: now,
        decisionsTaken,
        decisionsRejected,
        decisionsWaiting,
      },
    });
  },

  setActiveAsset: (s) => set({ activeAsset: s }),

  setMode: (m) => {
    set({ mode: m, status: { ...get().status, mode: m } });
    if (m === "Running" && get().startedAt === 0) {
      get().init();
    }
  },

  setTickSpeed: (ms) => set({ tickSpeedMs: ms }),

  reset: () => {
    resetSimulator();
    resetCounters("LIVE"); // only reset live namespace, not backtest
    set({
      mode: "Paused",
      startedAt: 0,
      dayStartEquity: 100000,
      balance: 100000,
      equity: 100000,
      floatingPnl: 0,
      consecutiveLosses: 0,
      snapshots: initialSnapshots(),
      campaigns: [],
      closedTrades: [],
      decisionLog: [],
      selfLearning: seedSetupStats(createSelfLearningState()),
      status: {
        mode: "Paused",
        ticksProcessed: 0,
        uptime: 0,
        lastDecisionTime: 0,
        decisionsTaken: 0,
        decisionsRejected: 0,
        decisionsWaiting: 0,
      },
      lastTickAt: 0,
      ticksProcessed: 0,
    });
  },
}));
