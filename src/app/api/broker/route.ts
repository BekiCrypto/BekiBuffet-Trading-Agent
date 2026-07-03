import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt, decryptFields } from "@/lib/crypto";
import { logger, sanitizeError } from "@/lib/logger";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { connectBrokerSchema } from "@/lib/validation";
import { validateBrokerCredentials, type BrokerType } from "@/lib/brokers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const brokers = await db.brokerAccount.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });
    // Decrypt credentials for display (API key shown masked, secret hidden)
    const sanitized = brokers.map((b) => ({
      ...b,
      apiKey: b.apiKey ? "***ENCRYPTED***" : null,
      apiSecret: b.apiSecret ? "***ENCRYPTED***" : null,
      hasApiKey: !!b.apiKey,
      hasApiSecret: !!b.apiSecret,
    }));
    return NextResponse.json({ brokers: sanitized });
  } catch (e: any) {
    logger.error("Failed to fetch brokers", { userId: session.user.id, error: e.message });
    const err = sanitizeError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit
  const rl = checkRateLimit(session.user.id, "broker");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  try {
    const body = await req.json();

    // Validate input
    const parseResult = connectBrokerSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.flatten() },
        { status: 400, headers: rateLimitHeaders(rl) }
      );
    }
    const data = parseResult.data;

    // Check seat limit (super admin has unlimited)
    const isSuperAdmin = (session.user as any).isSuperAdmin;
    if (!isSuperAdmin) {
      const sub = await db.subscription.findUnique({ where: { userId: session.user.id } });
      if (!sub) return NextResponse.json({ error: "No subscription found" }, { status: 400 });
      const count = await db.brokerAccount.count({ where: { userId: session.user.id } });
      if (count >= sub.seats) {
        return NextResponse.json(
          { error: `Tier ${sub.tier} allows ${sub.seats} broker connections. Upgrade for more.` },
          { status: 403 }
        );
      }
    }

    // Validate credentials against the actual broker API (real handshake)
    const brokerType = data.brokerType as BrokerType;
    let initialBalance = data.initialCapital ?? 100000;
    let initialEquity = data.initialCapital ?? 100000;

    if (brokerType !== "DEMO") {
      const validation = await validateBrokerCredentials(brokerType, {
        accountId: data.accountId,
        apiKey: data.apiKey,
        apiSecret: data.apiSecret,
        server: data.server,
      });

      if (!validation.valid) {
        return NextResponse.json(
          { error: `Broker authentication failed: ${validation.error}` },
          { status: 400 }
        );
      }

      // Use real account balance if available
      if (validation.balance != null) initialBalance = validation.balance;
      if (validation.equity != null) initialEquity = validation.equity;
    }

    // Encrypt credentials before storing
    const broker = await db.brokerAccount.create({
      data: {
        userId: session.user.id,
        brokerType,
        accountName: data.accountName,
        accountId: data.accountId,
        apiKey: data.apiKey ? encrypt(data.apiKey) : null,
        apiSecret: data.apiSecret ? encrypt(data.apiSecret) : null,
        server: data.server ?? null,
        balance: initialBalance,
        equity: initialEquity,
        isConnected: true,
        lastSyncAt: new Date(),
      },
    });

    await db.activityLog.create({
      data: {
        userId: session.user.id,
        type: "BROKER",
        action: "CONNECTED",
        detail: `Connected ${brokerType} account ${data.accountName}`,
      },
    });

    logger.info("Broker connected", {
      userId: session.user.id,
      brokerType,
      accountName: data.accountName,
    });

    // Return without sensitive fields
    return NextResponse.json({
      ok: true,
      broker: {
        ...broker,
        apiKey: broker.apiKey ? "***ENCRYPTED***" : null,
        apiSecret: broker.apiSecret ? "***ENCRYPTED***" : null,
      },
    });
  } catch (e: any) {
    logger.error("Broker connect failed", { userId: session.user.id, error: e.message });
    const err = sanitizeError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing broker id" }, { status: 400 });

    await db.brokerAccount.deleteMany({ where: { id, userId: session.user.id } });

    await db.activityLog.create({
      data: {
        userId: session.user.id,
        type: "BROKER",
        action: "DISCONNECTED",
        detail: `Disconnected broker ${id}`,
      },
    });

    logger.info("Broker disconnected", { userId: session.user.id, brokerId: id });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    logger.error("Broker disconnect failed", { userId: session.user.id, error: e.message });
    const err = sanitizeError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
