// ============================================================================
// BekiBuffet — Price Action Intelligence (Module 3)
// Recognizes candlestick patterns and structure events. Each pattern
// carries its own historical win rate derived from the journal.
// ============================================================================

import type { Candle, PriceActionPattern, PriceActionReading } from "./types";
import { atr } from "./indicators";

// Historical win rates per pattern (from the journal baseline)
const PATTERN_WIN_RATES: Record<PriceActionPattern, number> = {
  BullishEngulfing: 62,
  BearishEngulfing: 61,
  BullishPinBar: 58,
  BearishPinBar: 57,
  InsideBar: 52,
  OutsideBar: 50,
  BreakOfStructure: 67,
  LiquiditySweep: 64,
  MomentumCandle: 60,
  StrongRejection: 56,
  BreakAndRetest: 65,
  None: 0,
};

const PATTERN_DESCRIPTIONS: Record<PriceActionPattern, string> = {
  BullishEngulfing: "Bullish engulfing — current candle body fully engulfs prior bearish body",
  BearishEngulfing: "Bearish engulfing — current candle body fully engulfs prior bullish body",
  BullishPinBar: "Bullish pin bar — long lower wick rejection of prior lows",
  BearishPinBar: "Bearish pin bar — long upper wick rejection of prior highs",
  InsideBar: "Inside bar — compression, current range contained within prior range",
  OutsideBar: "Outside bar — current range engulfs prior range, expansion signal",
  BreakOfStructure: "Break of structure — close beyond prior swing in trend direction",
  LiquiditySweep: "Liquidity sweep — wick beyond swing then close back inside, stops hunted",
  MomentumCandle: "Momentum candle — body > 2× ATR, strong directional conviction",
  StrongRejection: "Strong rejection — long wick against attempted direction",
  BreakAndRetest: "Break and retest — price returned to prior swing as new S/R",
  None: "No high-probability pattern detected",
};

function body(c: Candle): number {
  return Math.abs(c.close - c.open);
}

function range(c: Candle): number {
  return c.high - c.low;
}

function upperWick(c: Candle): number {
  return c.high - Math.max(c.open, c.close);
}

function lowerWick(c: Candle): number {
  return Math.min(c.open, c.close) - c.low;
}

export function analyzePriceAction(
  candles: Candle[],
  structure: { bos: boolean; choch: boolean; liquiditySwept: boolean; swingHigh: number; swingLow: number }
): PriceActionReading {
  const n = candles.length;
  if (n < 3) {
    return { pattern: "None", direction: "Neutral", winRate: 0, confidence: 0, description: PATTERN_DESCRIPTIONS.None };
  }

  const cur = candles[n - 1];
  const prev = candles[n - 2];
  const prev2 = candles[n - 3];
  const atrValue = atr(candles, 14);
  const curBody = body(cur);
  const curRange = range(cur);
  const prevBody = body(prev);
  const prevRange = range(prev);

  // Priority: structure events first, then candle patterns --------

  // Break of structure
  if (structure.bos) {
    const direction = cur.close > prev.close ? "Bullish" : "Bearish";
    return {
      pattern: "BreakOfStructure",
      direction,
      winRate: PATTERN_WIN_RATES.BreakOfStructure,
      confidence: 80,
      description: PATTERN_DESCRIPTIONS.BreakOfStructure,
    };
  }

  // Liquidity sweep
  if (structure.liquiditySwept) {
    const sweptHigh = cur.high > structure.swingHigh && cur.close < structure.swingHigh;
    const direction = sweptHigh ? "Bearish" : "Bullish";
    return {
      pattern: "LiquiditySweep",
      direction,
      winRate: PATTERN_WIN_RATES.LiquiditySweep,
      confidence: 75,
      description: PATTERN_DESCRIPTIONS.LiquiditySweep,
    };
  }

  // Momentum candle (body > 2× ATR)
  if (curBody > atrValue * 2 && curBody / curRange > 0.7) {
    const direction = cur.close > cur.open ? "Bullish" : "Bearish";
    return {
      pattern: "MomentumCandle",
      direction,
      winRate: PATTERN_WIN_RATES.MomentumCandle,
      confidence: 70,
      description: PATTERN_DESCRIPTIONS.MomentumCandle,
    };
  }

  // Bullish / Bearish Engulfing
  if (prev.close < prev.open && cur.close > cur.open && cur.close >= prev.open && cur.open <= prev.close) {
    return {
      pattern: "BullishEngulfing",
      direction: "Bullish",
      winRate: PATTERN_WIN_RATES.BullishEngulfing,
      confidence: 68,
      description: PATTERN_DESCRIPTIONS.BullishEngulfing,
    };
  }
  if (prev.close > prev.open && cur.close < cur.open && cur.close <= prev.open && cur.open >= prev.close) {
    return {
      pattern: "BearishEngulfing",
      direction: "Bearish",
      winRate: PATTERN_WIN_RATES.BearishEngulfing,
      confidence: 67,
      description: PATTERN_DESCRIPTIONS.BearishEngulfing,
    };
  }

  // Pin bars (wick > 60% of range, body in opposite third)
  if (curRange > 0 && lowerWick(cur) / curRange > 0.6 && curBody / curRange < 0.35 && cur.close > cur.open) {
    return {
      pattern: "BullishPinBar",
      direction: "Bullish",
      winRate: PATTERN_WIN_RATES.BullishPinBar,
      confidence: 64,
      description: PATTERN_DESCRIPTIONS.BullishPinBar,
    };
  }
  if (curRange > 0 && upperWick(cur) / curRange > 0.6 && curBody / curRange < 0.35 && cur.close < cur.open) {
    return {
      pattern: "BearishPinBar",
      direction: "Bearish",
      winRate: PATTERN_WIN_RATES.BearishPinBar,
      confidence: 63,
      description: PATTERN_DESCRIPTIONS.BearishPinBar,
    };
  }

  // Strong rejection (any direction)
  if (curRange > 0 && (lowerWick(cur) / curRange > 0.55 || upperWick(cur) / curRange > 0.55)) {
    const direction = lowerWick(cur) > upperWick(cur) ? "Bullish" : "Bearish";
    return {
      pattern: "StrongRejection",
      direction,
      winRate: PATTERN_WIN_RATES.StrongRejection,
      confidence: 55,
      description: PATTERN_DESCRIPTIONS.StrongRejection,
    };
  }

  // Outside bar
  if (cur.high > prev.high && cur.low < prev.low) {
    const direction = cur.close > cur.open ? "Bullish" : "Bearish";
    return {
      pattern: "OutsideBar",
      direction,
      winRate: PATTERN_WIN_RATES.OutsideBar,
      confidence: 50,
      description: PATTERN_DESCRIPTIONS.OutsideBar,
    };
  }

  // Inside bar
  if (cur.high <= prev.high && cur.low >= prev.low) {
    return {
      pattern: "InsideBar",
      direction: "Neutral",
      winRate: PATTERN_WIN_RATES.InsideBar,
      confidence: 45,
      description: PATTERN_DESCRIPTIONS.InsideBar,
    };
  }

  // Break and retest: 3-bar sequence — break, then return to prior swing
  const brokeUp = prev2.close > structure.swingHigh || prev.close > structure.swingHigh;
  const brokeDown = prev2.close < structure.swingLow || prev.close < structure.swingLow;
  if (brokeUp && Math.abs(cur.close - structure.swingHigh) / cur.close < 0.001) {
    return {
      pattern: "BreakAndRetest",
      direction: "Bullish",
      winRate: PATTERN_WIN_RATES.BreakAndRetest,
      confidence: 62,
      description: PATTERN_DESCRIPTIONS.BreakAndRetest,
    };
  }
  if (brokeDown && Math.abs(cur.close - structure.swingLow) / cur.close < 0.001) {
    return {
      pattern: "BreakAndRetest",
      direction: "Bearish",
      winRate: PATTERN_WIN_RATES.BreakAndRetest,
      confidence: 62,
      description: PATTERN_DESCRIPTIONS.BreakAndRetest,
    };
  }

  return {
    pattern: "None",
    direction: "Neutral",
    winRate: 0,
    confidence: 20,
    description: PATTERN_DESCRIPTIONS.None,
  };
}

export { PATTERN_WIN_RATES };
