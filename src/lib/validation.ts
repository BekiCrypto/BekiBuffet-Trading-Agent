import { z } from "zod";

// ============================================================================
// BekiBuffet SaaS — API Request Validation Schemas
// ============================================================================
// Every API POST body is validated against a zod schema before processing.
// Invalid requests return 400 with a descriptive error.
// ============================================================================

export const brokerTypeSchema = z.enum([
  "MT5",
  "OANDA",
  "BINANCE",
  "INTERACTIVE_BROKERS",
  "DEMO",
]);

export const tierSchema = z.enum(["FREE", "PRO", "ELITE", "INSTITUTIONAL"]);

export const assetSchema = z.enum(["XAUUSD", "EURUSD", "GBPUSD", "EURJPY", "BTCUSD"]);

export const timeframeSchema = z.enum(["M5", "M15", "H1", "H4"]);

export const strategySchema = z.enum([
  "BEKIBUFFET_V1",
  "ICHIMOKU_BREAKOUT",
  "MOMENTUM_SCALPER",
  "MEAN_REVERSION",
]);

// --- Broker connect ---
export const connectBrokerSchema = z.object({
  brokerType: brokerTypeSchema,
  accountName: z.string().min(1).max(100),
  accountId: z.string().min(1).max(100),
  apiKey: z.string().max(500).optional(),
  apiSecret: z.string().max(500).optional(),
  server: z.string().max(200).optional(),
  initialCapital: z.number().min(0).max(100000000).optional(),
});

// --- Subscription upgrade ---
export const upgradeSubscriptionSchema = z.object({
  tier: tierSchema,
  paymentToken: z.string().max(500).optional(),
  adminOverride: z.boolean().optional(),
});

// --- Backtest run ---
export const runBacktestSchema = z.object({
  name: z.string().min(1).max(200),
  asset: assetSchema,
  strategy: strategySchema,
  timeframe: timeframeSchema,
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  initialCapital: z.number().min(100).max(10000000),
  parameters: z
    .object({
      minScoreOverride: z.number().min(50).max(100).optional(),
      atrMultiplierOverride: z.number().min(0.5).max(5).optional(),
      riskPerTradeOverride: z.number().min(0.1).max(5).optional(),
    })
    .optional(),
});

// --- AI decision ---
export const aiDecisionSchema = z.object({
  asset: assetSchema,
  mode: z.enum(["decision", "review"]).optional().default("decision"),
  context: z.record(z.string(), z.any()).optional(),
  reviewStats: z.record(z.string(), z.any()).optional(),
});

// --- Agent state upsert ---
export const agentStateSchema = z.object({
  brokerAccountId: z.string().max(100).nullable().optional(),
  mode: z.enum(["PAUSED", "RUNNING", "HALTED"]).optional(),
  equity: z.number().finite().optional(),
  balance: z.number().finite().optional(),
  floatingPnl: z.number().finite().optional(),
  dayStartEquity: z.number().finite().optional(),
  consecutiveLosses: z.number().int().min(0).optional(),
  ticksProcessed: z.number().int().min(0).optional(),
  decisionsTaken: z.number().int().min(0).optional(),
  decisionsRejected: z.number().int().min(0).optional(),
  decisionsWaiting: z.number().int().min(0).optional(),
  campaignsActive: z.number().int().min(0).optional(),
  selfLearningJson: z.string().max(5000000).optional(),
  activeAssets: z.string().max(10000).optional(),
});

// --- Edge discovery ---
export const edgeDiscoverySchema = z.object({}).optional();

// --- Seed demo ---
export const seedSchema = z.object({}).optional();

export type ConnectBrokerInput = z.infer<typeof connectBrokerSchema>;
export type UpgradeSubscriptionInput = z.infer<typeof upgradeSubscriptionSchema>;
export type RunBacktestInput = z.infer<typeof runBacktestSchema>;
export type AIDecisionInput = z.infer<typeof aiDecisionSchema>;
export type AgentStateInput = z.infer<typeof agentStateSchema>;
