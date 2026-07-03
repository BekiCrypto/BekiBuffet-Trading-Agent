// ============================================================================
// BekiBuffet SaaS — Real Market Data Provider (TwelveData API)
// ============================================================================
// Fetches real-time prices and historical OHLC candles from TwelveData.
//
// PRODUCTION BEHAVIOR:
//   - If TWELVEDATA_API_KEY is not set in production → throws an error
//   - No simulator fallback in production — every price is from the live API
//
// DEVELOPMENT BEHAVIOR:
//   - If TWELVEDATA_API_KEY is not set → falls back to built-in simulator
//   - Clearly logs "SIMULATOR MODE" so devs know data is synthetic
// ============================================================================

import type { AssetSymbol, Candle, Timeframe } from "./trading/types";
import { logger } from "./logger";

const TWELVEDATA_BASE = "https://api.twelvedata.com";

const TF_TO_INTERVAL: Record<Timeframe, string> = {
  M5: "5min",
  M15: "15min",
  H1: "1h",
  H4: "4h",
};

/**
 * Retry wrapper with exponential backoff.
 * Retries transient failures (network errors, 429, 5xx).
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 500
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      if (attempt === maxRetries) break;
      // Don't retry on 4xx errors (except 429)
      if (e.message?.includes("400") || e.message?.includes("401") || e.message?.includes("403")) {
        break;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      logger.warn("Retrying market data fetch", { attempt: attempt + 1, delay, error: e.message });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export interface MarketDataPrice {
  asset: AssetSymbol;
  price: number;
  timestamp: number;
  source: "twelvedata" | "simulator";
}

export interface MarketDataCandles {
  asset: AssetSymbol;
  timeframe: Timeframe;
  candles: Candle[];
  source: "twelvedata" | "simulator";
}

/**
 * Check if real market data is available (TWELVEDATA_API_KEY is set).
 */
export function isRealMarketDataEnabled(): boolean {
  return !!process.env.TWELVEDATA_API_KEY && process.env.TWELVEDATA_API_KEY.length > 10;
}

/**
 * In production, throw if market data is not configured.
 * In development, allow simulator fallback.
 */
function requireMarketDataOrFallback(): boolean {
  if (isRealMarketDataEnabled()) return true;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Market data is not configured. Set TWELVEDATA_API_KEY environment variable. " +
        "Live trading terminal is disabled until market data is available."
    );
  }
  logger.warn("TWELVEDATA_API_KEY not set — using SIMULATOR MODE (development only)");
  return false;
}

/**
 * Get simulator price (development only).
 */
async function getSimulatorPrice(asset: AssetSymbol): Promise<MarketDataPrice> {
  const { getCurrentPrice } = await import("./trading/marketData");
  return {
    asset,
    price: getCurrentPrice(asset),
    timestamp: Date.now(),
    source: "simulator",
  };
}

/**
 * Get the current real-time price for an asset.
 * PRODUCTION: Throws if TWELVEDATA_API_KEY is not set.
 * DEVELOPMENT: Falls back to simulator.
 */
export async function getRealtimePrice(asset: AssetSymbol): Promise<MarketDataPrice> {
  if (!requireMarketDataOrFallback()) {
    return getSimulatorPrice(asset);
  }

  const apiKey = process.env.TWELVEDATA_API_KEY!;
  try {
    return await withRetry(async () => {
      const resp = await fetch(`${TWELVEDATA_BASE}/price?symbol=${asset}&apikey=${apiKey}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!resp.ok) {
        throw new Error(`TwelveData API error: ${resp.status}`);
      }

      const data = await resp.json();

      if (data.status === "error") {
        throw new Error(data.message || "TwelveData API returned error");
      }

      return {
        asset,
        price: parseFloat(data.price),
        timestamp: Date.now(),
        source: "twelvedata" as const,
      };
    });
  } catch (e: any) {
    logger.error("TwelveData price fetch failed after retries", { asset, error: e.message });
    throw new Error(`Failed to fetch real-time price for ${asset}: ${e.message}`);
  }
}

/**
 * Get real-time prices for multiple assets in a single API call.
 */
export async function getRealtimePrices(assets: AssetSymbol[]): Promise<MarketDataPrice[]> {
  if (!requireMarketDataOrFallback()) {
    const { getCurrentPrice } = await import("./trading/marketData");
    return assets.map((asset) => ({
      asset,
      price: getCurrentPrice(asset),
      timestamp: Date.now(),
      source: "simulator" as const,
    }));
  }

  const apiKey = process.env.TWELVEDATA_API_KEY!;

  try {
    // TwelveData supports batch quotes
    const symbols = assets.join(",");
    const resp = await fetch(
      `${TWELVEDATA_BASE}/quote?symbol=${symbols}&apikey=${apiKey}`,
      { headers: { Accept: "application/json" }, cache: "no-store" }
    );

    if (!resp.ok) throw new Error(`TwelveData API error: ${resp.status}`);

    const data = await resp.json();

    // Single symbol returns an object, multiple returns array
    const results = Array.isArray(data) ? data : [data];

    return assets.map((asset, idx) => {
      const entry = results[idx];
      if (entry && entry.close) {
        return {
          asset,
          price: parseFloat(entry.close),
          timestamp: Date.now(),
          source: "twelvedata" as const,
        };
      }
      throw new Error(`No price data for ${asset}`);
    });
  } catch (e: any) {
    logger.error("TwelveData batch price fetch failed", { error: e.message });
    throw new Error(`Failed to fetch real-time prices: ${e.message}`);
  }
}

/**
 * Get historical OHLC candles for an asset from TwelveData.
 * PRODUCTION: Throws if TWELVEDATA_API_KEY is not set.
 */
export async function getHistoricalCandles(
  asset: AssetSymbol,
  timeframe: Timeframe,
  outputsize: number = 200
): Promise<MarketDataCandles> {
  if (!requireMarketDataOrFallback()) {
    const { getCandles } = await import("./trading/marketData");
    return {
      asset,
      timeframe,
      candles: getCandles(asset)[timeframe],
      source: "simulator",
    };
  }

  const apiKey = process.env.TWELVEDATA_API_KEY!;

  try {
    const interval = TF_TO_INTERVAL[timeframe];
    const resp = await fetch(
      `${TWELVEDATA_BASE}/time_series?symbol=${asset}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`,
      { headers: { Accept: "application/json" }, cache: "no-store" }
    );

    if (!resp.ok) throw new Error(`TwelveData API error: ${resp.status}`);

    const data = await resp.json();

    if (data.status === "error") {
      throw new Error(data.message || "TwelveData API returned error");
    }

    // TwelveData returns candles newest-first; we want oldest-first
    const candles: Candle[] = (data.values || [])
      .map((v: any) => ({
        time: new Date(v.datetime).getTime(),
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: parseFloat(v.volume) || 0,
      }))
      .reverse();

    return {
      asset,
      timeframe,
      candles,
      source: "twelvedata",
    };
  } catch (e: any) {
    logger.error("TwelveData candle fetch failed", { asset, timeframe, error: e.message });
    throw new Error(`Failed to fetch historical candles for ${asset}: ${e.message}`);
  }
}

/**
 * Get the current spread (in pips) for an asset.
 * Uses realistic broker spreads.
 */
export async function getSpread(asset: AssetSymbol): Promise<number> {
  const baseSpreads: Record<AssetSymbol, number> = {
    XAUUSD: 25,
    EURUSD: 0.8,
    GBPUSD: 1.2,
    EURJPY: 1.5,
    BTCUSD: 35,
  };
  return baseSpreads[asset];
}
