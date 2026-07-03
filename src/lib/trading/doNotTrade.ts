// ============================================================================
// BekiBuffet — Do-Not-Trade Engine
// "Many profitable systems gain more by avoiding poor trades than by
// finding additional entries." The journal captured successful executions
// but not explicit reasons for skipping trades. This engine fills that gap.
// ============================================================================

import type {
  AssetPreset,
  Campaign,
  DoNotTradeEvaluation,
  DoNotTradeReason,
  IchimokuReading,
  MarketRegime,
  MarketStructureReading,
  RiskState,
} from "./types";

export interface DoNotTradeInput {
  ichimoku: IchimokuReading;
  atr: number;
  minATR: number;
  structure: MarketStructureReading;
  higherTimeframeBias: "Up" | "Down" | "Flat";
  executionTimeframeBias: "Up" | "Down" | "Flat";
  newsVolatility: "Low" | "Medium" | "High";
  correlatedExposurePct: number;
  maxCorrelationPct: number;
  riskState: RiskState;
  price: number;
  majorSupport: number;
  majorResistance: number;
  minDistanceFromSRPct: number;
  preset: AssetPreset;
}

export function evaluateDoNotTrade(input: DoNotTradeInput): DoNotTradeEvaluation {
  const reasons: DoNotTradeReason[] = [];

  // 1. Cloud is flat
  const cloudFlat = Math.abs(input.ichimoku.cloudSlope) < input.price * 0.0001;
  reasons.push({
    rule: "Cloud is flat",
    triggered: cloudFlat,
    detail: cloudFlat
      ? `Cloud slope ${input.ichimoku.cloudSlope.toFixed(5)} below threshold — no directional conviction`
      : `Cloud slope ${input.ichimoku.cloudSlope.toFixed(5)} acceptable`,
  });

  // 2. ATR below minimum threshold
  const atrTooLow = input.atr < input.minATR;
  reasons.push({
    rule: "ATR below minimum",
    triggered: atrTooLow,
    detail: atrTooLow
      ? `ATR ${input.atr.toFixed(5)} < min ${input.minATR.toFixed(5)} — market dead`
      : `ATR ${input.atr.toFixed(5)} above min ${input.minATR.toFixed(5)}`,
  });

  // 3. Major S/R too close
  const distToSup = Math.abs(input.price - input.majorSupport) / input.price * 100;
  const distToRes = Math.abs(input.price - input.majorResistance) / input.price * 100;
  const tooCloseToSR = distToSup < input.minDistanceFromSRPct || distToRes < input.minDistanceFromSRPct;
  reasons.push({
    rule: "Major S/R too close",
    triggered: tooCloseToSR,
    detail: tooCloseToSR
      ? `Distance to S/R: ${Math.min(distToSup, distToRes).toFixed(3)}% < ${input.minDistanceFromSRPct}%`
      : `Distance to S/R: ${Math.min(distToSup, distToRes).toFixed(3)}%`,
  });

  // 4. Higher timeframes disagree
  const htfDisagree =
    (input.higherTimeframeBias === "Up" && input.executionTimeframeBias === "Down") ||
    (input.higherTimeframeBias === "Down" && input.executionTimeframeBias === "Up");
  reasons.push({
    rule: "Higher timeframes disagree",
    triggered: htfDisagree,
    detail: htfDisagree
      ? `HTF ${input.higherTimeframeBias} vs LTF ${input.executionTimeframeBias} — wait for alignment`
      : `HTF ${input.higherTimeframeBias}, LTF ${input.executionTimeframeBias} aligned`,
  });

  // 5. Price extended far from equilibrium (cloud center)
  const equilibrium = (input.ichimoku.cloudTop + input.ichimoku.cloudBottom) / 2;
  const extension = Math.abs(input.price - equilibrium) / input.price * 100;
  const tooExtended = extension > 1.5;
  reasons.push({
    rule: "Price extended from equilibrium",
    triggered: tooExtended,
    detail: tooExtended
      ? `${extension.toFixed(3)}% from cloud center — chasing`
      : `${extension.toFixed(3)}% from cloud center — acceptable`,
  });

  // 6. News volatility exceeds acceptable limits
  const newsHigh = input.newsVolatility === "High";
  reasons.push({
    rule: "News volatility high",
    triggered: newsHigh,
    detail: newsHigh
      ? `News volatility ${input.newsVolatility} — stand aside`
      : `News volatility ${input.newsVolatility}`,
  });

  // 7. Correlated instruments already carry exposure
  const correlatedOver = input.correlatedExposurePct > input.maxCorrelationPct;
  reasons.push({
    rule: "Correlated exposure too high",
    triggered: correlatedOver,
    detail: correlatedOver
      ? `Correlated exposure ${input.correlatedExposurePct.toFixed(2)}% > max ${input.maxCorrelationPct}%`
      : `Correlated exposure ${input.correlatedExposurePct.toFixed(2)}% within limit`,
  });

  // 8. Daily drawdown limit reached
  const dailyLimitHit = input.riskState.dailyLossPct >= input.riskState.maxDailyLossPct;
  reasons.push({
    rule: "Daily drawdown limit reached",
    triggered: dailyLimitHit,
    detail: dailyLimitHit
      ? `Daily loss ${input.riskState.dailyLossPct.toFixed(2)}% ≥ max ${input.riskState.maxDailyLossPct}%`
      : `Daily loss ${input.riskState.dailyLossPct.toFixed(2)}% within limit`,
  });

  // 9. Consecutive loss limit reached
  const consecLimitHit = input.riskState.consecutiveLosses >= input.riskState.maxConsecutiveLosses;
  reasons.push({
    rule: "Consecutive loss limit reached",
    triggered: consecLimitHit,
    detail: consecLimitHit
      ? `${input.riskState.consecutiveLosses} consecutive losses ≥ max ${input.riskState.maxConsecutiveLosses}`
      : `${input.riskState.consecutiveLosses} consecutive losses`,
  });

  const blockingReasons = reasons.filter((r) => r.triggered).map((r) => r.rule);

  return {
    allowTrade: blockingReasons.length === 0,
    reasons,
    blockingReasons,
  };
}
