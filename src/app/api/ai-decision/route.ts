import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateAIDecision, generateStrategyReview, type AIAgentContext } from "@/lib/trading/aiAgent";
import type { AssetSymbol, ConfluenceScore, IchimokuReading, MarketRegime, MarketStructureReading, PriceActionReading, RiskState, Campaign } from "@/lib/trading/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const sub = await db.subscription.findUnique({ where: { userId: session.user.id } });
    if (!sub?.aiAgentEnabled) {
      return NextResponse.json({ error: "AI Agent requires Pro or higher" }, { status: 403 });
    }

    const body = await req.json();
    const { asset, mode, context, reviewStats } = body;

    if (mode === "review") {
      const review = await generateStrategyReview(reviewStats ?? {
        totalTrades: 0,
        winRate: 0,
        totalPnl: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        profitFactor: 0,
        byAsset: {},
        bySetup: [],
        recentStreaks: [],
      });
      return NextResponse.json({ ok: true, review });
    }

    // Default: generate AI decision from client-provided context
    if (!context) {
      return NextResponse.json({ error: "Missing context" }, { status: 400 });
    }

    const ctx: AIAgentContext = {
      asset: asset as AssetSymbol,
      price: context.price,
      regime: context.regime as MarketRegime,
      structure: context.structure as MarketStructureReading,
      ichimoku: context.ichimoku as IchimokuReading,
      priceAction: context.priceAction as PriceActionReading,
      confluence: context.confluence as ConfluenceScore,
      risk: context.risk as RiskState,
      openCampaigns: (context.openCampaigns ?? []) as Campaign[],
      recentTrades: context.recentTrades ?? [],
      selfLearningStats: context.selfLearningStats ?? [],
      marketContext: context.marketContext ?? { session: "", newsVolatility: "Low", spreadPips: 0, htfBias: "Flat", ltfBias: "Flat" },
    };

    const decision = await generateAIDecision(ctx);

    // Persist to DB — wrap in try/catch so DB failure doesn't lose the decision
    try {
      await db.aIDecision.create({
        data: {
          userId: session.user.id,
          asset: asset,
          decision: decision.decision,
          reasoning: decision.reasoning,
          confidence: decision.confidence,
          factors: JSON.stringify(decision.factors),
        },
      });
    } catch (dbErr) {
      console.error("Failed to persist AI decision:", dbErr);
    }

    return NextResponse.json({ ok: true, decision });
  } catch (e: any) {
    console.error("AI decision error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
