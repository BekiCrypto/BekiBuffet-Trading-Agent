import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { runEdgeDiscovery } from "@/lib/trading/edgeDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const sub = await db.subscription.findUnique({ where: { userId: session.user.id } });
    if (!sub?.edgeDiscoveryEnabled) {
      return NextResponse.json({ error: "Edge discovery requires Pro or higher" }, { status: 403 });
    }

    const result = runEdgeDiscovery(12);

    // Persist top candidates as edge profiles
    for (const candidate of result.candidates.slice(0, 5)) {
      await db.edgeProfile.create({
        data: {
          userId: session.user.id,
          name: candidate.id,
          asset: candidate.asset,
          description: `${candidate.strategy} on ${candidate.asset} ${candidate.timeframe} — min score ${candidate.parameters.minScore}, ATR ×${candidate.parameters.atrMultiplier}`,
          parameters: JSON.stringify(candidate.parameters),
          winRate: candidate.outOfSample.winRate,
          profitFactor: candidate.outOfSample.profitFactor,
          sharpeRatio: candidate.outOfSample.sharpeRatio,
          maxDrawdown: candidate.outOfSample.maxDrawdown,
          totalTrades: candidate.outOfSample.totalTrades,
          avgRoiPerTrade: candidate.outOfSample.avgRoiPerTrade,
          walkForwardScore: candidate.walkForwardScore,
          inSampleScore: candidate.inSampleScore,
          outOfSampleScore: candidate.outOfSampleScore,
          status: candidate.recommendation === "DEPLOY" ? "VALIDATED" : "DISCOVERED",
        },
      });
    }

    await db.activityLog.create({
      data: {
        userId: session.user.id,
        type: "EDGE",
        action: "DISCOVERY_COMPLETED",
        detail: `${result.candidates.length} candidates found, best composite ${result.bestEdge?.compositeScore ?? 0}/100`,
      },
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const edges = await db.edgeProfile.findMany({
      where: { userId: session.user.id },
      orderBy: { walkForwardScore: "desc" },
      take: 30,
    });
    return NextResponse.json({ edges });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
