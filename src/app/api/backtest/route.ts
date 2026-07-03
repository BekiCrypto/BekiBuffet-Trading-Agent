import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { runBacktest } from "@/lib/trading/backtest";
import type { AssetSymbol, Timeframe } from "@/lib/trading/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const { name, asset, strategy, timeframe, startDate, endDate, initialCapital, parameters } = body;

    // Check credits
    const sub = await db.subscription.findUnique({ where: { userId: session.user.id } });
    if (!sub || sub.backtestCredits <= 0) {
      return NextResponse.json({ error: "No backtest credits remaining" }, { status: 403 });
    }

    // Create backtest record
    const bt = await db.backtest.create({
      data: {
        userId: session.user.id,
        name: name || `${asset} ${strategy}`,
        asset,
        strategy,
        timeframe,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        initialCapital: initialCapital || 10000,
        parameters: JSON.stringify(parameters || {}),
        status: "RUNNING",
      },
    });

    // Decrement credits
    await db.subscription.update({
      where: { userId: session.user.id },
      data: { backtestCredits: { decrement: 1 } },
    });

    // Run backtest synchronously (sandbox allows it)
    const result = runBacktest({
      asset: asset as AssetSymbol,
      timeframe: timeframe as Timeframe,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      initialCapital: initialCapital || 10000,
      strategy,
      parameters,
    });

    // Update record with results
    const updated = await db.backtest.update({
      where: { id: bt.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        finalEquity: result.finalEquity,
        totalReturn: result.totalReturn,
        maxDrawdown: result.maxDrawdown,
        sharpeRatio: result.sharpeRatio,
        winRate: result.winRate,
        profitFactor: result.profitFactor,
        totalTrades: result.totalTrades,
        avgWinUsd: result.avgWinUsd,
        avgLossUsd: result.avgLossUsd,
        equityCurve: JSON.stringify(result.equityCurve.slice(-200)),
        tradesJson: JSON.stringify(result.trades.slice(-100)),
        duration: result.durationMs,
      },
    });

    await db.activityLog.create({
      data: {
        userId: session.user.id,
        type: "BACKTEST",
        action: "COMPLETED",
        detail: `${name} — ${result.totalTrades} trades, ${result.totalReturn.toFixed(1)}% return, ${result.winRate.toFixed(0)}% WR`,
      },
    });

    return NextResponse.json({ ok: true, backtest: updated, result });
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
    const backtests = await db.backtest.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return NextResponse.json({ backtests });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
