// ============================================================================
// BekiBuffet — AI Agent Decision Layer
// LLM-powered meta-decision making on top of the rule-based engine.
// The AI doesn't override the rules — it synthesizes context, identifies
// patterns the rules miss, and proposes actions the trade desk executes.
// ============================================================================

import ZAI from "z-ai-web-dev-sdk";
import type {
  AssetSymbol,
  ConfluenceScore,
  IchimokuReading,
  MarketRegime,
  MarketStructureReading,
  PriceActionReading,
  RiskState,
  Campaign,
} from "./types";

export interface AIAgentContext {
  asset: AssetSymbol;
  price: number;
  regime: MarketRegime;
  structure: MarketStructureReading;
  ichimoku: IchimokuReading;
  priceAction: PriceActionReading;
  confluence: ConfluenceScore;
  risk: RiskState;
  openCampaigns: Campaign[];
  recentTrades: { asset: string; pnl: number; direction: string; exitReason: string; openTime: number }[];
  selfLearningStats: { setup: string; winRate: number; weight: number; trades: number }[];
  marketContext: {
    session: string;
    newsVolatility: string;
    spreadPips: number;
    htfBias: string;
    ltfBias: string;
  };
}

export interface AIAgentDecision {
  decision: "OPEN" | "SCALE" | "CLOSE" | "REJECT" | "REBALANCE" | "HEDGE" | "HOLD";
  direction?: "Long" | "Short";
  confidence: number; // 0-1
  reasoning: string;
  factors: {
    name: string;
    influence: number; // -1 to +1
    note: string;
  }[];
  riskAdjustment?: {
    riskPerTradePct?: number;
    atrMultiplier?: number;
    reason: string;
  };
  // Learning insights — what the AI learned from this evaluation
  insight: string;
}

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;
async function getZAI() {
  if (!zaiInstance) zaiInstance = await ZAI.create();
  return zaiInstance;
}

const SYSTEM_PROMPT = `You are BekiBuffet's AI Trade Strategist — a meta-decision layer that sits above a rule-based autonomous trading engine.

Your job:
1. Synthesize ALL market context (regime, structure, Ichimoku, price action, confluence score, risk, open campaigns, recent trade history, self-learning stats) into ONE clear decision.
2. Identify patterns the rule-based engine might miss — e.g., regime shifts, correlation breakdowns, exhaustion signals, news-driven regime changes.
3. Recommend position sizing adjustments and risk posture changes.
4. Generate ONE concrete insight per decision that feeds back into the self-learning module.

You do NOT override the rule-based engine — you AUGMENT it. If the engine says REJECT, you can still flag a setup as worth watching. If the engine says TRADE, you can recommend a smaller size if you see hidden risk.

Respond ONLY with valid JSON in this exact schema:
{
  "decision": "OPEN" | "SCALE" | "CLOSE" | "REJECT" | "REBALANCE" | "HEDGE" | "HOLD",
  "direction": "Long" | "Short" | null,
  "confidence": 0.0-1.0,
  "reasoning": "2-3 sentence explanation",
  "factors": [{"name": "...", "influence": -1.0 to 1.0, "note": "..."}],
  "riskAdjustment": {"riskPerTradePct": number|null, "atrMultiplier": number|null, "reason": "..."} | null,
  "insight": "One-sentence learning that should be recorded for future evaluations"
}

Be decisive. Be specific. Cite real numbers from the context. Do not waffle.`;

function buildContextPrompt(ctx: AIAgentContext): string {
  const recentPnl = ctx.recentTrades.slice(-10).reduce((s, t) => s + t.pnl, 0);
  const winRate =
    ctx.recentTrades.length > 0
      ? (ctx.recentTrades.filter((t) => t.pnl > 0).length / ctx.recentTrades.length * 100).toFixed(0)
      : "n/a";
  const topSetups = ctx.selfLearningStats
    .filter((s) => s.trades >= 5)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map((s) => `${s.setup}: ${s.winRate.toFixed(0)}% WR (weight ${s.weight.toFixed(2)}, ${s.trades} trades)`)
    .join("; ");

  return `CURRENT MARKET STATE — ${ctx.asset}
Price: ${ctx.price}
Regime: ${ctx.regime.type} (${ctx.regime.direction}, strength ${ctx.regime.strength}/100, vol ${ctx.regime.volatilityPct.toFixed(2)}%)
Structure: ${ctx.structure.state} — ${ctx.structure.trendDirection} (BoS=${ctx.structure.bos}, CHoCH=${ctx.structure.choch}, LiqSweep=${ctx.structure.liquiditySwept})
Swing High: ${ctx.structure.swingHigh} | Swing Low: ${ctx.structure.swingLow}

ICHIMOKU (composite score ${ctx.ichimoku.score.toFixed(0)})
Cloud: ${ctx.ichimoku.cloudColor} (${ctx.ichimoku.cloudThickness.toFixed(3)}% thick, slope ${ctx.ichimoku.cloudSlope.toFixed(2)})
Price vs Cloud: ${ctx.ichimoku.priceVsCloud} (${ctx.ichimoku.distanceFromCloudPct.toFixed(3)}% away)
Tenkan/Kijun: ${ctx.ichimoku.tenkanVsKijun} (Tenkan angle ${ctx.ichimoku.tenkanAngle.toFixed(1)}°, Kijun angle ${ctx.ichimoku.kijunAngle.toFixed(1)}°)
Future Cloud: ${ctx.ichimoku.futureCloudColor}
Chikou Clearance: ${ctx.ichimoku.chikouClearance}

PRICE ACTION
Pattern: ${ctx.priceAction.pattern} (${ctx.priceAction.direction}, ${ctx.priceAction.winRate}% historical WR, ${ctx.priceAction.confidence}% confidence)

CONFLUENCE SCORE: ${ctx.confluence.total}/100 (threshold ${ctx.confluence.threshold}, verdict ${ctx.confluence.verdict}, direction ${ctx.confluence.direction})
Factors: ${ctx.confluence.factors.map((f) => `${f.name}=${f.score}/${f.maxScore} (${f.status})`).join(", ")}

RISK
Equity: $${ctx.risk.equity.toFixed(0)} | Floating PnL: $${ctx.risk.floatingPnl.toFixed(0)}
Daily Loss: ${ctx.risk.dailyLossPct.toFixed(2)}% / ${ctx.risk.maxDailyLossPct}%
Exposure: ${ctx.risk.currentExposurePct.toFixed(2)}% / ${ctx.risk.maxExposurePct}%
Consecutive Losses: ${ctx.risk.consecutiveLosses}/${ctx.risk.maxConsecutiveLosses}

OPEN CAMPAIGNS: ${ctx.openCampaigns.length}
${ctx.openCampaigns.map((c) => `  - ${c.direction} ${c.asset} ${c.id} scale ${c.positions.filter(p => p.status !== "Closed").length}/${c.maxScale} avg ${c.averageEntry.toFixed(c.averageEntry > 1000 ? 1 : 4)} stop ${c.aggregateStop.toFixed(c.aggregateStop > 1000 ? 1 : 4)} PnL $${c.aggregatePnl.toFixed(0)}`).join("\n")}

RECENT TRADES (last 10)
Total PnL: $${recentPnl.toFixed(0)} | Win rate: ${winRate}%
${ctx.recentTrades.slice(-5).map((t) => `  - ${t.direction} ${t.asset} ${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(0)} (${t.exitReason})`).join("\n")}

SELF-LEARNING STATS (top setups)
${topSetups || "No trades recorded yet"}

MARKET CONTEXT
Session: ${ctx.marketContext.session} | News: ${ctx.marketContext.newsVolatility} | Spread: ${ctx.marketContext.spreadPips} pips
HTF Bias: ${ctx.marketContext.htfBias} | LTF Bias: ${ctx.marketContext.ltfBias}

What is your decision? Be specific and cite the numbers above.`;
}

export async function generateAIDecision(ctx: AIAgentContext): Promise<AIAgentDecision> {
  try {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: SYSTEM_PROMPT },
        { role: "user", content: buildContextPrompt(ctx) },
      ],
      thinking: { type: "disabled" },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    // Extract JSON from response (in case there's surrounding prose)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return fallbackDecision(ctx, "AI returned non-JSON response");
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      decision: parsed.decision ?? "HOLD",
      direction: parsed.direction ?? undefined,
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
      reasoning: parsed.reasoning ?? "No reasoning provided",
      factors: Array.isArray(parsed.factors) ? parsed.factors : [],
      riskAdjustment: parsed.riskAdjustment ?? undefined,
      insight: parsed.insight ?? "No insight generated",
    };
  } catch (e: any) {
    return fallbackDecision(ctx, `AI error: ${e.message}`);
  }
}

function fallbackDecision(ctx: AIAgentContext, reason: string): AIAgentDecision {
  // If AI fails, defer to rule-based confluence verdict
  const verdict = ctx.confluence.verdict;
  return {
    decision: verdict === "Trade" ? "OPEN" : verdict === "Wait" ? "HOLD" : "REJECT",
    direction: ctx.confluence.direction === "Long" ? "Long" : ctx.confluence.direction === "Short" ? "Short" : undefined,
    confidence: 0.4,
    reasoning: `AI unavailable (${reason}). Deferring to rule-based verdict: ${verdict} (score ${ctx.confluence.total}/${ctx.confluence.threshold}).`,
    factors: [],
    insight: `AI layer offline — relying on rule-based engine. Investigate SDK connectivity.`,
  };
}

// --- AI Strategy Review (deeper periodic analysis) ----------------------

export interface StrategyReview {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  riskAssessment: string;
  nextActions: string[];
}

export async function generateStrategyReview(stats: {
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  sharpeRatio: number;
  maxDrawdown: number;
  profitFactor: number;
  byAsset: Record<string, { trades: number; pnl: number; winRate: number }>;
  bySetup: { setup: string; winRate: number; weight: number; trades: number; pnl: number }[];
  recentStreaks: { type: "win" | "loss"; length: number }[];
}): Promise<StrategyReview> {
  try {
    const zai = await getZAI();
    const prompt = `As BekiBuffet's Strategy Reviewer, analyze this trading performance and produce a strategic review.

PERFORMANCE SUMMARY
Total Trades: ${stats.totalTrades}
Win Rate: ${stats.winRate.toFixed(1)}%
Total PnL: $${stats.totalPnl.toFixed(0)}
Sharpe Ratio: ${stats.sharpeRatio.toFixed(2)}
Max Drawdown: ${stats.maxDrawdown.toFixed(1)}%
Profit Factor: ${stats.profitFactor.toFixed(2)}

PERFORMANCE BY ASSET
${Object.entries(stats.byAsset).map(([a, s]) => `  ${a}: ${s.trades} trades, ${s.winRate.toFixed(0)}% WR, $${s.pnl.toFixed(0)} PnL`).join("\n")}

TOP SETUPS (by sample size)
${stats.bySetup.slice(0, 10).map((s) => `  ${s.setup}: ${s.winRate.toFixed(0)}% WR, ${s.trades} trades, $${s.pnl.toFixed(0)} PnL, weight ${s.weight.toFixed(2)}`).join("\n")}

RECENT STREAKS
${stats.recentStreaks.slice(-5).map((s) => `  ${s.type === "win" ? "Win" : "Loss"} streak of ${s.length}`).join("\n")}

Provide:
1. SUMMARY — 2-3 sentence overall assessment
2. STRENGTHS — list of what's working
3. WEAKNESSES — list of what's failing
4. RECOMMENDATIONS — specific actionable changes
5. RISK_ASSESSMENT — current risk posture evaluation
6. NEXT_ACTIONS — top 3 priority actions

Respond as valid JSON: {"summary": "...", "strengths": [...], "weaknesses": [...], "recommendations": [...], "riskAssessment": "...", "nextActions": [...]}`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: "You are a quantitative trading strategist reviewing an autonomous agent's performance. Be specific, cite numbers, and prioritize actionable insights over generic advice." },
        { role: "user", content: prompt },
      ],
      thinking: { type: "disabled" },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    return JSON.parse(jsonMatch[0]);
  } catch (e: any) {
    return {
      summary: `Strategy review unavailable: ${e.message}. Rule-based performance metrics still valid.`,
      strengths: [],
      weaknesses: [],
      recommendations: ["Investigate AI SDK connectivity"],
      riskAssessment: "Unable to assess via AI — review metrics manually",
      nextActions: ["Check z-ai-web-dev-sdk availability"],
    };
  }
}
