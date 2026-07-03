import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptCredentials, placeBrokerOrder, type BrokerType } from "@/lib/brokers";
import { logger, sanitizeError } from "@/lib/logger";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const executeTradeSchema = z.object({
  brokerId: z.string().min(1),
  asset: z.enum(["XAUUSD", "EURUSD", "GBPUSD", "EURJPY", "BTCUSD"]),
  direction: z.enum(["LONG", "SHORT"]),
  size: z.number().positive().max(100000),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
  aiDecisionId: z.string().optional(),
});

// Execute a real trade on the connected broker
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(session.user.id, "default");
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  try {
    const body = await req.json();
    const parseResult = executeTradeSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }
    const { brokerId, asset, direction, size, stopLoss, takeProfit, aiDecisionId } = parseResult.data;

    // Get broker account
    const broker = await db.brokerAccount.findFirst({
      where: { id: brokerId, userId: session.user.id },
    });
    if (!broker) return NextResponse.json({ error: "Broker not found" }, { status: 404 });
    if (!broker.isConnected) return NextResponse.json({ error: "Broker is not connected" }, { status: 400 });

    // Decrypt credentials
    const creds = decryptCredentials(broker);

    // Place real order on broker
    const orderResult = await placeBrokerOrder(broker.brokerType as BrokerType, creds, {
      symbol: asset,
      direction: direction as "LONG" | "SHORT",
      size,
      stopLoss,
      takeProfit,
      type: "MARKET",
    });

    if (orderResult.status === "REJECTED") {
      logger.warn("Trade rejected by broker", {
        userId: session.user.id,
        brokerId,
        asset,
        error: orderResult.error,
      });
      return NextResponse.json(
        { error: `Order rejected: ${orderResult.error}` },
        { status: 400 }
      );
    }

    // Persist trade to database
    const trade = await db.trade.create({
      data: {
        userId: session.user.id,
        brokerAccountId: brokerId,
        asset,
        direction,
        size,
        entryPrice: orderResult.filledPrice ?? 0,
        stopLoss: stopLoss ?? 0,
        takeProfit: takeProfit ?? 0,
        status: "OPEN",
        entryScore: 0, // Set by AI agent if applicable
      },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: session.user.id,
        type: "TRADE",
        action: "OPENED",
        detail: `${direction} ${size} ${asset} @ ${orderResult.filledPrice ?? "market"} on ${broker.brokerType}`,
      },
    });

    // Mark AI decision as actioned (if applicable)
    if (aiDecisionId) {
      await db.aIDecision.update({
        where: { id: aiDecisionId },
        data: { actioned: true },
      });
    }

    logger.info("Trade executed", {
      userId: session.user.id,
      brokerId,
      tradeId: trade.id,
      asset,
      direction,
      size,
      orderId: orderResult.orderId,
    });

    return NextResponse.json({
      ok: true,
      tradeId: trade.id,
      orderId: orderResult.orderId,
      status: orderResult.status,
      filledPrice: orderResult.filledPrice,
      filledSize: orderResult.filledSize,
    });
  } catch (e: any) {
    logger.error("Trade execution failed", { userId: session.user.id, error: e.message });
    const err = sanitizeError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
