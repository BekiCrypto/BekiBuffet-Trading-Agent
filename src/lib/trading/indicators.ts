// ============================================================================
// BekiBuffet — Technical Indicators
// All pure functions. No state. Deterministic given input candles.
// ============================================================================

import type { Candle } from "./types";

export function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : NaN);
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  let prev = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      prev = values[0];
      out.push(values[0]);
      continue;
    }
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function highest(values: number[], period: number, endIdx?: number): number {
  const end = endIdx ?? values.length - 1;
  const start = Math.max(0, end - period + 1);
  let h = -Infinity;
  for (let i = start; i <= end; i++) if (values[i] > h) h = values[i];
  return h === -Infinity ? NaN : h;
}

export function lowest(values: number[], period: number, endIdx?: number): number {
  const end = endIdx ?? values.length - 1;
  const start = Math.max(0, end - period + 1);
  let l = Infinity;
  for (let i = start; i <= end; i++) if (values[i] < l) l = values[i];
  return l === Infinity ? NaN : l;
}

// True Range / ATR ----------------------------------------------------------

export function trueRanges(candles: Candle[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      out.push(candles[i].high - candles[i].low);
      continue;
    }
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prevClose),
      Math.abs(candles[i].low - prevClose)
    );
    out.push(tr);
  }
  return out;
}

export function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs = trueRanges(candles);
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function atrSeries(candles: Candle[], period = 14): number[] {
  const trs = trueRanges(candles);
  return ema(trs, period);
}

// ATR as percentage of price — useful for regime detection ------------------

export function atrPct(candles: Candle[], period = 14): number {
  const last = candles[candles.length - 1];
  if (!last) return 0;
  return (atr(candles, period) / last.close) * 100;
}

// Standard deviation & volatility ------------------------------------------

export function stddev(values: number[], period: number): number {
  if (values.length < period) return 0;
  const slice = values.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
  return Math.sqrt(variance);
}

// RSI -----------------------------------------------------------------------

export function rsi(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change >= 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Swing highs/lows for market structure ------------------------------------

export interface SwingPoint {
  index: number;
  price: number;
  type: "high" | "low";
}

export function findSwings(candles: Candle[], lookback = 3): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) swings.push({ index: i, price: candles[i].high, type: "high" });
    if (isLow) swings.push({ index: i, price: candles[i].low, type: "low" });
  }
  return swings;
}

// Linear regression slope (degrees) ----------------------------------------

export function slopeDegrees(values: number[], period: number): number {
  if (values.length < period) return 0;
  const slice = values.slice(-period).filter((v) => !Number.isNaN(v));
  if (slice.length < 2) return 0;
  const n = slice.length;
  const xMean = (n - 1) / 2;
  const yMean = slice.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (slice[i] - yMean);
    den += (i - xMean) ** 2;
  }
  if (den === 0) return 0;
  const slope = num / den;
  const angleRad = Math.atan(slope / (yMean || 1));
  return (angleRad * 180) / Math.PI;
}

// Helpers -------------------------------------------------------------------

export function pct(a: number, b: number): number {
  if (b === 0) return 0;
  return ((a - b) / b) * 100;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
