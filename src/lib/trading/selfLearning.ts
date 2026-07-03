// ============================================================================
// BekiBuffet — Self-Learning Module
// After every trade, record setup, regime, ATR, Ichimoku state, price
// action pattern, entry score, exit reason, P/L, MFE, MAE.
// After every 200 trades: recalculate win rates per setup, increase
// weights for profitable conditions, reduce weights for underperformers.
// Never alters core strategy — only adjusts confidence and thresholds
// within predefined limits (0.5x..1.5x of baseline).
// ============================================================================

import type { Position, SelfLearningState, SetupStats, TradeRecord, RegimeType, PriceActionPattern } from "./types";
import { clamp } from "./indicators";

export function createSelfLearningState(): SelfLearningState {
  return {
    totalTrades: 0,
    sinceLastAdjustment: 0,
    setupStats: {},
    lastAdjustmentAt: 0,
    adjustmentsLog: [],
  };
}

const SETUP_KEYS = [
  "TrendAlignment",
  "CloudConfirmation",
  "HigherTimeframeBias",
  "VolatilityAcceptable",
  "SessionQuality",
  "PA_BullishEngulfing",
  "PA_BearishEngulfing",
  "PA_BullishPinBar",
  "PA_BearishPinBar",
  "PA_InsideBar",
  "PA_OutsideBar",
  "PA_BreakOfStructure",
  "PA_LiquiditySweep",
  "PA_MomentumCandle",
  "PA_StrongRejection",
  "PA_BreakAndRetest",
  "PA_None",
] as const;

export function seedSetupStats(state: SelfLearningState): SelfLearningState {
  for (const k of SETUP_KEYS) {
    if (!state.setupStats[k]) {
      state.setupStats[k] = {
        setup: k,
        trades: 0,
        wins: 0,
        losses: 0,
        winRate: 50,
        avgPnl: 0,
        totalPnl: 0,
        weight: 1.0,
      };
    }
  }
  return state;
}

export function recordTrade(
  state: SelfLearningState,
  record: TradeRecord
): SelfLearningState {
  const next: SelfLearningState = {
    ...state,
    setupStats: { ...state.setupStats },
    totalTrades: state.totalTrades + 1,
    sinceLastAdjustment: state.sinceLastAdjustment + 1,
  };

  // Update individual setup stats for each factor that was active in the trade
  const factorsToUpdate = [
    "TrendAlignment",
    "CloudConfirmation",
    "HigherTimeframeBias",
    "VolatilityAcceptable",
    "SessionQuality",
    `PA_${record.priceActionPattern}`,
  ];

  const isWin = record.pnl > 0;
  for (const k of factorsToUpdate) {
    if (!next.setupStats[k]) {
      next.setupStats[k] = {
        setup: k,
        trades: 0,
        wins: 0,
        losses: 0,
        winRate: 50,
        avgPnl: 0,
        totalPnl: 0,
        weight: 1.0,
      };
    }
    const s = next.setupStats[k];
    const updated: SetupStats = {
      ...s,
      trades: s.trades + 1,
      wins: s.wins + (isWin ? 1 : 0),
      losses: s.losses + (isWin ? 0 : 1),
      totalPnl: s.totalPnl + record.pnl,
    };
    updated.winRate = updated.trades > 0 ? (updated.wins / updated.trades) * 100 : 50;
    updated.avgPnl = updated.trades > 0 ? updated.totalPnl / updated.trades : 0;
    next.setupStats[k] = updated;
  }

  // After every 200 trades, adjust weights
  if (next.sinceLastAdjustment >= 200) {
    return adjustWeights(next, record.closeTime);
  }

  return next;
}

export function adjustWeights(state: SelfLearningState, at: number): SelfLearningState {
  const next: SelfLearningState = {
    ...state,
    setupStats: { ...state.setupStats },
    sinceLastAdjustment: 0,
    lastAdjustmentAt: at,
  };

  const changes: string[] = [];

  for (const k of Object.keys(next.setupStats)) {
    const s = next.setupStats[k];
    if (s.trades < 20) continue; // need at least 20 samples to tune

    // Win-rate-based weight adjustment
    // 50% win rate = baseline weight 1.0
    // 65% win rate = weight 1.25 (boost)
    // 35% win rate = weight 0.75 (penalty)
    // Clamped to [0.5, 1.5]
    const winRateDelta = (s.winRate - 50) / 50; // -1..+1
    // PnL-based adjustment (smaller influence)
    const pnlFactor = clamp(s.avgPnl > 0 ? 0.1 : -0.1, -0.1, 0.1);
    const targetWeight = clamp(1.0 + winRateDelta * 0.5 + pnlFactor, 0.5, 1.5);
    const oldWeight = s.weight;
    // Move weight 30% of the way toward target (gradual adaptation)
    const newWeight = clamp(oldWeight + (targetWeight - oldWeight) * 0.3, 0.5, 1.5);

    if (Math.abs(newWeight - oldWeight) > 0.01) {
      changes.push(
        `${k}: ${oldWeight.toFixed(2)} → ${newWeight.toFixed(2)} (win ${s.winRate.toFixed(0)}%, ${s.trades} trades, avg ${s.avgPnl.toFixed(2)})`
      );
    }

    next.setupStats[k] = { ...s, weight: newWeight };
  }

  next.adjustmentsLog = [
    ...state.adjustmentsLog,
    {
      at,
      summary: changes.length > 0 ? changes.join("; ") : "No weight changes (samples too small)",
    },
  ];

  return next;
}

// Build a trade record from a closed position ----------------------------

export function buildTradeRecord(
  pos: Position,
  regime: RegimeType,
  exitReason: string,
  session: string,
  ichimokuState: string,
  priceActionPattern: PriceActionPattern
): TradeRecord {
  return {
    id: pos.id,
    asset: pos.asset,
    session,
    setup: `Scale${pos.scale}_${priceActionPattern}`,
    marketRegime: regime,
    atr: pos.atrAtOpen,
    ichimokuState,
    priceActionPattern,
    entryScore: pos.scoreAtOpen,
    exitReason,
    pnl: pos.pnl ?? 0,
    pnlPct: pos.pnlPct ?? 0,
    mfe: pos.mfe ?? 0,
    mae: pos.mae ?? 0,
    openTime: pos.openTime,
    closeTime: pos.closeTime ?? 0,
    duration: (pos.closeTime ?? 0) - pos.openTime,
  };
}
