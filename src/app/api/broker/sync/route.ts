import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptCredentials, getBrokerPositions, type BrokerType } from "@/lib/brokers";
import { logger, sanitizeError } from "@/lib/logger";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Synchronize broker account: fetch real balance, equity, and open positions
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(session.user.id, "broker");
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  try {
    const { searchParams } = new URL(req.url);
    const brokerId = searchParams.get("id");
    if (!brokerId) return NextResponse.json({ error: "Missing broker id" }, { status: 400 });

    const broker = await db.brokerAccount.findFirst({
      where: { id: brokerId, userId: session.user.id },
    });
    if (!broker) return NextResponse.json({ error: "Broker not found" }, { status: 404 });

    // Decrypt credentials
    const creds = decryptCredentials(broker);

    // Fetch real positions from broker API
    const positions = await getBrokerPositions(broker.brokerType as BrokerType, creds);

    // Update last sync time
    await db.brokerAccount.update({
      where: { id: brokerId },
      data: { lastSyncAt: new Date() },
    });

    logger.info("Broker sync complete", {
      userId: session.user.id,
      brokerId,
      positionsCount: positions.length,
    });

    return NextResponse.json({
      ok: true,
      positions,
      syncedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("Broker sync failed", { userId: session.user.id, error: e.message });
    const err = sanitizeError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
