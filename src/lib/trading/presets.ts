// ============================================================================
// BekiBuffet — Asset Presets
// Each instrument has its own personality; this is the journal's wisdom
// encoded as concrete trade-desk parameters.
// ============================================================================

import type { AssetPreset, AssetSymbol } from "./types";

export const ASSET_PRESETS: Record<AssetSymbol, AssetPreset> = {
  XAUUSD: {
    symbol: "XAUUSD",
    displayName: "Gold vs USD",
    basePrice: 2345.0,
    pipSize: 0.1,
    contractSize: 100,
    biasTimeframe: "H4",
    executionTimeframe: "M15",
    atrMultiplier: 1.8,
    minScore: 90,
    riskPctMin: 0.5,
    riskPctMax: 1.0,
    campaignEntries: 3,
    session: "London + New York",
    volatilityProfile: "High",
    description:
      "H4/H1 directional bias, M15 execution. Wide ATR stop (×1.8) absorbs Gold's expansion waves. Aggressive campaign building up to 3 scales.",
  },
  EURUSD: {
    symbol: "EURUSD",
    displayName: "Euro vs USD",
    basePrice: 1.085,
    pipSize: 0.0001,
    contractSize: 100000,
    biasTimeframe: "H1",
    executionTimeframe: "M15",
    atrMultiplier: 1.5,
    minScore: 85,
    riskPctMin: 1.0,
    riskPctMax: 1.0,
    campaignEntries: 3,
    session: "London + New York",
    volatilityProfile: "Low",
    description:
      "H1 trend bias, M15 execution. Tighter ATR stop (×1.5). Standard 1% risk per campaign entry. Smoothest regime transitions of the basket.",
  },
  GBPUSD: {
    symbol: "GBPUSD",
    displayName: "Pound vs USD",
    basePrice: 1.272,
    pipSize: 0.0001,
    contractSize: 100000,
    biasTimeframe: "H1",
    executionTimeframe: "M15",
    atrMultiplier: 1.7,
    minScore: 88,
    riskPctMin: 0.75,
    riskPctMax: 1.0,
    campaignEntries: 3,
    session: "London",
    volatilityProfile: "Medium",
    description:
      "Strong momentum filter — only enters when H1 momentum confirms direction. ATR ×1.7 for Cable's false-break tendency. Minimum score 88.",
  },
  EURJPY: {
    symbol: "EURJPY",
    displayName: "Euro vs Yen",
    basePrice: 170.5,
    pipSize: 0.01,
    contractSize: 100000,
    biasTimeframe: "H1",
    executionTimeframe: "M15",
    atrMultiplier: 1.6,
    minScore: 86,
    riskPctMin: 0.75,
    riskPctMax: 1.0,
    campaignEntries: 3,
    session: "London + Tokyo overlap",
    volatilityProfile: "Medium",
    description:
      "Trend continuation focus — refuses counter-trend entries even on high score. ATR ×1.6. Filters out Yen cross-mean reversion noise.",
  },
  BTCUSD: {
    symbol: "BTCUSD",
    displayName: "Bitcoin vs USD",
    basePrice: 67000.0,
    pipSize: 1.0,
    contractSize: 1,
    biasTimeframe: "H4",
    executionTimeframe: "H1",
    atrMultiplier: 2.5,
    minScore: 92,
    riskPctMin: 0.5,
    riskPctMax: 0.5,
    campaignEntries: 2,
    session: "24/7 — focus NY overlap",
    volatilityProfile: "Extreme",
    description:
      "H4 trend bias, H1 execution. ATR ×2.5 to survive crypto wicks. Risk capped at 0.5%. Only 2 campaign entries — crypto gaps make 3rd scale too risky.",
  },
};

export const ASSET_ORDER: AssetSymbol[] = [
  "XAUUSD",
  "EURUSD",
  "GBPUSD",
  "EURJPY",
  "BTCUSD",
];
