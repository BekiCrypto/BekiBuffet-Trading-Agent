// ============================================================================
// BekiBuffet SaaS — Subscription tiers, broker adapters, and shared types
// ============================================================================

export type Tier = "FREE" | "PRO" | "ELITE" | "INSTITUTIONAL";
export type SubStatus = "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIALING";
export type BrokerType = "MT5" | "OANDA" | "BINANCE" | "INTERACTIVE_BROKERS" | "DEMO";
export type AgentMode = "PAUSED" | "RUNNING" | "HALTED";

export interface TierConfig {
  id: Tier;
  name: string;
  price: number;
  tagline: string;
  features: string[];
  limits: {
    seats: number;
    maxCapitalUsd: number;
    riskLimitPct: number;
    backtestCredits: number;
    aiAgentEnabled: boolean;
    edgeDiscoveryEnabled: boolean;
  };
  highlight?: boolean;
  cta: string;
}

export const TIERS: TierConfig[] = [
  {
    id: "FREE",
    name: "Starter",
    price: 0,
    tagline: "Paper trade and learn the system",
    features: [
      "1 broker connection (demo only)",
      "Paper trading on all 5 assets",
      "10 backtests / month",
      "Confluence scoring dashboard",
      "Community access",
    ],
    limits: {
      seats: 1,
      maxCapitalUsd: 10000,
      riskLimitPct: 0.5,
      backtestCredits: 10,
      aiAgentEnabled: false,
      edgeDiscoveryEnabled: false,
    },
    cta: "Start Free",
  },
  {
    id: "PRO",
    name: "Professional",
    price: 149,
    tagline: "For active retail traders ready to automate",
    features: [
      "3 broker connections (live)",
      "Live + paper trading",
      "100 backtests / month",
      "AI agent decision layer",
      "Edge discovery (weekly)",
      "Campaign manager (3 scales)",
      "Risk Commander with daily DD limits",
      "Email + Telegram alerts",
    ],
    limits: {
      seats: 3,
      maxCapitalUsd: 100000,
      riskLimitPct: 1.5,
      backtestCredits: 100,
      aiAgentEnabled: true,
      edgeDiscoveryEnabled: true,
    },
    highlight: true,
    cta: "Start 14-day Trial",
  },
  {
    id: "ELITE",
    name: "Elite",
    price: 499,
    tagline: "For serious traders managing real capital",
    features: [
      "10 broker connections (live)",
      "Unlimited backtests",
      "AI agent + continuous edge discovery",
      "Campaign manager (5 scales)",
      "Portfolio correlation engine",
      "Custom asset presets",
      "Priority execution layer",
      "Dedicated Slack channel",
      "Quarterly strategy review",
    ],
    limits: {
      seats: 10,
      maxCapitalUsd: 1000000,
      riskLimitPct: 2.0,
      backtestCredits: 1000,
      aiAgentEnabled: true,
      edgeDiscoveryEnabled: true,
    },
    cta: "Apply for Elite",
  },
  {
    id: "INSTITUTIONAL",
    name: "Institutional",
    price: 2500,
    tagline: "For funds and family offices",
    features: [
      "Unlimited broker connections",
      "Dedicated execution infrastructure",
      "Multi-strategy portfolio allocator",
      "Custom AI model fine-tuning",
      "On-prem deployment option",
      "White-glove onboarding",
      "API access + FIX protocol",
      "24/7 priority support",
      "Compliance reporting suite",
    ],
    limits: {
      seats: 100,
      maxCapitalUsd: 100000000,
      riskLimitPct: 3.0,
      backtestCredits: 100000,
      aiAgentEnabled: true,
      edgeDiscoveryEnabled: true,
    },
    cta: "Contact Sales",
  },
];

export function getTierConfig(tier: Tier): TierConfig {
  return TIERS.find((t) => t.id === tier) ?? TIERS[0];
}

// --- Broker adapters -----------------------------------------------------

export interface BrokerAdapter {
  type: BrokerType;
  name: string;
  displayName: string;
  logoColor: string;
  description: string;
  requiredFields: { key: string; label: string; type: "text" | "password" | "number"; placeholder?: string; required: boolean }[];
  supportedAssets: string[];
  features: string[];
}

export const BROKER_ADAPTERS: BrokerAdapter[] = [
  {
    type: "MT5",
    name: "MT5",
    displayName: "MetaTrader 5",
    logoColor: "#e34b24",
    description: "Connect to any MT5 broker. Full order execution, position sync, and campaign management.",
    requiredFields: [
      { key: "accountName", label: "Account Name", type: "text", placeholder: "My MT5 Live", required: true },
      { key: "accountId", label: "Login ID", type: "text", placeholder: "12345678", required: true },
      { key: "server", label: "Server", type: "text", placeholder: "ICMarkets-Live12", required: true },
      { key: "apiKey", label: "Password", type: "password", required: true },
    ],
    supportedAssets: ["XAUUSD", "EURUSD", "GBPUSD", "EURJPY"],
    features: ["Market execution", "Pending orders", "Hedging", "Trailing stops", "EA bridge"],
  },
  {
    type: "OANDA",
    name: "OANDA",
    displayName: "OANDA v20",
    logoColor: "#1e4ba0",
    description: "OANDA REST v20 API. Sub-second execution, tight spreads on majors and gold.",
    requiredFields: [
      { key: "accountName", label: "Account Name", type: "text", placeholder: "OANDA Live", required: true },
      { key: "accountId", label: "Account ID", type: "text", placeholder: "001-001-12345-001", required: true },
      { key: "apiKey", label: "API Token", type: "password", required: true },
    ],
    supportedAssets: ["XAUUSD", "EURUSD", "GBPUSD", "EURJPY"],
    features: ["REST v20", "Streaming prices", "Units-based sizing", "Negative balance protection"],
  },
  {
    type: "BINANCE",
    name: "BINANCE",
    displayName: "Binance",
    logoColor: "#f0b90b",
    description: "Binance Spot + Futures. Connect API keys with trading permission for BTCUSD perpetuals.",
    requiredFields: [
      { key: "accountName", label: "Account Name", type: "text", placeholder: "Binance Futures", required: true },
      { key: "accountId", label: "Email / UID", type: "text", placeholder: "you@email.com", required: true },
      { key: "apiKey", label: "API Key", type: "password", required: true },
      { key: "apiSecret", label: "API Secret", type: "password", required: true },
    ],
    supportedAssets: ["BTCUSD"],
    features: ["Spot + USDM futures", "Cross/isolated margin", "Testnet support"],
  },
  {
    type: "INTERACTIVE_BROKERS",
    name: "IB",
    displayName: "Interactive Brokers",
    logoColor: "#d20a0a",
    description: "IB Gateway TWS API. Multi-asset, multi-currency, professional execution.",
    requiredFields: [
      { key: "accountName", label: "Account Name", type: "text", placeholder: "IB Pro", required: true },
      { key: "accountId", label: "Account ID", type: "text", placeholder: "U1234567", required: true },
      { key: "apiKey", label: "API Key", type: "password", required: true },
    ],
    supportedAssets: ["XAUUSD", "EURUSD", "GBPUSD", "EURJPY", "BTCUSD"],
    features: ["TWS + Gateway", "SMART routing", "Multi-currency", "Fractional shares"],
  },
  {
    type: "DEMO",
    name: "DEMO",
    displayName: "BekiBuffet Paper",
    logoColor: "#3fb950",
    description: "Built-in paper trading account with realistic fills. No broker needed — perfect for testing.",
    requiredFields: [
      { key: "accountName", label: "Account Name", type: "text", placeholder: "Paper Account", required: true },
      { key: "accountId", label: "Initial Capital (USD)", type: "number", placeholder: "100000", required: true },
    ],
    supportedAssets: ["XAUUSD", "EURUSD", "GBPUSD", "EURJPY", "BTCUSD"],
    features: ["Realistic slippage", "Spread simulation", "No minimum", "Full feature parity"],
  },
];

export function getBrokerAdapter(type: BrokerType): BrokerAdapter | undefined {
  return BROKER_ADAPTERS.find((b) => b.type === type);
}

// --- SaaS view routing (single-page app) ---------------------------------

export type SaaSView =
  | "landing"
  | "signin"
  | "dashboard"
  | "terminal"
  | "brokers"
  | "backtest"
  | "edge"
  | "ai-agent"
  | "subscription"
  | "settings"
  | "admin";
