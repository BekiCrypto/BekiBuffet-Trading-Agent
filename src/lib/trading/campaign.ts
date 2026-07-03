// ============================================================================
// BekiBuffet — Campaign Manager (Module 5)
// Instead of managing trades independently, manage campaigns.
// Open first position when trend begins. Add scale-ins as trend
// strengthens. Move all stops together. Protect equity. Close entire
// campaign together. This matches how experienced traders build positions.
// ============================================================================

import type {
  AssetPreset,
  Campaign,
  ConfluenceScore,
  DecisionLogEntry,
  Position,
} from "./types";
import { atr } from "./indicators";
import { computeRisk, managePosition, type RiskContext, type PositionManagementAction } from "./risk";

export interface CampaignManagementResult {
  campaigns: Campaign[];
  decisions: DecisionLogEntry[];
  closedPositions: { position: Position; campaign: Campaign; reason: string; pnl: number }[];
  newCampaign?: Campaign;
  updatedBalance: number;
}

// H5 FIX: Counter state is now per-namespace to avoid collisions between
// the live agent and the backtest engine. The live agent uses the "LIVE"
// namespace; backtests use "BT". resetCounters() only resets the requested
// namespace, not both.
const counterState: Record<string, { campaign: number; position: number }> = {
  LIVE: { campaign: 0, position: 0 },
  BT: { campaign: 0, position: 0 },
};

function nextCampaignId(namespace: string = "LIVE"): string {
  if (!counterState[namespace]) counterState[namespace] = { campaign: 0, position: 0 };
  counterState[namespace].campaign++;
  return `${namespace}-CMP-${counterState[namespace].campaign.toString().padStart(4, "0")}`;
}

function nextPositionId(namespace: string = "LIVE"): string {
  if (!counterState[namespace]) counterState[namespace] = { campaign: 0, position: 0 };
  counterState[namespace].position++;
  return `${namespace}-POS-${counterState[namespace].position.toString().padStart(5, "0")}`;
}

export function resetCounters(namespace: string = "LIVE") {
  if (counterState[namespace]) {
    counterState[namespace].campaign = 0;
    counterState[namespace].position = 0;
  }
}

// --- Open a new campaign --------------------------------------------------

export function openCampaign(
  preset: AssetPreset,
  direction: "Long" | "Short",
  score: ConfluenceScore,
  currentPrice: number,
  atrValue: number,
  riskCtx: RiskContext,
  now: number,
  namespace: string = "LIVE"
): { campaign: Campaign; position: Position; decision: DecisionLogEntry } | null {
  const risk = computeRisk(riskCtx, direction);
  if (!risk.allowed) {
    return null;
  }

  const id = nextCampaignId(namespace);
  const posId = nextPositionId(namespace);
  const position: Position = {
    id: posId,
    asset: preset.symbol,
    direction,
    entryPrice: currentPrice,
    size: risk.positionSizeUnits,
    lots: risk.positionSizeLots,
    stopLoss: risk.stopLossPrice,
    takeProfit: risk.takeProfitPrice,
    openTime: now,
    atrAtOpen: atrValue,
    scoreAtOpen: score.total,
    scale: 1,
    status: "Open",
    mfe: 0,
    mae: 0,
  };

  const campaign: Campaign = {
    id,
    asset: preset.symbol,
    direction,
    status: "Building",
    openTime: now,
    positions: [position],
    aggregateSize: position.size,
    averageEntry: position.entryPrice,
    aggregateStop: position.stopLoss,
    aggregatePnl: 0,
    maxScale: preset.campaignEntries,
    reason: score.factors.map((f) => `${f.name}:${f.score}`).join(" | "),
  };

  const decision: DecisionLogEntry = {
    id: `DEC-${now}-${posId}`,
    time: now,
    asset: preset.symbol,
    action: "Open",
    direction,
    score: score.total,
    reason: `Campaign opened — scale 1/3, score ${score.total}/${score.threshold}`,
    price: currentPrice,
  };

  return { campaign, position, decision };
}

// --- Add a scale-in position to an existing campaign ---------------------

export function scaleIntoCampaign(
  campaign: Campaign,
  preset: AssetPreset,
  score: ConfluenceScore,
  currentPrice: number,
  atrValue: number,
  riskCtx: RiskContext,
  now: number,
  namespace: string = "LIVE"
): { position: Position; decision: DecisionLogEntry } | null {
  if (campaign.positions.length >= campaign.maxScale) return null;
  if (campaign.status === "Closing" || campaign.status === "Closed") return null;

  // Only scale in the direction of the campaign
  const direction = campaign.direction;
  const risk = computeRisk(riskCtx, direction);
  if (!risk.allowed) return null;

  // Scale-in requires the new entry to be at least 0.5 ATR favorable to existing avg
  const favorable =
    direction === "Long"
      ? currentPrice - campaign.averageEntry
      : campaign.averageEntry - currentPrice;
  if (favorable < -atrValue * 0.5) return null; // don't scale into losers

  const posId = nextPositionId(namespace);
  const scale = campaign.positions.length + 1;
  const position: Position = {
    id: posId,
    asset: preset.symbol,
    direction,
    entryPrice: currentPrice,
    size: risk.positionSizeUnits,
    lots: risk.positionSizeLots,
    stopLoss: risk.stopLossPrice,
    takeProfit: risk.takeProfitPrice,
    openTime: now,
    atrAtOpen: atrValue,
    scoreAtOpen: score.total,
    scale,
    status: "Open",
    mfe: 0,
    mae: 0,
  };

  campaign.positions.push(position);
  // Recompute aggregates
  const totalSize = campaign.positions.reduce((s, p) => s + p.size, 0);
  const avgEntry =
    campaign.positions.reduce((s, p) => s + p.entryPrice * p.size, 0) / totalSize;
  campaign.aggregateSize = totalSize;
  campaign.averageEntry = avgEntry;
  // Aggregate stop = worst-case stop in direction
  campaign.aggregateStop =
    direction === "Long"
      ? Math.min(...campaign.positions.map((p) => p.stopLoss))
      : Math.max(...campaign.positions.map((p) => p.stopLoss));
  campaign.status = scale >= campaign.maxScale ? "Active" : "Building";

  const decision: DecisionLogEntry = {
    id: `DEC-${now}-${posId}`,
    time: now,
    asset: preset.symbol,
    action: "Scale",
    direction,
    score: score.total,
    reason: `Scale ${scale}/${campaign.maxScale} added — score ${score.total}`,
    price: currentPrice,
  };

  return { position, decision };
}

// --- Manage all open campaigns each tick ----------------------------------

export function manageCampaigns(
  campaigns: Campaign[],
  candlesByAsset: { [asset: string]: any },
  presetByAsset: { [asset: string]: AssetPreset },
  now: number
): {
  updatedCampaigns: Campaign[];
  decisions: DecisionLogEntry[];
  closedPositions: { position: Position; campaign: Campaign; reason: string; pnl: number }[];
} {
  const decisions: DecisionLogEntry[] = [];
  const closedPositions: { position: Position; campaign: Campaign; reason: string; pnl: number }[] = [];

  for (const campaign of campaigns) {
    if (campaign.status === "Closed") continue;
    const preset = presetByAsset[campaign.asset];
    const candles = candlesByAsset[campaign.asset];
    if (!candles || !preset) continue;
    const atrValue = atr(candles[preset.executionTimeframe], 14);
    const currentPrice = candles[preset.executionTimeframe].at(-1)?.close ?? 0;
    // H8 FIX: Skip campaign management if price is invalid (empty candles, NaN, 0)
    // Otherwise all Longs would stop out instantly at price=0, liquidating the book.
    if (!currentPrice || !Number.isFinite(currentPrice) || currentPrice <= 0) continue;

    let campaignClosed = false;

    for (const pos of campaign.positions) {
      if (pos.status === "Closed") continue;

      // Stop loss hit
      const stopped =
        pos.direction === "Long"
          ? currentPrice <= pos.stopLoss
          : currentPrice >= pos.stopLoss;

      // Take profit hit
      const tp =
        pos.direction === "Long"
          ? currentPrice >= pos.takeProfit
          : currentPrice <= pos.takeProfit;

      if (stopped || tp) {
        const reason = stopped ? "Stop loss" : "Take profit";
        closePosition(pos, currentPrice, now, reason);
        const pnl = computePositionPnl(pos, currentPrice, preset);
        closedPositions.push({ position: pos, campaign, reason, pnl });
        const decision: DecisionLogEntry = {
          id: `DEC-${now}-${pos.id}-close`,
          time: now,
          asset: campaign.asset,
          action: "Close",
          direction: pos.direction,
          reason: `${reason} on ${pos.id} (scale ${pos.scale})`,
          price: currentPrice,
        };
        decisions.push(decision);
        continue;
      }

      // Apply management actions
      const action: PositionManagementAction = managePosition(pos, currentPrice, atrValue, campaign);
      if (action.moveToBreakeven && pos.status === "Open") {
        pos.stopLoss = pos.entryPrice;
        pos.status = "Breakeven";
        decisions.push({
          id: `DEC-${now}-${pos.id}-be`,
          time: now,
          asset: campaign.asset,
          action: "Breakeven",
          direction: pos.direction,
          reason: `${pos.id} moved to breakeven`,
          price: currentPrice,
        });
      }
      if (action.partialClose && pos.status === "Breakeven") {
        // Mark partial close by reducing size 50%
        pos.size *= 0.5;
        pos.lots *= 0.5;
        pos.status = "Trail";
        decisions.push({
          id: `DEC-${now}-${pos.id}-partial`,
          time: now,
          asset: campaign.asset,
          action: "Trail",
          direction: pos.direction,
          reason: `Partial close 50% at 1.5× ATR — ${pos.id}`,
          price: currentPrice,
        });
      }
      if (action.trailStop) {
        pos.stopLoss = action.trailStop;
        if (pos.status === "Breakeven") pos.status = "Trail";
      }
    }

    // Check if entire campaign should close
    const openPositions = campaign.positions.filter((p) => p.status !== "Closed");
    if (openPositions.length === 0) {
      campaign.status = "Closed";
      campaign.closeTime = now;
      campaignClosed = true;
      decisions.push({
        id: `DEC-${now}-${campaign.id}-done`,
        time: now,
        asset: campaign.asset,
        action: "Close",
        reason: `Campaign ${campaign.id} fully closed`,
        price: currentPrice,
      });
    } else {
      // Update aggregate PnL
      campaign.aggregatePnl = campaign.positions.reduce((s, p) => {
        if (p.status === "Closed") return s + (p.pnl ?? 0);
        return s + computePositionPnl(p, currentPrice, preset);
      }, 0);
      // Update aggregate stop to best available stop among open positions
      const openStops = openPositions
        .map((p) => p.stopLoss)
        .filter((s) => Number.isFinite(s));
      if (openStops.length > 0) {
        campaign.aggregateStop =
          campaign.direction === "Long"
            ? Math.min(...openStops)
            : Math.max(...openStops);
      }
      // Move campaign to Active if fully scaled
      if (campaign.status === "Building" && openPositions.length >= campaign.maxScale) {
        campaign.status = "Active";
      }
    }
  }

  return { updatedCampaigns: campaigns, decisions, closedPositions };
}

function closePosition(pos: Position, price: number, now: number, reason: string) {
  pos.closePrice = price;
  pos.closeTime = now;
  pos.status = "Closed";
  pos.pnl = computePositionPnl(pos, price, {
    contractSize: 1,
    pipSize: 1,
  } as AssetPreset);
  pos.pnlPct = ((price - pos.entryPrice) / pos.entryPrice) * 100 * (pos.direction === "Long" ? 1 : -1);
}

function computePositionPnl(pos: Position, currentPrice: number, preset: AssetPreset): number {
  const direction = pos.direction === "Long" ? 1 : -1;
  const priceDiff = (currentPrice - pos.entryPrice) * direction;
  // For CFD-style: pnl = priceDiff * size * contractSize (size in lots already)
  // We stored size in units, so use directly:
  return priceDiff * pos.size;
}
