// ============================================================================
// BekiBuffet — Market Data Simulator
// Generates realistic multi-timeframe candle streams per asset.
// Uses geometric Brownian motion + regime drift + volatility clustering.
// ============================================================================

import type { AssetSymbol, Candle, Timeframe } from "./types";
import { TF_MINUTES } from "./types";
import { ASSET_PRESETS } from "./presets";

// --- Internal state per asset ---------------------------------------------

interface AssetSimState {
  symbol: AssetSymbol;
  price: number;
  trend: number; // signed drift bias, refreshed periodically
  trendStrength: number; // 0-1
  volatility: number; // base vol as fraction of price
  regimeCounter: number;
  regimeLength: number;
  lastTick: number;
  // Rolling candle buffers per timeframe
  candles: Record<Timeframe, Candle[]>;
  // Partial candle builders per timeframe
  builders: Record<Timeframe, Partial<Candle> & { time: number }>;
}

const SEED_HISTORY_LENGTH: Record<Timeframe, number> = {
  H4: 120,
  H1: 200,
  M15: 200,
  M5: 200,
};

// Deterministic PRNG so runs are reproducible per session --------------

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

// Per-asset RNG seeds
const SEEDS: Record<AssetSymbol, number> = {
  XAUUSD: 1337,
  EURUSD: 4242,
  GBPUSD: 9001,
  EURJPY: 7331,
  BTCUSD: 31337,
};

const rngs: Partial<Record<AssetSymbol, () => number>> = {};

function rng(symbol: AssetSymbol): number {
  if (!rngs[symbol]) rngs[symbol] = mulberry32(SEEDS[symbol]);
  return rngs[symbol]!();
}

function gaussian(symbol: AssetSymbol): number {
  // Box-Muller
  const u1 = Math.max(rng(symbol), 1e-9);
  const u2 = rng(symbol);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// --- Volatility profile per asset (fraction of price per M5 bar) ----------

const VOL_PROFILE: Record<AssetSymbol, number> = {
  XAUUSD: 0.0012,
  EURUSD: 0.0004,
  GBPUSD: 0.0005,
  EURJPY: 0.0005,
  BTCUSD: 0.004,
};

// --- Initialization -------------------------------------------------------

const states: Partial<Record<AssetSymbol, AssetSimState>> = {};

function initState(symbol: AssetSymbol, now: number): AssetSimState {
  const preset = ASSET_PRESETS[symbol];
  const basePrice = preset.basePrice;
  const candles: Record<Timeframe, Candle[]> = { H4: [], H1: [], M15: [], M5: [] };
  const builders: Record<Timeframe, any> = { H4: null, H1: null, M15: null, M5: null };

  const state: AssetSimState = {
    symbol,
    price: basePrice,
    trend: 0,
    trendStrength: 0.3,
    volatility: VOL_PROFILE[symbol],
    regimeCounter: 0,
    regimeLength: 60 + Math.floor(rng(symbol) * 120),
    lastTick: now,
    candles,
    builders,
  };

  // Seed historical candles for each timeframe, oldest -> newest
  (Object.keys(TF_MINUTES) as Timeframe[]).forEach((tf) => {
    const minutes = TF_MINUTES[tf];
    const len = SEED_HISTORY_LENGTH[tf];
    const tfMs = minutes * 60 * 1000;
    const series: Candle[] = [];
    let p = basePrice;
    let localTrend = 0;
    let localVol = VOL_PROFILE[symbol] * Math.sqrt(minutes / 5);
    for (let i = len - 1; i >= 0; i--) {
      const t = now - i * tfMs;
      // Occasionally change local trend
      if (rng(symbol) < 0.06) {
        localTrend = (rng(symbol) - 0.5) * 2 * localVol * 0.4;
      }
      if (rng(symbol) < 0.04) {
        localVol = VOL_PROFILE[symbol] * Math.sqrt(minutes / 5) * (0.6 + rng(symbol) * 1.4);
      }
      const open = p;
      const drift = localTrend;
      const shock = gaussian(symbol) * localVol * p;
      const close = Math.max(p + drift + shock, p * 0.5);
      const high = Math.max(open, close) + Math.abs(gaussian(symbol)) * localVol * p * 0.5;
      const low = Math.min(open, close) - Math.abs(gaussian(symbol)) * localVol * p * 0.5;
      const volume = 500 + Math.floor(rng(symbol) * 1500);
      series.push({ time: t, open, high, low, close, volume });
      p = close;
    }
    // Set current price to last close of M5
    if (tf === "M5") state.price = series[series.length - 1].close;
    candles[tf] = series;
  });

  return state;
}

// --- Regime evolution -----------------------------------------------------

function evolveRegime(s: AssetSimState) {
  s.regimeCounter++;
  if (s.regimeCounter < s.regimeLength) return;
  s.regimeCounter = 0;
  s.regimeLength = 60 + Math.floor(rng(s.symbol) * 200);
  const r = rng(s.symbol);
  if (r < 0.45) {
    // Trending regime
    s.trend = (rng(s.symbol) < 0.5 ? -1 : 1) * s.volatility * s.price * (0.3 + rng(s.symbol) * 0.5);
    s.trendStrength = 0.5 + rng(s.symbol) * 0.5;
  } else if (r < 0.75) {
    // Range regime
    s.trend = 0;
    s.trendStrength = 0.1 + rng(s.symbol) * 0.2;
  } else {
    // High volatility / transition
    s.trend = (rng(s.symbol) - 0.5) * s.volatility * s.price * 0.8;
    s.trendStrength = 0.3 + rng(s.symbol) * 0.3;
    s.volatility = VOL_PROFILE[s.symbol] * (1.4 + rng(s.symbol) * 0.8);
  }
  // mean-revert volatility
  s.volatility = s.volatility * 0.97 + VOL_PROFILE[s.symbol] * 0.03;
}

// --- Tick generation ------------------------------------------------------

export interface TickResult {
  asset: AssetSymbol;
  price: number;
  time: number;
  closedCandles: { tf: Timeframe; candle: Candle }[];
  updatedCandles: Record<Timeframe, Candle[]>;
}

export function tick(asset: AssetSymbol, now: number): TickResult {
  let s = states[asset];
  if (!s) {
    s = initState(asset, now);
    states[asset] = s;
  }

  evolveRegime(s);

  // Advance price by one M5 step (each tick is roughly M5 cadence)
  const drift = s.trend;
  const shock = gaussian(asset) * s.volatility * s.price;
  const newPrice = Math.max(s.price + drift + shock, s.price * 0.5);
  s.price = newPrice;
  s.lastTick = now;

  const closedCandles: { tf: Timeframe; candle: Candle }[] = [];

  // For each timeframe, decide if a candle just closed and update builder
  (Object.keys(TF_MINUTES) as Timeframe[]).forEach((tf) => {
    const minutes = TF_MINUTES[tf];
    const tfMs = minutes * 60 * 1000;
    // Simulate accelerated time so each tick closes an M5 candle and rolls up.
    // We use simulation time anchored at `now` and step M5 boundaries.
    const bucket = Math.floor(now / tfMs) * tfMs;
    const builder = s.builders[tf];
    if (!builder || builder.time !== bucket) {
      // close previous builder if exists
      if (builder && builder.open !== undefined) {
        const closed: Candle = {
          time: builder.time,
          open: builder.open,
          high: builder.high!,
          low: builder.low!,
          close: builder.close!,
          volume: builder.volume!,
        };
        s.candles[tf].push(closed);
        if (s.candles[tf].length > 300) s.candles[tf].shift();
        closedCandles.push({ tf, candle: closed });
      }
      // start new builder
      s.builders[tf] = {
        time: bucket,
        open: newPrice,
        high: newPrice,
        low: newPrice,
        close: newPrice,
        volume: 100 + Math.floor(rng(asset) * 300),
      };
    } else {
      // update existing builder
      builder.high = Math.max(builder.high!, newPrice);
      builder.low = Math.min(builder.low!, newPrice);
      builder.close = newPrice;
      builder.volume = (builder.volume ?? 0) + 50 + Math.floor(rng(asset) * 150);
    }
  });

  return {
    asset,
    price: newPrice,
    time: now,
    closedCandles,
    updatedCandles: s.candles,
  };
}

export function getCandles(asset: AssetSymbol): Record<Timeframe, Candle[]> {
  let s = states[asset];
  if (!s) {
    s = initState(asset, Date.now());
    states[asset] = s;
  }
  // Return a snapshot including the in-progress builder as the latest candle
  const out: Record<Timeframe, Candle[]> = { H4: [], H1: [], M15: [], M5: [] };
  (Object.keys(TF_MINUTES) as Timeframe[]).forEach((tf) => {
    const series = [...s.candles[tf]];
    const b = s.builders[tf];
    if (b && b.open !== undefined) {
      series.push({
        time: b.time,
        open: b.open,
        high: b.high!,
        low: b.low!,
        close: b.close!,
        volume: b.volume!,
      });
    }
    out[tf] = series;
  });
  return out;
}

export function getCurrentPrice(asset: AssetSymbol): number {
  let s = states[asset];
  if (!s) {
    s = initState(asset, Date.now());
    states[asset] = s;
  }
  return s.price;
}

// Force re-seed (used when agent resets)
export function resetSimulator() {
  for (const k of Object.keys(states)) delete states[k as AssetSymbol];
  for (const k of Object.keys(rngs)) delete rngs[k as AssetSymbol];
}
