import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateAIDecision, generateStrategyReview, type AIAgentContext } from "@/lib/trading/aiAgent";
import { logger, sanitizeError } from "@/lib/logger";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { aiDecisionSchema } from "@/lib/validation";
import type { AssetSymbol, ConfluenceScore, IchimokuReading, MarketRegime, MarketStructureReading, PriceActionReading, RiskState, Campaign } from "@/lib/trading/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const sub = await db.subscription.findUnique({ where: { userId: session.user.id } });
    if (!sub?.aiAgentEnabled) {
      return NextResponse.json(
        { error: "AI Agent requires Pro or higher" },
        { status: 403 }
      );
    }

    // Rate limit
    const rl = checkRateLimit(session.user.id, "ai-decision");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again in a minute." },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const body = await req.json();
    const parseResult = aiDecisionSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }
    const { asset, mode, context, reviewStats } = parseResult.data;

    if (mode === "review") {
      const defaultStats = {
        totalTrades: 0,
        winRate: 0,
        totalPnl: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        profitFactor: 0,
        byAsset: {} as Record<string, { trades: number; pnl: number; winRate: number }>,
        bySetup: [] as { setup: string; winRate: number; weight: number; trades: number; pnl: number }[],
        recentStreaks: [] as { type: "win" | "loss"; length: number }[],
      };
      const review = await generateStrategyReview(
        (reviewStats as typeof defaultStats) ?? defaultStats
      );
      return NextResponse.json({ ok: true, review });
    }

    if (!context) {
      return NextResponse.json({ error: "Missing market context" }, { status: 400 });
    }

    const ctx: AIAgentContext = {
      asset: asset as AssetSymbol,
      price: context.price as number,
      regime: context.regime as MarketRegime,
      structure: context.structure as MarketStructureReading,
      ichimoku: context.ichimoku as IchimokuReading,
      priceAction: context.priceAction as PriceActionReading,
      confluence: context.confluence as ConfluenceScore,
      risk: context.risk as RiskState,
      openCampaigns: (context.openCampaigns ?? []) as Campaign[],
      recentTrades: (context.recentTrades ?? []) as AIAgentContext["recentTrades"],
      selfLearningStats: (context.selfLearningStats ?? []) as AIAgentContext["selfLearningStats"],
      marketContext: (context.marketContext ?? { session: "", newsVolatility: "Low", spreadPips: 0, htfBias: "Flat", ltfBias: "Flat" }) as AIAgentContext["marketContext"],
    };

    const decision = await generateAIDecision(ctx);

    // Persist to DB
    try {
      await db.aIDecision.create({
        data: {
          userId: session.user.id,
          asset,
          decision: decision.decision,
          reasoning: decision.reasoning,
          confidence: decision.confidence,
          factors: JSON.stringify(decision.factors),
        },
      });
    } catch (dbErr) {
      logger.error("Failed to persist AI decision", { error: (dbErr as any).message });
    }

    logger.info("AI decision generated", {
      userId: session.user.id,
      asset,
      decision: decision.decision,
      confidence: decision.confidence,
    });

    return NextResponse.json({ ok: true, decision });
  } catch (e: any) {
    logger.error("AI decision error", { error: e.message });
    const err = sanitizeError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
