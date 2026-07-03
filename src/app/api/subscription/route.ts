import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createCryptoPayment, isCryptoPaymentEnabled, getTierPrice } from "@/lib/crypto-payments";
import { logger, sanitizeError } from "@/lib/logger";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { upgradeSubscriptionSchema } from "@/lib/validation";
import type { Tier } from "@/lib/saas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sub = await db.subscription.findUnique({ where: { userId: session.user.id } });
  return NextResponse.json({ subscription: sub });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(session.user.id, "subscription");
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  try {
    const body = await req.json();
    const parseResult = upgradeSubscriptionSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }
    const { tier, adminOverride } = parseResult.data;
    const tierId = tier as Tier;
    const billingCycle = body.billingCycle === "annual" ? "annual" : "monthly";

    const isSuperAdmin = (session.user as any).isSuperAdmin;
    const isAdmin = (session.user as any).role === "ADMIN" || isSuperAdmin;
    const isDev = process.env.NODE_ENV !== "production";

    // Super admin: instant upgrade, no payment required, any tier
    if (isSuperAdmin) {
      const config = getTierConfig(tierId);
      const sub = await db.subscription.upsert({
        where: { userId: session.user.id },
        create: {
          userId: session.user.id,
          tier: tierId,
          status: "ACTIVE",
          ...config,
          currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
        update: {
          tier: tierId,
          status: "ACTIVE",
          ...config,
          currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });
      await db.activityLog.create({
        data: {
          userId: session.user.id,
          type: "SUBSCRIPTION",
          action: "SUPER_ADMIN_UPGRADE",
          detail: `Super admin instant upgrade to ${tierId} — no payment required`,
        },
      });
      return NextResponse.json({ ok: true, subscription: sub });
    }

    // Admin override: allow direct upgrade without payment
    if (adminOverride && isAdmin) {
      const config = getTierConfig(tierId);
      const sub = await db.subscription.upsert({
        where: { userId: session.user.id },
        create: {
          userId: session.user.id,
          tier: tierId,
          status: "ACTIVE",
          ...config,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        update: {
          tier: tierId,
          status: "ACTIVE",
          ...config,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      await db.activityLog.create({
        data: {
          userId: session.user.id,
          type: "SUBSCRIPTION",
          action: "UPGRADED",
          detail: `Admin override upgrade to ${tierId}`,
        },
      });
      return NextResponse.json({ ok: true, subscription: sub });
    }

    // Development mode: allow free upgrade (no payment needed)
    if (isDev) {
      const config = getTierConfig(tierId);
      const sub = await db.subscription.upsert({
        where: { userId: session.user.id },
        create: {
          userId: session.user.id,
          tier: tierId,
          status: "ACTIVE",
          ...config,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        update: {
          tier: tierId,
          status: "ACTIVE",
          ...config,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      await db.activityLog.create({
        data: {
          userId: session.user.id,
          type: "SUBSCRIPTION",
          action: "UPGRADED",
          detail: `Dev mode upgrade to ${tierId}`,
        },
      });
      return NextResponse.json({ ok: true, subscription: sub });
    }

    // Downgrade to FREE = cancel subscription
    if (tierId === "FREE") {
      await db.subscription.update({
        where: { userId: session.user.id },
        data: { status: "CANCELED", tier: "FREE" },
      });
      await db.activityLog.create({
        data: {
          userId: session.user.id,
          type: "SUBSCRIPTION",
          action: "CANCELED",
          detail: "Subscription canceled — downgraded to Free",
        },
      });
      return NextResponse.json({ ok: true });
    }

    // Production: require crypto payment (USDT BEP-20)
    if (!isCryptoPaymentEnabled()) {
      return NextResponse.json(
        { error: "Crypto payments are not configured. Set NOWPAYMENTS_API_KEY or CRYPTO_RECEIVING_WALLET." },
        { status: 503 }
      );
    }

    // Create crypto payment
    const payment = await createCryptoPayment(
      session.user.id,
      session.user.email!,
      tierId,
      billingCycle
    );

    if (payment.error) {
      return NextResponse.json({ error: payment.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      payment,
      message: `Send ${payment.amountUsdt} USDT (BEP-20) to activate ${tierId}`,
    });
  } catch (e: any) {
    logger.error("Subscription upgrade failed", { userId: session.user.id, error: e.message });
    const err = sanitizeError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function getTierConfig(tier: Tier) {
  const configs = {
    FREE: { seats: 1, maxCapitalUsd: 10000, riskLimitPct: 0.5, backtestCredits: 10, aiAgentEnabled: false, edgeDiscoveryEnabled: false },
    PRO: { seats: 3, maxCapitalUsd: 100000, riskLimitPct: 1.5, backtestCredits: 100, aiAgentEnabled: true, edgeDiscoveryEnabled: true },
    ELITE: { seats: 10, maxCapitalUsd: 1000000, riskLimitPct: 2.0, backtestCredits: 1000, aiAgentEnabled: true, edgeDiscoveryEnabled: true },
    INSTITUTIONAL: { seats: 100, maxCapitalUsd: 100000000, riskLimitPct: 3.0, backtestCredits: 100000, aiAgentEnabled: true, edgeDiscoveryEnabled: true },
  };
  return configs[tier];
}
