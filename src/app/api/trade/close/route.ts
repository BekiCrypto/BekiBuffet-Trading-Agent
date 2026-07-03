import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptCredentials, closeBrokerPosition, type BrokerType } from "@/lib/brokers";
import { logger, sanitizeError } from "@/lib/logger";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Close a trade on the broker and update the database
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(session.user.id, "default");
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  try {
    const body = await req.json();
    const { tradeId, exitPrice } = body;

    if (!tradeId) return NextResponse.json({ error: "Missing tradeId" }, { status: 400 });

    // Get trade from database
    const trade = await db.trade.findFirst({
      where: { id: tradeId, userId: session.user.id, status: "OPEN" },
    });
    if (!trade) return NextResponse.json({ error: "Trade not found or already closed" }, { status: 404 });

    // Get broker account
    const broker = trade.brokerAccountId
      ? await db.brokerAccount.findFirst({
          where: { id: trade.brokerAccountId, userId: session.user.id },
        })
      : null;

    // Close position on broker (if real broker)
    if (broker && broker.brokerType !== "DEMO") {
      const creds = decryptCredentials(broker);
      await closeBrokerPosition(broker.brokerType as BrokerType, creds, trade.asset);
    }

    // Calculate PnL
    const exit = exitPrice ?? 0; // In production, fetch from broker
    const direction = trade.direction === "LONG" ? 1 : -1;
    const pnl = (exit - trade.entryPrice) * direction * trade.size;
    const pnlPct = ((exit - trade.entryPrice) / trade.entryPrice) * 100 * direction;

    // Update trade in database
    const updated = await db.trade.update({
      where: { id: tradeId },
      data: {
        status: "CLOSED",
        exitPrice: exit,
        pnl,
        pnlPct,
        closeTime: new Date(),
        duration: Date.now() - trade.openTime.getTime(),
        exitReason: "Manual close",
      },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: session.user.id,
        type: "TRADE",
        action: "CLOSED",
        detail: `${trade.direction} ${trade.asset} closed — PnL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`,
      },
    });

    // Update AI decision PnL if linked
    const aiDecision = await db.aIDecision.findFirst({
      where: { userId: session.user.id, actioned: true, pnl: null },
      orderBy: { createdAt: "desc" },
    });
    if (aiDecision) {
      await db.aIDecision.update({
        where: { id: aiDecision.id },
        data: { pnl },
      });
    }

    logger.info("Trade closed", {
      userId: session.user.id,
      tradeId,
      asset: trade.asset,
      pnl,
    });

    return NextResponse.json({ ok: true, trade: updated, pnl });
  } catch (e: any) {
    logger.error("Trade close failed", { userId: session.user.id, error: e.message });
    const err = sanitizeError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
