// ============================================================================
// BekiBuffet — Ichimoku Intelligence (Module 2)
// Not simple crossovers. Evaluates cloud thickness, slope, distance,
// future cloud, Chikou clearance, Tenkan/Kijun angles — each contributing
// to a composite directional score.
// ============================================================================

import type { Candle, IchimokuReading } from "./types";
import { highest, lowest, slopeDegrees, clamp } from "./indicators";

// Ichimoku standard parameters: 9, 26, 52
const TENKAN = 9;
const KIJUN = 26;
const SENKOU_B = 52;
const DISPLACEMENT = 26;

function tenkanSen(candles: Candle[], i: number): number {
  if (i < TENKAN - 1) return NaN;
  const slice = candles.slice(i - TENKAN + 1, i + 1);
  const h = Math.max(...slice.map((c) => c.high));
  const l = Math.min(...slice.map((c) => c.low));
  return (h + l) / 2;
}

function kijunSen(candles: Candle[], i: number): number {
  if (i < KIJUN - 1) return NaN;
  const slice = candles.slice(i - KIJUN + 1, i + 1);
  const h = Math.max(...slice.map((c) => c.high));
  const l = Math.min(...slice.map((c) => c.low));
  return (h + l) / 2;
}

export function computeIchimoku(candles: Candle[]): IchimokuReading {
  const n = candles.length;
  if (n < SENKOU_B + DISPLACEMENT) {
    return {
      tenkan: 0,
      kijun: 0,
      senkouA: 0,
      senkouB: 0,
      chikou: 0,
      cloudTop: 0,
      cloudBottom: 0,
      cloudThickness: 0,
      cloudSlope: 0,
      cloudColor: "Thin",
      priceVsCloud: "Inside",
      distanceFromCloudPct: 0,
      tenkanAngle: 0,
      kijunAngle: 0,
      tenkanVsKijun: "Neutral",
      chikouClearance: false,
      futureCloudColor: "Thin",
      futureCloudThickness: 0,
      score: 0,
    };
  }

  const lastIdx = n - 1;
  const tenkan = tenkanSen(candles, lastIdx);
  const kijun = kijunSen(candles, lastIdx);

  // Senkou A/B at current time (shifted back from future)
  const aIdx = lastIdx - DISPLACEMENT;
  const bIdx = lastIdx - DISPLACEMENT;
  const senkouA = (tenkanSen(candles, aIdx) + kijunSen(candles, aIdx)) / 2;
  const senkouB = (kijunSen(candles, bIdx - SENKOU_B + KIJUN) + kijunSen(candles, bIdx)) / 2;

  // Cloud geometry
  const cloudTop = Math.max(senkouA, senkouB);
  const cloudBottom = Math.min(senkouA, senkouB);
  const lastClose = candles[lastIdx].close;
  const cloudThickness = ((cloudTop - cloudBottom) / lastClose) * 100;

  // Cloud slope: compare current cloud A-B center to 26 bars ago
  const prevAIdx = aIdx - 10;
  const prevBIdx = bIdx - 10;
  const prevSenkouA = (tenkanSen(candles, prevAIdx) + kijunSen(candles, prevAIdx)) / 2;
  const prevSenkouB = (kijunSen(candles, prevBIdx - SENKOU_B + KIJUN) + kijunSen(candles, prevBIdx)) / 2;
  const cloudCenter = (senkouA + senkouB) / 2;
  const prevCloudCenter = (prevSenkouA + prevSenkouB) / 2;
  const cloudSlope = cloudCenter - prevCloudCenter;

  const cloudColor: IchimokuReading["cloudColor"] =
    senkouA > senkouB
      ? cloudThickness > 0.05
        ? "Bullish"
        : "Thin"
      : senkouA < senkouB
      ? cloudThickness > 0.05
        ? "Bearish"
        : "Thin"
      : "Thin";

  const priceVsCloud: IchimokuReading["priceVsCloud"] =
    lastClose > cloudTop ? "Above" : lastClose < cloudBottom ? "Below" : "Inside";

  const distanceFromCloudPct =
    priceVsCloud === "Above"
      ? ((lastClose - cloudTop) / lastClose) * 100
      : priceVsCloud === "Below"
      ? ((cloudBottom - lastClose) / lastClose) * 100
      : 0;

  // Tenkan/Kijun angles (linear regression slope over last 5 readings)
  const tenkanSeries: number[] = [];
  const kijunSeries: number[] = [];
  for (let i = 5; i >= 0; i--) {
    tenkanSeries.push(tenkanSen(candles, lastIdx - i));
    kijunSeries.push(kijunSen(candles, lastIdx - i));
  }
  const tenkanAngle = slopeDegrees(tenkanSeries, 6);
  const kijunAngle = slopeDegrees(kijunSeries, 6);

  const tenkanVsKijun: IchimokuReading["tenkanVsKijun"] =
    tenkan > kijun + lastClose * 0.0002
      ? "Bullish"
      : tenkan < kijun - lastClose * 0.0002
      ? "Bearish"
      : "Neutral";

  // Chikou clearance: current close > close 26 bars ago (for long), with margin
  const chikouRef = candles[lastIdx - DISPLACEMENT].close;
  const chikouSpan = lastClose; // chikou plotted as current close shifted back
  const chikouClearance =
    Math.abs(chikouSpan - chikouRef) > lastClose * 0.002;

  // Future cloud (project 26 bars forward using current tenkan/kijun)
  const futureSenkouA = (tenkan + kijun) / 2;
  const futureSenkouB = kijunSen(candles, lastIdx);
  const futureCloudColor: IchimokuReading["futureCloudColor"] =
    futureSenkouA > futureSenkouB
      ? Math.abs(futureSenkouA - futureSenkouB) > lastClose * 0.0005
        ? "Bullish"
        : "Thin"
      : futureSenkouA < futureSenkouB
      ? Math.abs(futureSenkouA - futureSenkouB) > lastClose * 0.0005
        ? "Bearish"
        : "Thin"
      : "Thin";
  const futureCloudThickness = (Math.abs(futureSenkouA - futureSenkouB) / lastClose) * 100;

  // Composite score -100..+100 --------------------------------------------
  let score = 0;

  // Price vs cloud (max 35)
  if (priceVsCloud === "Above") score += 35;
  else if (priceVsCloud === "Below") score -= 35;
  else score += cloudColor === "Bullish" ? 5 : cloudColor === "Bearish" ? -5 : 0;

  // Cloud color (max 20)
  if (cloudColor === "Bullish") score += 20;
  else if (cloudColor === "Bearish") score -= 20;

  // Cloud slope (max 10)
  score += clamp((cloudSlope / lastClose) * 5000, -10, 10);

  // Tenkan vs Kijun (max 15)
  if (tenkanVsKijun === "Bullish") score += 15;
  else if (tenkanVsKijun === "Bearish") score -= 15;

  // Chikou clearance in direction (max 10)
  if (chikouClearance && chikouSpan > chikouRef) score += 10;
  else if (chikouClearance && chikouSpan < chikouRef) score -= 10;

  // Future cloud (max 10)
  if (futureCloudColor === "Bullish") score += 10;
  else if (futureCloudColor === "Bearish") score -= 10;

  score = clamp(score, -100, 100);

  return {
    tenkan,
    kijun,
    senkouA,
    senkouB,
    chikou: chikouSpan,
    cloudTop,
    cloudBottom,
    cloudThickness,
    cloudSlope,
    cloudColor,
    priceVsCloud,
    distanceFromCloudPct,
    tenkanAngle,
    kijunAngle,
    tenkanVsKijun,
    chikouClearance,
    futureCloudColor,
    futureCloudThickness,
    score,
  };
}
