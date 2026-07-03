import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { runBacktest } from "@/lib/trading/backtest";
import { logger, sanitizeError } from "@/lib/logger";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { runBacktestSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let btId: string | null = null;
  let creditsRefunded = false;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit
    const rl = checkRateLimit(session.user.id, "backtest");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again in a minute." },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const body = await req.json();

    // Validate input with zod
    const parseResult = runBacktestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.flatten() },
        { status: 400, headers: rateLimitHeaders(rl) }
      );
    }
    const { name, asset, strategy, timeframe, startDate, endDate, initialCapital, parameters } = parseResult.data;

    // Check credits (super admin has unlimited)
    const isSuperAdmin = (session.user as any).isSuperAdmin;
    if (!isSuperAdmin) {
      const sub = await db.subscription.findUnique({ where: { userId: session.user.id } });
      if (!sub || sub.backtestCredits <= 0) {
        return NextResponse.json(
          { error: "No backtest credits remaining. Upgrade your plan." },
          { status: 403 }
        );
      }
    }

    // Create backtest record
    btId = (
      await db.backtest.create({
        data: {
          userId: session.user.id,
          name: name.slice(0, 200),
          asset,
          strategy,
          timeframe,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          initialCapital,
          parameters: JSON.stringify(parameters || {}),
          status: "RUNNING",
        },
      })
    ).id;

    // Decrement credits (skip for super admin — unlimited)
    if (!isSuperAdmin) {
      await db.subscription.update({
        where: { userId: session.user.id },
        data: { backtestCredits: { decrement: 1 } },
      });
    }

    // Run backtest
    const result = runBacktest({
      asset: asset as any,
      timeframe: timeframe as any,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      initialCapital,
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
        detail: `${name} — ${result.totalTrades} trades, ${result.totalReturn.toFixed(1)}% return`,
      },
    });

    logger.info("Backtest completed", {
      userId: session.user.id,
      backtestId: btId,
      trades: result.totalTrades,
      return: result.totalReturn,
    });

    return NextResponse.json({ ok: true, backtestId: btId, result });
  } catch (e: any) {
    // Refund credit on failure
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
      logger.error("Failed to refund backtest credit", { error: (refundErr as any).message });
    }
    logger.error("Backtest failed", { backtestId: btId, error: e.message });
    const err = sanitizeError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const backtests = await db.backtest.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return NextResponse.json({ backtests });
  } catch (e: any) {
    logger.error("Failed to fetch backtests", { userId: session.user.id, error: e.message });
    const err = sanitizeError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
