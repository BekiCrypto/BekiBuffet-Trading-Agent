// ============================================================================
// BekiBuffet — Core Type Definitions
// ============================================================================

export type AssetSymbol =
  | "XAUUSD"
  | "EURUSD"
  | "GBPUSD"
  | "EURJPY"
  | "BTCUSD";

export type Timeframe = "H4" | "H1" | "M15" | "M5";

export type TimeframeMinutes = Record<Timeframe, number>;

export const TF_MINUTES: TimeframeMinutes = {
  H4: 240,
  H1: 60,
  M15: 15,
  M5: 5,
};

// ----------------------------------------------------------------------------
// Market Data
// ----------------------------------------------------------------------------

export interface Candle {
  time: number; // epoch ms at candle open
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type CandleSeries = Candle[];

// ----------------------------------------------------------------------------
// Market Regime
// ----------------------------------------------------------------------------

export type RegimeType =
  | "Trend"
  | "Range"
  | "Transition"
  | "HighVolatility";

export interface MarketRegime {
  type: RegimeType;
  direction: "Up" | "Down" | "Flat";
  strength: number; // 0-100
  volatilityPct: number; // ATR as % of price
  confidence: number; // 0-100
}

// ----------------------------------------------------------------------------
// Market Structure
// ----------------------------------------------------------------------------

export type StructureState =
  | "Trend"
  | "Pullback"
  | "Compression"
  | "Breakout"
  | "Reversal"
  | "Range";

export interface MarketStructureReading {
  state: StructureState;
  trendDirection: "Up" | "Down" | "Flat";
  swingHigh: number;
  swingLow: number;
  bos: boolean; // break of structure
  choch: boolean; // change of character
  liquiditySwept: boolean;
  confidence: number; // 0-100
}

// ----------------------------------------------------------------------------
// Ichimoku
// ----------------------------------------------------------------------------

export interface IchimokuReading {
  tenkan: number;
  kijun: number;
  senkouA: number;
  senkouB: number;
  chikou: number;
  cloudTop: number;
  cloudBottom: number;
  cloudThickness: number; // abs(A-B) / price * 100
  cloudSlope: number; // signed slope of cloud (A-B derivative)
  cloudColor: "Bullish" | "Bearish" | "Thin";
  priceVsCloud: "Above" | "Inside" | "Below";
  distanceFromCloudPct: number;
  tenkanAngle: number; // degrees, signed
  kijunAngle: number;
  tenkanVsKijun: "Bullish" | "Bearish" | "Neutral";
  chikouClearance: boolean;
  futureCloudColor: "Bullish" | "Bearish" | "Thin";
  futureCloudThickness: number;
  score: number; // -100 to +100
}

// ----------------------------------------------------------------------------
// Price Action
// ----------------------------------------------------------------------------

export type PriceActionPattern =
  | "BullishEngulfing"
  | "BearishEngulfing"
  | "BullishPinBar"
  | "BearishPinBar"
  | "InsideBar"
  | "OutsideBar"
  | "BreakOfStructure"
  | "LiquiditySweep"
  | "MomentumCandle"
  | "StrongRejection"
  | "BreakAndRetest"
  | "None";

export interface PriceActionReading {
  pattern: PriceActionPattern;
  direction: "Bullish" | "Bearish" | "Neutral";
  winRate: number; // historical win rate 0-100
  confidence: number; // 0-100
  description: string;
}

// ----------------------------------------------------------------------------
// Confluence Scoring
// ----------------------------------------------------------------------------

export interface ConfluenceFactor {
  name: string;
  score: number;
  maxScore: number;
  reason: string;
  status: "pass" | "partial" | "fail" | "neutral";
}

export interface ConfluenceScore {
  total: number; // 0-100
  threshold: number; // required minimum
  factors: ConfluenceFactor[];
  verdict: "Trade" | "Reject" | "Wait";
  direction: "Long" | "Short" | "Neutral";
}

// ----------------------------------------------------------------------------
// Risk
// ----------------------------------------------------------------------------

export interface RiskState {
  equity: number;
  balance: number;
  floatingPnl: number;
  riskPerTradePct: number;
  atrStopPips: number;
  positionSizeUnits: number;
  positionSizeLots: number;
  dailyLossPct: number;
  maxDailyLossPct: number;
  maxExposurePct: number;
  currentExposurePct: number;
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
  portfolioCorrelation: number; // 0-1
  marginLevelPct: number;
}

// ----------------------------------------------------------------------------
// Campaign Management
// ----------------------------------------------------------------------------

export type CampaignStatus = "Building" | "Active" | "Scaling" | "Closing" | "Closed";

export interface Position {
  id: string;
  asset: AssetSymbol;
  direction: "Long" | "Short";
  entryPrice: number;
  size: number; // units
  lots: number;
  stopLoss: number;
  takeProfit: number;
  openTime: number;
  atrAtOpen: number;
  scoreAtOpen: number;
  scale: number; // 1, 2, 3 — which scale-in entry
  status: "Open" | "Breakeven" | "Trail" | "Closed";
  closePrice?: number;
  closeTime?: number;
  pnl?: number;
  pnlPct?: number;
  mfe?: number; // max favorable excursion
  mae?: number; // max adverse excursion
}

export interface Campaign {
  id: string;
  asset: AssetSymbol;
  direction: "Long" | "Short";
  status: CampaignStatus;
  openTime: number;
  positions: Position[];
  aggregateSize: number;
  averageEntry: number;
  aggregateStop: number;
  aggregatePnl: number;
  maxScale: number; // 3 for most assets
  reason: string;
  closeTime?: number;
}

// ----------------------------------------------------------------------------
// Do-Not-Trade Engine
// ----------------------------------------------------------------------------

export interface DoNotTradeReason {
  rule: string;
  triggered: boolean;
  detail: string;
}

export interface DoNotTradeEvaluation {
  allowTrade: boolean;
  reasons: DoNotTradeReason[];
  blockingReasons: string[];
}

// ----------------------------------------------------------------------------
// Self-Learning Module
// ----------------------------------------------------------------------------

export interface TradeRecord {
  id: string;
  asset: AssetSymbol;
  session: string;
  setup: string;
  marketRegime: RegimeType;
  atr: number;
  ichimokuState: string;
  priceActionPattern: PriceActionPattern;
  entryScore: number;
  exitReason: string;
  pnl: number;
  pnlPct: number;
  mfe: number;
  mae: number;
  openTime: number;
  closeTime: number;
  duration: number;
}

export interface SetupStats {
  setup: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPnl: number;
  totalPnl: number;
  weight: number; // current weight multiplier
}

export interface SelfLearningState {
  totalTrades: number;
  sinceLastAdjustment: number;
  setupStats: Record<string, SetupStats>;
  lastAdjustmentAt: number;
  adjustmentsLog: { at: number; summary: string }[];
}

// ----------------------------------------------------------------------------
// Asset Presets
// ----------------------------------------------------------------------------

export interface AssetPreset {
  symbol: AssetSymbol;
  displayName: string;
  basePrice: number;
  pipSize: number;
  contractSize: number;
  biasTimeframe: Timeframe;
  executionTimeframe: Timeframe;
  atrMultiplier: number;
  minScore: number;
  riskPctMin: number;
  riskPctMax: number;
  campaignEntries: number;
  session: string;
  volatilityProfile: "Low" | "Medium" | "High" | "Extreme";
  description: string;
}

// ----------------------------------------------------------------------------
// Agent Status
// ----------------------------------------------------------------------------

export type AgentMode = "Running" | "Paused" | "Halted";

export interface AgentStatus {
  mode: AgentMode;
  ticksProcessed: number;
  uptime: number;
  lastDecisionTime: number;
  decisionsTaken: number;
  decisionsRejected: number;
  decisionsWaiting: number;
}

// ----------------------------------------------------------------------------
// Decision Log Entry
// ----------------------------------------------------------------------------

export interface DecisionLogEntry {
  id: string;
  time: number;
  asset: AssetSymbol;
  action: "Open" | "Scale" | "Trail" | "Breakeven" | "Close" | "Reject" | "Wait";
  direction?: "Long" | "Short";
  score?: number;
  reason: string;
  price?: number;
}
