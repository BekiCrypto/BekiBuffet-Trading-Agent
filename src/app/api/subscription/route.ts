import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isStripeEnabled, createCheckoutSession } from "@/lib/stripe";
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

    const isAdmin = (session.user as any).role === "ADMIN";
    const isDev = process.env.NODE_ENV !== "production";

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

    // Development mode: allow free upgrade (no Stripe needed)
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

    // Production: require Stripe Checkout
    if (!isStripeEnabled()) {
      return NextResponse.json(
        { error: "Payment processing is not configured. Set STRIPE_SECRET_KEY." },
        { status: 503 }
      );
    }

    // Downgrade to FREE = cancel subscription
    if (tierId === "FREE") {
      const { cancelSubscription } = await import("@/lib/stripe");
      const result = await cancelSubscription(session.user.id);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    // Upgrade: create Stripe Checkout Session
    const origin = req.headers.get("origin") || "http://localhost:3000";
    const checkoutResult = await createCheckoutSession(
      session.user.id,
      session.user.email!,
      tierId,
      `${origin}/?upgrade=success`,
      `${origin}/?upgrade=canceled`
    );

    if (checkoutResult.error || !checkoutResult.url) {
      return NextResponse.json(
        { error: checkoutResult.error || "Failed to create checkout session" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      checkoutUrl: checkoutResult.url,
      message: "Redirecting to Stripe Checkout...",
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
