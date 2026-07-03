// ============================================================================
// BekiBuffet — Risk Commander (Module 4)
// Automatically decides position size, stop placement, ATR multiplier,
// break-even timing, partial closes, trailing stop, daily loss limit,
// maximum drawdown, consecutive loss protection. Trader never enters
// lot sizes manually.
// ============================================================================

import type { AssetPreset, Campaign, Position, RiskState } from "./types";
import { clamp } from "./indicators";

export interface RiskContext {
  preset: AssetPreset;
  equity: number;
  balance: number;
  floatingPnl: number;
  atr: number;
  atrPct: number;
  currentPrice: number;
  openCampaigns: Campaign[];
  consecutiveLosses: number;
  dayStartEquity: number;
}

export interface RiskDecision {
  riskPerTradePct: number;
  riskAmount: number;
  atrStopDistance: number;
  atrStopPips: number;
  positionSizeUnits: number;
  positionSizeLots: number;
  takeProfitDistance: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  riskRewardRatio: number;
  allowed: boolean;
  blockReason?: string;
  exposureAfterPct: number;
  dailyLossPct: number;
  consecutiveProtectionActive: boolean;
}

// Consecutive loss protection ladder
function consecutiveLossRiskReduction(consecutiveLosses: number): number {
  if (consecutiveLosses < 2) return 1.0;
  if (consecutiveLosses === 2) return 0.75;
  if (consecutiveLosses === 3) return 0.5;
  return 0.25; // 4+ — minimal risk until a winner resets the count
}

export function computeRisk(ctx: RiskContext, direction: "Long" | "Short"): RiskDecision {
  const preset = ctx.preset;
  const base = preset.riskPctMax;
  const reduction = consecutiveLossRiskReduction(ctx.consecutiveLosses);
  let riskPerTradePct = clamp(base * reduction, preset.riskPctMin * 0.25, preset.riskPctMax);

  // Daily loss limit — max 3% daily drawdown
  const dailyLossPct = ((ctx.dayStartEquity - ctx.equity) / ctx.dayStartEquity) * 100;
  const maxDailyLossPct = 3.0;
  if (dailyLossPct >= maxDailyLossPct) {
    return {
      riskPerTradePct: 0,
      riskAmount: 0,
      atrStopDistance: 0,
      atrStopPips: 0,
      positionSizeUnits: 0,
      positionSizeLots: 0,
      takeProfitDistance: 0,
      takeProfitPrice: 0,
      stopLossPrice: 0,
      riskRewardRatio: 0,
      allowed: false,
      blockReason: `Daily loss limit reached (${dailyLossPct.toFixed(2)}% of ${maxDailyLossPct}%)`,
      exposureAfterPct: 0,
      dailyLossPct,
      consecutiveProtectionActive: ctx.consecutiveLosses >= 2,
    };
  }
  if (dailyLossPct > maxDailyLossPct * 0.5) {
    // Halfway to limit — cut risk by 50%
    riskPerTradePct *= 0.5;
  }

  // Maximum exposure — max 6% portfolio risk across all open campaigns
  const currentExposurePct = ctx.openCampaigns.reduce((sum, c) => {
    const campaignRisk = c.positions.reduce((s, p) => {
      const stopDist = Math.abs(p.entryPrice - p.stopLoss);
      return s + stopDist * p.size;
    }, 0);
    return sum + (campaignRisk / ctx.equity) * 100;
  }, 0);
  const maxExposurePct = 6.0;
  if (currentExposurePct >= maxExposurePct) {
    return {
      riskPerTradePct: 0,
      riskAmount: 0,
      atrStopDistance: 0,
      atrStopPips: 0,
      positionSizeUnits: 0,
      positionSizeLots: 0,
      takeProfitDistance: 0,
      takeProfitPrice: 0,
      stopLossPrice: 0,
      riskRewardRatio: 0,
      allowed: false,
      blockReason: `Maximum exposure reached (${currentExposurePct.toFixed(2)}% of ${maxExposurePct}%)`,
      exposureAfterPct: currentExposurePct,
      dailyLossPct,
      consecutiveProtectionActive: ctx.consecutiveLosses >= 2,
    };
  }

  // Stop distance from ATR
  const atrStopDistance = ctx.atr * preset.atrMultiplier;
  const atrStopPips = atrStopDistance / preset.pipSize;
  const stopLossPrice =
    direction === "Long" ? ctx.currentPrice - atrStopDistance : ctx.currentPrice + atrStopDistance;

  // Take profit — 2.5 × stop distance for baseline RR
  const takeProfitDistance = atrStopDistance * 2.5;
  const takeProfitPrice =
    direction === "Long" ? ctx.currentPrice + takeProfitDistance : ctx.currentPrice - takeProfitDistance;

  const riskAmount = ctx.equity * (riskPerTradePct / 100);
  const positionSizeUnits = riskAmount / atrStopDistance;
  const positionSizeLots = positionSizeUnits / preset.contractSize;

  // New exposure if this trade opens
  const newExposure = (riskAmount / ctx.equity) * 100;
  const exposureAfterPct = currentExposurePct + newExposure;

  return {
    riskPerTradePct,
    riskAmount,
    atrStopDistance,
    atrStopPips,
    positionSizeUnits,
    positionSizeLots,
    takeProfitDistance,
    takeProfitPrice,
    stopLossPrice,
    riskRewardRatio: 2.5,
    allowed: true,
    exposureAfterPct,
    dailyLossPct,
    consecutiveProtectionActive: ctx.consecutiveLosses >= 2,
  };
}

// --- Live risk state computation -----------------------------------------

export function computeRiskState(
  equity: number,
  balance: number,
  floatingPnl: number,
  openCampaigns: Campaign[],
  consecutiveLosses: number,
  dayStartEquity: number,
  preset: AssetPreset
): RiskState {
  const dailyLossPct = ((dayStartEquity - equity) / dayStartEquity) * 100;
  const currentExposurePct = openCampaigns.reduce((sum, c) => {
    const campaignRisk = c.positions.reduce((s, p) => {
      const stopDist = Math.abs(p.entryPrice - p.stopLoss);
      return s + stopDist * p.size;
    }, 0);
    return sum + (campaignRisk / equity) * 100;
  }, 0);

  // Portfolio correlation: crude proxy — count of open campaigns on same direction
  const longCount = openCampaigns.filter((c) => c.direction === "Long").length;
  const shortCount = openCampaigns.filter((c) => c.direction === "Short").length;
  const portfolioCorrelation = clamp(
    Math.max(longCount, shortCount) / Math.max(1, longCount + shortCount),
    0,
    1
  );

  const marginLevelPct = equity > 0 ? clamp((equity / (equity + Math.abs(floatingPnl) + currentExposurePct * equity * 0.01)) * 100, 0, 999) : 0;

  return {
    equity,
    balance,
    floatingPnl,
    riskPerTradePct: preset.riskPctMax,
    atrStopPips: 0,
    positionSizeUnits: 0,
    positionSizeLots: 0,
    dailyLossPct,
    maxDailyLossPct: 3.0,
    maxExposurePct: 6.0,
    currentExposurePct,
    consecutiveLosses,
    maxConsecutiveLosses: 4,
    portfolioCorrelation,
    marginLevelPct,
  };
}

// --- Position management helpers -----------------------------------------

export interface PositionManagementAction {
  moveToBreakeven: boolean;
  trailStop?: number; // new stop price
  partialClose?: { percent: number; reason: string };
  closeAll?: { reason: string };
}

export function managePosition(
  pos: Position,
  currentPrice: number,
  atr: number,
  campaign: Campaign
): PositionManagementAction {
  const action: PositionManagementAction = { moveToBreakeven: false };

  const favorable =
    pos.direction === "Long"
      ? currentPrice - pos.entryPrice
      : pos.entryPrice - currentPrice;
  const adverse = -favorable;

  // Update MFE/MAE
  pos.mfe = Math.max(pos.mfe ?? 0, favorable);
  pos.mae = Math.max(pos.mae ?? 0, adverse);

  // Move to breakeven when 1 × ATR in profit
  if (pos.status === "Open" && favorable >= atr) {
    action.moveToBreakeven = true;
  }

  // Partial close at 1.5 × ATR (take 50% off)
  if (favorable >= atr * 1.5 && !pos.status.includes("Trail")) {
    action.partialClose = { percent: 50, reason: "1.5× ATR partial" };
  }

  // Trail stop after partial close — keep stop 1.0 × ATR behind price
  if (pos.status === "Trail" || favorable >= atr * 1.5) {
    if (pos.direction === "Long") {
      const newStop = currentPrice - atr * 1.0;
      if (newStop > pos.stopLoss) action.trailStop = newStop;
    } else {
      const newStop = currentPrice + atr * 1.0;
      if (newStop < pos.stopLoss || pos.stopLoss === pos.entryPrice) action.trailStop = newStop;
    }
  }

  return action;
}
