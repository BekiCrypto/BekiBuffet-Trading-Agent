// ============================================================================
// BekiBuffet — Edge Discovery Module
// Autonomously searches parameter space across assets, strategies, and
// timeframes to find edges with strong walk-forward validation. Deployed
// edges feed back into the live agent as updated presets.
// ============================================================================

import type { AssetSymbol, Timeframe } from "./types";
import { ASSET_PRESETS } from "./presets";
import { runBacktest, type BacktestConfig, type BacktestResult } from "./backtest";

export interface EdgeCandidate {
  id: string;
  asset: AssetSymbol;
  timeframe: Timeframe;
  strategy: string;
  parameters: {
    minScore: number;
    atrMultiplier: number;
    riskPerTrade: number;
  };
  inSample: BacktestResult;
  outOfSample: BacktestResult;
  walkForwardScore: number; // 0-100
  inSampleScore: number;
  outOfSampleScore: number;
  compositeScore: number; // 0-100
  recommendation: "DEPLOY" | "WATCH" | "REJECT";
}

export interface DiscoveryRunResult {
  candidates: EdgeCandidate[];
  bestEdge: EdgeCandidate | null;
  totalConfigs: number;
  durationMs: number;
  searchSpace: {
    assets: AssetSymbol[];
    timeframes: Timeframe[];
    strategies: string[];
    minScoreRange: [number, number];
    atrMultiplierRange: [number, number];
  };
}

const ASSETS: AssetSymbol[] = ["XAUUSD", "EURUSD", "GBPUSD", "EURJPY", "BTCUSD"];
const TIMEFRAMES: Timeframe[] = ["M15", "H1"];
const STRATEGIES = ["BEKIBUFFET_V1", "ICHIMOKU_BREAKOUT", "MOMENTUM_SCALPER", "MEAN_REVERSION"] as const;

function scoreResult(r: BacktestResult): number {
  // Weighted composite: 30% return, 25% sharpe, 20% profit factor, 15% win rate, 10% drawdown penalty
  const returnScore = Math.max(0, Math.min(100, r.totalReturn * 2));
  const sharpeScore = Math.max(0, Math.min(100, r.sharpeRatio * 30));
  const pfScore = Math.max(0, Math.min(100, (r.profitFactor - 1) * 50));
  const wrScore = Math.max(0, Math.min(100, r.winRate));
  const ddPenalty = Math.max(0, Math.min(100, r.maxDrawdown * 2));
  // Trade count gate: need at least 10 trades for credibility
  const tradeGate = r.totalTrades >= 10 ? 1 : 0.3;
  return Math.round((returnScore * 0.3 + sharpeScore * 0.25 + pfScore * 0.2 + wrScore * 0.15 + (100 - ddPenalty) * 0.1) * tradeGate);
}

export function runEdgeDiscovery(maxCandidates = 12): DiscoveryRunResult {
  const startMs = Date.now();
  const candidates: EdgeCandidate[] = [];
  const now = new Date();
  const endDate = now;
  const inSampleStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000); // 6mo in-sample
  const outOfSampleStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 2mo OOS

  // Sample search space — combinations of asset × timeframe × strategy × min score × ATR mult
  const minScores = [70, 80, 90];
  const atrMults = [1.5, 1.8, 2.0];
  let totalConfigs = 0;

  for (const asset of ASSETS) {
    for (const tf of TIMEFRAMES) {
      for (const strategy of STRATEGIES) {
        for (const ms of minScores) {
          for (const am of atrMults) {
            if (candidates.length >= maxCandidates) break;
            totalConfigs++;

            const preset = ASSET_PRESETS[asset];
            const config: BacktestConfig = {
              asset,
              timeframe: tf,
              startDate: inSampleStart,
              endDate,
              initialCapital: 10000,
              strategy: strategy as any,
              parameters: {
                minScoreOverride: ms,
                atrMultiplierOverride: am,
                riskPerTradeOverride: preset.riskPctMax,
              },
            };

            try {
              const inSample = runBacktest(config);
              // Out-of-sample: last 2 months
              const oosConfig = { ...config, startDate: outOfSampleStart };
              const outOfSample = runBacktest(oosConfig);

              const inSampleScore = scoreResult(inSample);
              const outOfSampleScore = scoreResult(outOfSample);
              // Walk-forward: OOS score must not degrade more than 25% from IS
              const degradation = inSampleScore > 0 ? (inSampleScore - outOfSampleScore) / inSampleScore : 1;
              const walkForwardScore = Math.max(0, Math.min(100, outOfSampleScore * (1 - Math.max(0, degradation - 0.25))));
              const compositeScore = Math.round(inSampleScore * 0.4 + outOfSampleScore * 0.4 + walkForwardScore * 0.2);

              const recommendation: EdgeCandidate["recommendation"] =
                compositeScore >= 65 && outOfSampleScore >= 50 ? "DEPLOY" : compositeScore >= 45 ? "WATCH" : "REJECT";

              // Only keep candidates above WATCH threshold
              if (recommendation === "REJECT") continue;

              candidates.push({
                id: `EDGE-${asset}-${tf}-${strategy}-MS${ms}-ATR${am}`,
                asset,
                timeframe: tf,
                strategy,
                parameters: {
                  minScore: ms,
                  atrMultiplier: am,
                  riskPerTrade: preset.riskPctMax,
                },
                inSample,
                outOfSample,
                walkForwardScore: Math.round(walkForwardScore),
                inSampleScore,
                outOfSampleScore,
                compositeScore,
                recommendation,
              });
            } catch (e) {
              // skip failed configs
            }
          }
        }
      }
    }
  }

  // Sort by composite score
  candidates.sort((a, b) => b.compositeScore - a.compositeScore);
  const bestEdge = candidates[0] ?? null;

  return {
    candidates: candidates.slice(0, 10),
    bestEdge,
    totalConfigs,
    durationMs: Date.now() - startMs,
    searchSpace: {
      assets: ASSETS,
      timeframes: TIMEFRAMES,
      strategies: STRATEGIES as unknown as string[],
      minScoreRange: [70, 90],
      atrMultiplierRange: [1.5, 2.0],
    },
  };
}
