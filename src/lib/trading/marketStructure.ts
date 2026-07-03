// ============================================================================
// BekiBuffet — Market Structure Engine (Module 1)
// Determines trend/pullback/compression/breakout/reversal/range from
// pure price action. No indicators. Everything starts here.
// ============================================================================

import type { Candle, MarketStructureReading, StructureState } from "./types";
import { findSwings, atr, atrPct } from "./indicators";

export function analyzeMarketStructure(candles: Candle[]): MarketStructureReading {
  if (candles.length < 30) {
    return {
      state: "Range",
      trendDirection: "Flat",
      swingHigh: candles.at(-1)?.high ?? 0,
      swingLow: candles.at(-1)?.low ?? 0,
      bos: false,
      choch: false,
      liquiditySwept: false,
      confidence: 10,
    };
  }

  const swings = findSwings(candles, 3);
  const recentSwings = swings.slice(-8);
  const lastHighs = recentSwings.filter((s) => s.type === "high");
  const lastLows = recentSwings.filter((s) => s.type === "low");

  const swingHigh = lastHighs.at(-1)?.price ?? Math.max(...candles.slice(-20).map((c) => c.high));
  const swingLow = lastLows.at(-1)?.price ?? Math.min(...candles.slice(-20).map((c) => c.low));

  // Trend = sequence of higher highs + higher lows (up) or lower highs + lower lows (down)
  let hhCount = 0;
  let lhCount = 0;
  let hlCount = 0;
  let llCount = 0;
  for (let i = 1; i < lastHighs.length; i++) {
    if (lastHighs[i].price > lastHighs[i - 1].price) hhCount++;
    else lhCount++;
  }
  for (let i = 1; i < lastLows.length; i++) {
    if (lastLows[i].price > lastLows[i - 1].price) hlCount++;
    else llCount++;
  }

  const upBias = hhCount + hlCount;
  const downBias = lhCount + llCount;
  const trendDirection: "Up" | "Down" | "Flat" =
    upBias > downBias + 1 ? "Up" : downBias > upBias + 1 ? "Down" : "Flat";

  // Break of structure: last close beyond last swing high/low in trend direction
  const lastClose = candles.at(-1)!.close;
  const prevHigh = lastHighs.at(-2)?.price ?? swingHigh;
  const prevLow = lastLows.at(-2)?.price ?? swingLow;
  const bos =
    (trendDirection === "Up" && lastClose > prevHigh) ||
    (trendDirection === "Down" && lastClose < prevLow);

  // Change of character: opposite-direction BoS after a trend
  const choch =
    (trendDirection === "Up" && lastClose < prevLow) ||
    (trendDirection === "Down" && lastClose > prevHigh);

  // Liquidity sweep: wick beyond swing high/low but close back inside
  const last = candles.at(-1)!;
  const liquiditySwept =
    (last.high > swingHigh && last.close < swingHigh) ||
    (last.low < swingLow && last.close > swingLow);

  // ATR for compression / expansion detection
  const atrValue = atr(candles, 14);
  const atrPercentage = atrPct(candles, 14);
  const recentRanges = candles.slice(-10).map((c) => c.high - c.low);
  const avgRange = recentRanges.reduce((a, b) => a + b, 0) / recentRanges.length;
  const compressionRatio = avgRange / atrValue;

  // Pullback: trend direction intact but last candle retraces > 0.5 * ATR against
  const priorClose = candles.at(-2)!.close;
  const pullback =
    trendDirection !== "Flat" &&
    ((trendDirection === "Up" && lastClose < priorClose - atrValue * 0.5) ||
      (trendDirection === "Down" && lastClose > priorClose + atrValue * 0.5));

  // Determine state ---------------------------------------------------------
  let state: StructureState;
  let confidence = 50;

  if (choch) {
    state = "Reversal";
    confidence = 75;
  } else if (bos && trendDirection !== "Flat") {
    state = "Breakout";
    confidence = 80;
  } else if (trendDirection !== "Flat" && pullback) {
    state = "Pullback";
    confidence = 70;
  } else if (trendDirection !== "Flat") {
    state = "Trend";
    confidence = 60 + Math.min(30, Math.abs(upBias - downBias) * 8);
  } else if (compressionRatio < 0.7) {
    state = "Compression";
    confidence = 65;
  } else if (compressionRatio > 1.4 && atrPercentage > 0.3) {
    state = "Breakout";
    confidence = 60;
  } else {
    state = "Range";
    confidence = 55;
  }

  return {
    state,
    trendDirection,
    swingHigh,
    swingLow,
    bos,
    choch,
    liquiditySwept,
    confidence,
  };
}

// Convenience: aggregate regime from structure + ATR ----------------------

export function deriveRegime(
  structure: MarketStructureReading,
  atrPercentage: number,
  atrBaseline: number
): { type: "Trend" | "Range" | "Transition" | "HighVolatility"; confidence: number } {
  const isHighVol = atrPercentage > atrBaseline * 2.2;
  const isLowVol = atrPercentage < atrBaseline * 0.6;
  if (isHighVol && (structure.state === "Breakout" || structure.state === "Reversal")) {
    return { type: "HighVolatility", confidence: 80 };
  }
  if (structure.state === "Trend" || structure.state === "Breakout") {
    return { type: "Trend", confidence: structure.confidence };
  }
  if (structure.state === "Range" || structure.state === "Compression") {
    return { type: "Range", confidence: structure.confidence };
  }
  if (structure.state === "Reversal" || structure.state === "Pullback" || isLowVol) {
    return { type: "Transition", confidence: structure.confidence };
  }
  return { type: "Range", confidence: 50 };
}
