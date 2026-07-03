import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { runBacktest } from "@/lib/trading/backtest";
import { ASSET_PRESETS, ASSET_ORDER } from "@/lib/trading/presets";
import type { AssetSymbol, Timeframe } from "@/lib/trading/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_STRATEGIES = ["BEKIBUFFET_V1", "ICHIMOKU_BREAKOUT", "MOMENTUM_SCALPER", "MEAN_REVERSION"];
const VALID_TIMEFRAMES = ["M5", "M15", "H1", "H4"];

export async function POST(req: NextRequest) {
  let btId: string | null = null;
  let creditsRefunded = false;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const { name, asset, strategy, timeframe, startDate, endDate, initialCapital, parameters } = body;

    // H7 FIX: Input validation — reject invalid assets, strategies, timeframes, capital
    if (!asset || !ASSET_ORDER.includes(asset as AssetSymbol)) {
      return NextResponse.json({ error: `Invalid asset. Must be one of: ${ASSET_ORDER.join(", ")}` }, { status: 400 });
    }
    if (!strategy || !VALID_STRATEGIES.includes(strategy)) {
      return NextResponse.json({ error: `Invalid strategy. Must be one of: ${VALID_STRATEGIES.join(", ")}` }, { status: 400 });
    }
    if (!timeframe || !VALID_TIMEFRAMES.includes(timeframe)) {
      return NextResponse.json({ error: `Invalid timeframe. Must be one of: ${VALID_TIMEFRAMES.join(", ")}` }, { status: 400 });
    }
    const capital = Number(initialCapital);
    if (!Number.isFinite(capital) || capital < 100 || capital > 10000000) {
      return NextResponse.json({ error: "Initial capital must be between $100 and $10,000,000" }, { status: 400 });
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      return NextResponse.json({ error: "Invalid date range. Start must be before end." }, { status: 400 });
    }

    // Check credits
    const sub = await db.subscription.findUnique({ where: { userId: session.user.id } });
    if (!sub || sub.backtestCredits <= 0) {
      return NextResponse.json({ error: "No backtest credits remaining. Upgrade your plan." }, { status: 403 });
    }

    // Create backtest record
    btId = (
      await db.backtest.create({
        data: {
          userId: session.user.id,
          name: (name || `${asset} ${strategy}`).slice(0, 200),
          asset,
          strategy,
          timeframe,
          startDate: start,
          endDate: end,
          initialCapital: capital,
          parameters: JSON.stringify(parameters || {}),
          status: "RUNNING",
        },
      })
    ).id;

    // Decrement credits
    await db.subscription.update({
      where: { userId: session.user.id },
      data: { backtestCredits: { decrement: 1 } },
    });

    // Run backtest synchronously (sandbox allows it)
    const result = runBacktest({
      asset: asset as AssetSymbol,
      timeframe: timeframe as Timeframe,
      startDate: start,
      endDate: end,
      initialCapital: capital,
      strategy: strategy as any,
      parameters,
    });

    // Update record with results
    await db.backtest.update({
      where: { id: btId },
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

    return NextResponse.json({ ok: true, backtestId: btId, result });
  } catch (e: any) {
    // H6 FIX: Refund the credit if the backtest failed, and mark the record as FAILED
    try {
      if (btId) {
        await db.backtest.update({
          where: { id: btId },
          data: { status: "FAILED", completedAt: new Date() },
        });
      }
      if (!creditsRefunded) {
        const session = await getServerSession(authOptions);
        if (session?.user?.id) {
          await db.subscription.update({
            where: { userId: session.user.id },
            data: { backtestCredits: { increment: 1 } },
          });
          creditsRefunded = true;
        }
      }
    } catch (refundErr) {
      // best-effort refund; log but don't mask the original error
      console.error("Failed to refund backtest credit:", refundErr);
    }
    console.error("Backtest failed:", e);
    return NextResponse.json({ error: e.message ?? "Backtest failed" }, { status: 500 });
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
