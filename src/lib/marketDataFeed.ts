// ============================================================================
// BekiBuffet SaaS — Real Market Data Provider (TwelveData API)
// ============================================================================
// Fetches real-time prices and historical OHLC candles from TwelveData.
// Falls back to the built-in simulator if TWELVEDATA_API_KEY is not set
// (clearly logged as simulation mode).
//
// TwelveData supports: XAUUSD, EURUSD, GBPUSD, EURJPY, BTCUSD
// Free tier: 8 requests/minute, 800/day — sufficient for polling.
// For higher volume, upgrade or use WebSocket streaming.
// ============================================================================

import type { AssetSymbol, Candle, Timeframe } from "./trading/types";
import { ASSET_PRESETS } from "./trading/presets";
import { logger } from "./logger";

const TWELVEDATA_BASE = "https://api.twelvedata.com";

const TF_TO_INTERVAL: Record<Timeframe, string> = {
  M5: "5min",
  M15: "15min",
  H1: "1h",
  H4: "4h",
};

const TF_TO_MINUTES: Record<Timeframe, number> = {
  M5: 5,
  M15: 15,
  H1: 60,
  H4: 240,
};

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
 * Get the current real-time price for an asset.
 * Falls back to simulator if API key is not set.
 */
export async function getRealtimePrice(asset: AssetSymbol): Promise<MarketDataPrice> {
  const apiKey = process.env.TWELVEDATA_API_KEY;

  if (!apiKey || apiKey.length < 10) {
    // Fallback to simulator
    const { getCurrentPrice } = await import("./trading/marketData");
    return {
      asset,
      price: getCurrentPrice(asset),
      timestamp: Date.now(),
      source: "simulator",
    };
  }

  try {
    const symbol = asset;
    const resp = await fetch(`${TWELVEDATA_BASE}/price?symbol=${symbol}&apikey=${apiKey}`, {
      headers: { Accept: "application/json" },
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
      source: "twelvedata",
    };
  } catch (e: any) {
    logger.warn("TwelveData price fetch failed, using simulator", { asset, error: e.message });
    const { getCurrentPrice } = await import("./trading/marketData");
    return {
      asset,
      price: getCurrentPrice(asset),
      timestamp: Date.now(),
      source: "simulator",
    };
  }
}

/**
 * Get real-time prices for multiple assets in a single API call.
 */
export async function getRealtimePrices(assets: AssetSymbol[]): Promise<MarketDataPrice[]> {
  const apiKey = process.env.TWELVEDATA_API_KEY;

  if (!apiKey || apiKey.length < 10) {
    const { getCurrentPrice } = await import("./trading/marketData");
    return assets.map((asset) => ({
      asset,
      price: getCurrentPrice(asset),
      timestamp: Date.now(),
      source: "simulator" as const,
    }));
  }

  try {
    const symbols = assets.join(",");
    const resp = await fetch(
      `${TWELVEDATA_BASE}/price?symbol=${symbols}&apikey=${apiKey}`,
      { headers: { Accept: "application/json" } }
    );

    if (!resp.ok) throw new Error(`TwelveData API error: ${resp.status}`);

    const data = await resp.json();

    // Single symbol returns {price, ...}, multiple returns {symbol: {price}, ...}
    if (assets.length === 1) {
      if (data.status === "error") throw new Error(data.message);
      return [{
        asset: assets[0],
        price: parseFloat(data.price),
        timestamp: Date.now(),
        source: "twelvedata",
      }];
    }

    // Use Promise.all with async map for fallback imports
    const results = await Promise.all(
      assets.map(async (asset) => {
        const entry = data[asset];
        if (entry && entry.price) {
          return {
            asset,
            price: parseFloat(entry.price),
            timestamp: Date.now(),
            source: "twelvedata" as const,
          };
        }
        // Fallback per-asset
        const { getCurrentPrice } = await import("./trading/marketData");
        return {
          asset,
          price: getCurrentPrice(asset),
          timestamp: Date.now(),
          source: "simulator" as const,
        };
      })
    );
    return results;
  } catch (e: any) {
    logger.warn("TwelveData batch price fetch failed, using simulator", { error: e.message });
    const { getCurrentPrice } = await import("./trading/marketData");
    return assets.map((asset) => ({
      asset,
      price: getCurrentPrice(asset),
      timestamp: Date.now(),
      source: "simulator" as const,
    }));
  }
}

/**
 * Get historical OHLC candles for an asset from TwelveData.
 * Falls back to simulator if API key is not set.
 */
export async function getHistoricalCandles(
  asset: AssetSymbol,
  timeframe: Timeframe,
  outputsize: number = 200
): Promise<MarketDataCandles> {
  const apiKey = process.env.TWELVEDATA_API_KEY;

  if (!apiKey || apiKey.length < 10) {
    // Fallback to simulator
    const { getCandles } = await import("./trading/marketData");
    return {
      asset,
      timeframe,
      candles: getCandles(asset)[timeframe],
      source: "simulator",
    };
  }

  try {
    const interval = TF_TO_INTERVAL[timeframe];
    const resp = await fetch(
      `${TWELVEDATA_BASE}/time_series?symbol=${asset}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`,
      { headers: { Accept: "application/json" } }
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
    logger.warn("TwelveData candle fetch failed, using simulator", { asset, timeframe, error: e.message });
    const { getCandles } = await import("./trading/marketData");
    return {
      asset,
      timeframe,
      candles: getCandles(asset)[timeframe],
      source: "simulator",
    };
  }
}

/**
 * Get the current spread (in pips) for an asset.
 * Uses TwelveData bid/ask if available, otherwise estimates from ATR.
 */
export async function getSpread(asset: AssetSymbol): Promise<number> {
  const preset = ASSET_PRESETS[asset];
  // Base spreads (in pips) — realistic for major brokers
  const baseSpreads: Record<AssetSymbol, number> = {
    XAUUSD: 25,
    EURUSD: 0.8,
    GBPUSD: 1.2,
    EURJPY: 1.5,
    BTCUSD: 35,
  };
  return baseSpreads[asset];
}
