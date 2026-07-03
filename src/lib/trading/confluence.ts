// ============================================================================
// BekiBuffet — Confluence Scoring Engine
// Instead of hardcoding "buy when Tenkan crosses Kijun," we evaluate
// probability across independent factors. Each factor contributes a
// bounded slice of a 0-100 score. Trade only above a threshold.
// ============================================================================

import type {
  AssetPreset,
  ConfluenceFactor,
  ConfluenceScore,
  IchimokuReading,
  MarketRegime,
  MarketStructureReading,
  PriceActionReading,
  SelfLearningState,
} from "./types";
import { clamp } from "./indicators";

export interface ConfluenceInput {
  structure: MarketStructureReading;
  ichimoku: IchimokuReading;
  priceAction: PriceActionReading;
  regime: MarketRegime;
  preset: AssetPreset;
  selfLearning: SelfLearningState;
  higherTimeframeBias: "Up" | "Down" | "Flat";
  newsVolatility: "Low" | "Medium" | "High";
  sessionQuality: number; // 0-100
  spreadPips: number;
  maxSpreadPips: number;
}

// Baseline weights per factor (the self-learning module tunes these).
export const BASE_WEIGHTS = {
  trendAlignment: 25,
  cloudConfirmation: 20,
  higherTimeframeBias: 20,
  priceAction: 20,
  volatilityAcceptable: 10,
  sessionQuality: 5,
} as const;

export function scoreConfluence(input: ConfluenceInput): ConfluenceScore {
  const {
    structure,
    ichimoku,
    priceAction,
    regime,
    preset,
    selfLearning,
    higherTimeframeBias,
    newsVolatility,
    sessionQuality,
    spreadPips,
    maxSpreadPips,
  } = input;

  // Determine direction preference — majority vote across engines
  const directionVotes: ("Long" | "Short")[] = [];
  if (structure.trendDirection === "Up") directionVotes.push("Long");
  if (structure.trendDirection === "Down") directionVotes.push("Short");
  if (ichimoku.score > 20) directionVotes.push("Long");
  if (ichimoku.score < -20) directionVotes.push("Short");
  if (priceAction.direction === "Bullish") directionVotes.push("Long");
  if (priceAction.direction === "Bearish") directionVotes.push("Short");
  if (higherTimeframeBias === "Up") directionVotes.push("Long");
  if (higherTimeframeBias === "Down") directionVotes.push("Short");

  const longVotes = directionVotes.filter((d) => d === "Long").length;
  const shortVotes = directionVotes.filter((d) => d === "Short").length;
  const direction: "Long" | "Short" | "Neutral" =
    longVotes > shortVotes + 1 ? "Long" : shortVotes > longVotes + 1 ? "Short" : "Neutral";

  // Self-learning weight lookups (default 1.0, clamped 0.5..1.5)
  const slStats = selfLearning.setupStats;
  const weightFor = (setupKey: string): number => {
    const s = slStats[setupKey];
    if (!s) return 1.0;
    return s.weight;
  };
  const wTrend = weightFor("TrendAlignment");
  const wCloud = weightFor("CloudConfirmation");
  const wHTF = weightFor("HigherTimeframeBias");
  const wPA = weightFor(`PA_${priceAction.pattern}`);
  const wVol = weightFor("VolatilityAcceptable");
  const wSess = weightFor("SessionQuality");

  const factors: ConfluenceFactor[] = [];

  // 1. Trend alignment -----------------------------------------------------
  let trendScore = 0;
  let trendStatus: ConfluenceFactor["status"] = "fail";
  let trendReason = "No clear trend alignment";
  if (direction !== "Neutral" && structure.state !== "Range") {
    const alignedWithDir =
      (direction === "Long" && structure.trendDirection === "Up") ||
      (direction === "Short" && structure.trendDirection === "Down");
    if (alignedWithDir && (structure.state === "Trend" || structure.state === "Pullback")) {
      trendScore = structure.state === "Pullback" ? 22 : 25;
      trendStatus = "pass";
      trendReason = `${structure.state} aligned with ${direction}`;
    } else if (alignedWithDir && structure.state === "Breakout") {
      trendScore = 20;
      trendStatus = "pass";
      trendReason = "Breakout in trend direction";
    } else if (structure.state === "Pullback") {
      trendScore = 12;
      trendStatus = "partial";
      trendReason = "Pullback but direction unclear";
    }
  } else if (structure.state === "Reversal" && direction !== "Neutral") {
    trendScore = 15;
    trendStatus = "partial";
    trendReason = "Reversal signal — reduced conviction";
  }
  factors.push({
    name: "Trend Alignment",
    score: Math.round(trendScore * wTrend),
    maxScore: BASE_WEIGHTS.trendAlignment,
    reason: trendReason,
    status: trendStatus,
  });

  // 2. Cloud confirmation --------------------------------------------------
  let cloudScore = 0;
  let cloudStatus: ConfluenceFactor["status"] = "fail";
  let cloudReason = "Ichimoku cloud not confirming";
  const ichimokuDir =
    ichimoku.score > 20 ? "Long" : ichimoku.score < -20 ? "Short" : "Neutral";
  if (ichimokuDir === direction && direction !== "Neutral") {
    cloudScore = clamp((Math.abs(ichimoku.score) / 100) * BASE_WEIGHTS.cloudConfirmation, 0, BASE_WEIGHTS.cloudConfirmation);
    if (ichimoku.cloudColor !== "Thin" && ichimoku.priceVsCloud !== "Inside") {
      cloudStatus = "pass";
      cloudReason = `${ichimoku.cloudColor} cloud, price ${ichimoku.priceVsCloud.toLowerCase()}`;
    } else {
      cloudStatus = "partial";
      cloudReason = "Cloud aligned but thin or price inside";
    }
  } else if (ichimokuDir === "Neutral") {
    cloudStatus = "neutral";
    cloudReason = "Ichimoku neutral";
  }
  factors.push({
    name: "Cloud Confirmation",
    score: Math.round(cloudScore * wCloud),
    maxScore: BASE_WEIGHTS.cloudConfirmation,
    reason: cloudReason,
    status: cloudStatus,
  });

  // 3. Higher timeframe bias ----------------------------------------------
  let htfScore = 0;
  let htfStatus: ConfluenceFactor["status"] = "fail";
  let htfReason = "Higher timeframes disagree";
  if (direction !== "Neutral") {
    const htfAligned =
      (direction === "Long" && higherTimeframeBias === "Up") ||
      (direction === "Short" && higherTimeframeBias === "Down");
    if (htfAligned) {
      htfScore = BASE_WEIGHTS.higherTimeframeBias;
      htfStatus = "pass";
      htfReason = `HTF bias ${higherTimeframeBias}`;
    } else if (higherTimeframeBias === "Flat") {
      htfScore = 8;
      htfStatus = "partial";
      htfReason = "HTF flat";
    }
  }
  factors.push({
    name: "Higher Timeframe Bias",
    score: Math.round(htfScore * wHTF),
    maxScore: BASE_WEIGHTS.higherTimeframeBias,
    reason: htfReason,
    status: htfStatus,
  });

  // 4. Price action --------------------------------------------------------
  let paScore = 0;
  let paStatus: ConfluenceFactor["status"] = "fail";
  let paReason = "No high-probability pattern";
  if (priceAction.pattern !== "None" && priceAction.direction !== "Neutral") {
    if (priceAction.direction === (direction === "Long" ? "Bullish" : "Bearish")) {
      paScore = Math.round((priceAction.winRate / 100) * BASE_WEIGHTS.priceAction);
      paStatus = paScore >= 14 ? "pass" : "partial";
      paReason = `${priceAction.pattern} (${priceAction.winRate}% hist.)`;
    } else {
      paScore = 4;
      paStatus = "partial";
      paReason = `${priceAction.pattern} but against direction`;
    }
  } else if (priceAction.pattern !== "None") {
    paScore = 6;
    paStatus = "partial";
    paReason = `${priceAction.pattern} (neutral direction)`;
  }
  factors.push({
    name: "Price Action",
    score: Math.round(paScore * wPA),
    maxScore: BASE_WEIGHTS.priceAction,
    reason: paReason,
    status: paStatus,
  });

  // 5. Volatility acceptable ----------------------------------------------
  let volScore = 0;
  let volStatus: ConfluenceFactor["status"] = "fail";
  let volReason = "Volatility outside acceptable band";
  const volPct = regime.volatilityPct;
  const baselineByProfile: Record<string, number> = { Low: 0.15, Medium: 0.3, High: 0.6, Extreme: 1.5 };
  const baseline = baselineByProfile[preset.volatilityProfile] ?? 0.3;
  if (regime.type === "HighVolatility" && newsVolatility === "High") {
    volScore = 0;
    volStatus = "fail";
    volReason = "Extreme volatility + news risk";
  } else if (volPct < baseline * 0.4) {
    volScore = 4;
    volStatus = "partial";
    volReason = "Volatility too low — dead market";
  } else if (volPct > baseline * 2.5) {
    volScore = 4;
    volStatus = "partial";
    volReason = "Volatility too high — slippage risk";
  } else if (volPct >= baseline * 0.6 && volPct <= baseline * 2.0) {
    volScore = BASE_WEIGHTS.volatilityAcceptable;
    volStatus = "pass";
    volReason = `Volatility ${volPct.toFixed(2)}% in sweet spot`;
  } else {
    volScore = 7;
    volStatus = "partial";
    volReason = `Volatility ${volPct.toFixed(2)}% borderline`;
  }
  factors.push({
    name: "Volatility Acceptable",
    score: Math.round(volScore * wVol),
    maxScore: BASE_WEIGHTS.volatilityAcceptable,
    reason: volReason,
    status: volStatus,
  });

  // 6. Session quality ----------------------------------------------------
  let sessScore = Math.round((sessionQuality / 100) * BASE_WEIGHTS.sessionQuality);
  let sessStatus: ConfluenceFactor["status"] = sessScore >= 4 ? "pass" : "partial";
  let sessReason = `Session quality ${sessionQuality}/100`;
  // Spread penalty: if spread too wide, slash session score
  if (spreadPips > maxSpreadPips) {
    sessScore = 0;
    sessStatus = "fail";
    sessReason = `Spread ${spreadPips} > max ${maxSpreadPips} — reject`;
  }
  factors.push({
    name: "Session Quality",
    score: Math.round(sessScore * wSess),
    maxScore: BASE_WEIGHTS.sessionQuality,
    reason: sessReason,
    status: sessStatus,
  });

  // Total -----------------------------------------------------------------
  const totalRaw = factors.reduce((sum, f) => sum + f.score, 0);
  const total = clamp(Math.round(totalRaw), 0, 100);

  let verdict: ConfluenceScore["verdict"];
  if (direction === "Neutral") {
    verdict = "Wait";
  } else if (total >= preset.minScore) {
    verdict = "Trade";
  } else if (total >= preset.minScore - 8) {
    verdict = "Wait";
  } else {
    verdict = "Reject";
  }

  return {
    total,
    threshold: preset.minScore,
    factors,
    verdict,
    direction,
  };
}
