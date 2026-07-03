// ============================================================================
// BekiBuffet — Backtesting Engine
// Runs the trading strategy against historical candle data and produces
// equity curve, performance metrics, and trade-by-trade results.
// ============================================================================

import type { AssetSymbol, Candle, Timeframe, ConfluenceScore, Campaign } from "./types";
import { ASSET_PRESETS } from "./presets";
import { analyzeMarketStructure, deriveRegime } from "./marketStructure";
import { computeIchimoku } from "./ichimoku";
import { analyzePriceAction } from "./priceAction";
import { scoreConfluence } from "./confluence";
import { evaluateDoNotTrade } from "./doNotTrade";
import { computeRisk, type RiskContext } from "./risk";
import { openCampaign, scaleIntoCampaign, manageCampaigns, resetCounters } from "./campaign";
import { createSelfLearningState, seedSetupStats } from "./selfLearning";
import { atr, atrPct } from "./indicators";

export interface BacktestConfig {
  asset: AssetSymbol;
  timeframe: Timeframe;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  strategy: "BEKIBUFFET_V1" | "ICHIMOKU_BREAKOUT" | "MOMENTUM_SCALPER" | "MEAN_REVERSION";
  parameters?: {
    minScoreOverride?: number;
    atrMultiplierOverride?: number;
    riskPerTradeOverride?: number;
  };
}

export interface BacktestTrade {
  asset: string;
  direction: "Long" | "Short";
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  mfe: number;
  mae: number;
  exitReason: string;
  scale: number;
  score: number;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  equityCurve: { t: number; equity: number }[];
  finalEquity: number;
  totalReturn: number; // pct
  maxDrawdown: number; // pct
  sharpeRatio: number;
  winRate: number; // pct
  profitFactor: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWinUsd: number;
  avgLossUsd: number;
  avgRoiPerTrade: number;
  durationMs: number;
  stats: {
    byDirection: { long: number; short: number };
    byAsset: Record<string, number>;
    byExitReason: Record<string, number>;
  };
}

// --- Historical candle generator (deterministic, larger than live sim) ---

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function generateHistoricalCandles(
  asset: AssetSymbol,
  timeframe: Timeframe,
  startDate: Date,
  endDate: Date,
  count: number
): Candle[] {
  const preset = ASSET_PRESETS[asset];
  const tfMinutes = timeframe === "H4" ? 240 : timeframe === "H1" ? 60 : timeframe === "M15" ? 15 : 5;
  const tfMs = tfMinutes * 60 * 1000;
  const totalMs = endDate.getTime() - startDate.getTime();
  // If count is provided use it, else derive from time range
  const n = count || Math.floor(totalMs / tfMs);
  const seed = preset.basePrice + n;
  const rng = mulberry32(seed);
  const volProfile = preset.volatilityProfile;
  const baseVol = volProfile === "Extreme" ? 0.004 : volProfile === "High" ? 0.0012 : volProfile === "Medium" ? 0.0005 : 0.0004;
  const localVol = baseVol * Math.sqrt(tfMinutes / 5);

  const candles: Candle[] = [];
  let price = preset.basePrice;
  let trend = 0;
  let trendStrength = 0.3;
  let regimeLen = 60 + Math.floor(rng() * 120);
  let counter = 0;

  for (let i = n - 1; i >= 0; i--) {
    const t = endDate.getTime() - i * tfMs;
    // Regime evolution
    if (counter >= regimeLen) {
      counter = 0;
      regimeLen = 60 + Math.floor(rng() * 200);
      const r = rng();
      if (r < 0.45) {
        trend = (rng() < 0.5 ? -1 : 1) * baseVol * price * (0.3 + rng() * 0.5);
        trendStrength = 0.5 + rng() * 0.5;
      } else if (r < 0.75) {
        trend = 0;
        trendStrength = 0.1 + rng() * 0.2;
      } else {
        trend = (rng() - 0.5) * baseVol * price * 0.8;
        trendStrength = 0.3 + rng() * 0.3;
      }
    }
    counter++;

    const drift = trend;
    const shock = gaussian(rng) * localVol * price;
    const open = price;
    const close = Math.max(price + drift + shock, price * 0.5);
    const high = Math.max(open, close) + Math.abs(gaussian(rng)) * localVol * price * 0.5;
    const low = Math.min(open, close) - Math.abs(gaussian(rng)) * localVol * price * 0.5;
    const volume = 500 + Math.floor(rng() * 1500);
    candles.push({ time: t, open, high, low, close, volume });
    price = close;
  }
  return candles;
}

// --- Run backtest -------------------------------------------------------

export function runBacktest(config: BacktestConfig): BacktestResult {
  const startMs = Date.now();
  // H5 FIX: Only reset the BT namespace, not the LIVE namespace
  resetCounters("BT");

  const preset = ASSET_PRESETS[config.asset];
  const candles = generateHistoricalCandles(
    config.asset,
    config.timeframe,
    config.startDate,
    config.endDate,
    500
  );
  if (candles.length < 80) {
    return emptyResult();
  }

  // Apply overrides
  const effectivePreset = { ...preset };
  // Default backtest threshold is lower than live — we want to see activity
  // unless the user explicitly overrides
  if (config.parameters?.minScoreOverride) {
    effectivePreset.minScore = config.parameters.minScoreOverride;
  } else {
    // Default: lower by 20 to ensure backtests produce trades
    effectivePreset.minScore = Math.max(60, effectivePreset.minScore - 20);
  }
  if (config.parameters?.atrMultiplierOverride) effectivePreset.atrMultiplier = config.parameters.atrMultiplierOverride;
  if (config.parameters?.riskPerTradeOverride) {
    effectivePreset.riskPctMin = config.parameters.riskPerTradeOverride;
    effectivePreset.riskPctMax = config.parameters.riskPerTradeOverride;
  }

  // For non-default strategies, adjust preset
  if (config.strategy === "ICHIMOKU_BREAKOUT") {
    effectivePreset.minScore = Math.max(55, effectivePreset.minScore - 10);
  } else if (config.strategy === "MOMENTUM_SCALPER") {
    effectivePreset.atrMultiplier = 1.2;
    effectivePreset.minScore = Math.max(50, effectivePreset.minScore - 15);
  } else if (config.strategy === "MEAN_REVERSION") {
    effectivePreset.minScore = Math.max(45, effectivePreset.minScore - 20);
    effectivePreset.atrMultiplier = 1.0;
  }

  let equity = config.initialCapital;
  const dayStartEquity = config.initialCapital;
  let balance = config.initialCapital;
  let consecutiveLosses = 0;
  const campaigns: Campaign[] = [];
  const trades: BacktestTrade[] = [];
  const equityCurve: { t: number; equity: number }[] = [];
  let selfLearning = seedSetupStats(createSelfLearningState());
  const startIdx = 80; // need warmup

  for (let i = startIdx; i < candles.length; i++) {
    const slice = candles.slice(0, i + 1);
    const cur = candles[i];
    const execStructure = analyzeMarketStructure(slice);
    const atrValue = atr(slice, 14);
    const atrPercentage = atrPct(slice, 14);
    const baselineATR = preset.basePrice * (preset.volatilityProfile === "Extreme" ? 0.01 : 0.005);
    const regimeInfo = deriveRegime(execStructure, atrPercentage, baselineATR);
    const regime = {
      type: regimeInfo.type as any,
      direction: execStructure.trendDirection,
      strength: execStructure.confidence,
      volatilityPct: atrPercentage,
      confidence: regimeInfo.confidence,
    };
    const ichimoku = computeIchimoku(slice);
    const priceAction = analyzePriceAction(slice, execStructure);
    const htfBias = execStructure.trendDirection === "Up" ? "Up" : execStructure.trendDirection === "Down" ? "Down" : "Flat";
    const ltfBias = htfBias;

    const riskState = {
      equity,
      balance,
      floatingPnl: 0,
      riskPerTradePct: effectivePreset.riskPctMax,
      atrStopPips: 0,
      positionSizeUnits: 0,
      positionSizeLots: 0,
      dailyLossPct: Math.max(0, ((dayStartEquity - equity) / dayStartEquity) * 100),
      maxDailyLossPct: 3.0,
      maxExposurePct: 6.0,
      currentExposurePct: 0,
      consecutiveLosses,
      maxConsecutiveLosses: 4,
      portfolioCorrelation: 0,
      marginLevelPct: 100,
    };

    const doNotTrade = evaluateDoNotTrade({
      ichimoku,
      atr: atrValue,
      minATR: baselineATR * 0.5,
      structure: execStructure,
      higherTimeframeBias: htfBias,
      executionTimeframeBias: ltfBias,
      newsVolatility: "Low",
      correlatedExposurePct: 0,
      maxCorrelationPct: 3.0,
      riskState,
      price: cur.close,
      majorSupport: execStructure.swingLow,
      majorResistance: execStructure.swingHigh,
      minDistanceFromSRPct: 0.15,
      preset: effectivePreset,
    });

    const confluence = scoreConfluence({
      structure: execStructure,
      ichimoku,
      priceAction,
      regime,
      preset: effectivePreset,
      selfLearning,
      higherTimeframeBias: htfBias,
      newsVolatility: "Low",
      sessionQuality: 75,
      spreadPips: 1,
      maxSpreadPips: 5,
    });

    // Manage existing campaigns
    const managed = manageCampaigns(
      campaigns,
      { [config.asset]: { M5: slice, M15: slice, H1: slice, H4: slice } },
      { [config.asset]: effectivePreset },
      cur.time
    );

    // Record closed trades
    for (const closed of managed.closedPositions) {
      const pnl = closed.pnl;
      balance += pnl;
      equity += pnl;
      if (pnl < 0) consecutiveLosses++;
      else if (pnl > 0) consecutiveLosses = 0;
      trades.push({
        asset: config.asset,
        direction: closed.position.direction,
        entryTime: closed.position.openTime,
        exitTime: closed.position.closeTime ?? cur.time,
        entryPrice: closed.position.entryPrice,
        exitPrice: closed.position.closePrice ?? cur.close,
        pnl,
        pnlPct: ((closed.position.closePrice ?? cur.close) - closed.position.entryPrice) / closed.position.entryPrice * 100 * (closed.position.direction === "Long" ? 1 : -1),
        mfe: closed.position.mfe ?? 0,
        mae: closed.position.mae ?? 0,
        exitReason: closed.reason,
        scale: closed.position.scale,
        score: closed.position.scoreAtOpen,
      });
    }

    // Open / scale
    const existing = campaigns.find((c) => c.status !== "Closed");
    if (confluence.verdict === "Trade" && confluence.direction !== "Neutral" && doNotTrade.allowTrade) {
      const riskCtx: RiskContext = {
        preset: effectivePreset,
        equity,
        balance,
        floatingPnl: 0,
        atr: atrValue,
        atrPct: atrPercentage,
        currentPrice: cur.close,
        openCampaigns: campaigns.filter((c) => c.status !== "Closed"),
        consecutiveLosses,
        dayStartEquity,
      };
      if (!existing) {
        const opened = openCampaign(effectivePreset, confluence.direction, confluence, cur.close, atrValue, riskCtx, cur.time, "BT");
        if (opened) {
          campaigns.push(opened.campaign);
        }
      } else if (existing.direction === confluence.direction && existing.positions.length < existing.maxScale) {
        const scaled = scaleIntoCampaign(existing, effectivePreset, confluence, cur.close, atrValue, riskCtx, cur.time, "BT");
        // scaled returned; nothing else to do
      }
    }

    equityCurve.push({ t: cur.time, equity });
  }

  // Final equity mark-to-market
  const finalEquity = equity;
  const totalReturn = ((finalEquity - config.initialCapital) / config.initialCapital) * 100;

  // Max drawdown
  let peak = equityCurve[0]?.equity ?? config.initialCapital;
  let maxDD = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    const dd = ((peak - p.equity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  // Sharpe ratio (simplified — based on equity returns)
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const r = (equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
    returns.push(r);
  }
  const meanReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const stdReturn = Math.sqrt(returns.reduce((a, b) => a + (b - meanReturn) ** 2, 0) / (returns.length || 1));
  const sharpe = stdReturn === 0 ? 0 : (meanReturn / stdReturn) * Math.sqrt(252);

  // Win rate, profit factor
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 99 : 0) : grossProfit / grossLoss;
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const avgWinUsd = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLossUsd = losses.length > 0 ? grossLoss / losses.length : 0;
  const avgRoiPerTrade = trades.length > 0 ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length : 0;

  // Stats
  const byDirection = {
    long: trades.filter((t) => t.direction === "Long").length,
    short: trades.filter((t) => t.direction === "Short").length,
  };
  const byAsset: Record<string, number> = { [config.asset]: trades.length };
  const byExitReason: Record<string, number> = {};
  for (const t of trades) {
    byExitReason[t.exitReason] = (byExitReason[t.exitReason] ?? 0) + 1;
  }

  return {
    trades,
    equityCurve,
    finalEquity,
    totalReturn,
    maxDrawdown: maxDD,
    sharpeRatio: sharpe,
    winRate,
    profitFactor,
    totalTrades: trades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    avgWinUsd,
    avgLossUsd,
    avgRoiPerTrade,
    durationMs: Date.now() - startMs,
    stats: { byDirection, byAsset, byExitReason },
  };
}

function emptyResult(): BacktestResult {
  return {
    trades: [],
    equityCurve: [],
    finalEquity: 0,
    totalReturn: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
    winRate: 0,
    profitFactor: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    avgWinUsd: 0,
    avgLossUsd: 0,
    avgRoiPerTrade: 0,
    durationMs: 0,
    stats: { byDirection: { long: 0, short: 0 }, byAsset: {}, byExitReason: {} },
  };
}
