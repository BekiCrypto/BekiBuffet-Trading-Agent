import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createCryptoPayment, isCryptoPaymentEnabled, getTierPrice } from "@/lib/crypto-payments";
import { logger, sanitizeError } from "@/lib/logger";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { tierSchema } from "@/lib/validation";
import type { Tier } from "@/lib/saas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a crypto payment (USDT BEP-20) for subscription upgrade
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(session.user.id, "subscription");
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  if (!isCryptoPaymentEnabled()) {
    return NextResponse.json(
      { error: "Crypto payments are not configured. Set NOWPAYMENTS_API_KEY or CRYPTO_RECEIVING_WALLET." },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const tier = tierSchema.parse(body.tier);
    const billingCycle = body.billingCycle === "annual" ? "annual" : "monthly";

    if (tier === "FREE") {
      return NextResponse.json({ error: "Cannot checkout FREE tier" }, { status: 400 });
    }

    const result = await createCryptoPayment(
      session.user.id,
      session.user.email!,
      tier as Tier,
      billingCycle
    );

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    logger.info("Crypto checkout created", {
      userId: session.user.id,
      tier,
      paymentId: result.paymentId,
      amount: result.amountUsdt,
    });

    return NextResponse.json({
      ...result,
      message: `Send ${result.amountUsdt} USDT (BEP-20) to ${result.receivingAddress}`,
      instructions: [
        `1. Send exactly ${result.amountUsdt} USDT to the address above`,
        `2. Use BSC (Binance Smart Chain) network — BEP-20`,
        `3. Payment expires at ${result.expiresAt.toLocaleString()}`,
        `4. Subscription activates automatically after confirmation`,
      ],
    });
  } catch (e: any) {
    logger.error("Crypto checkout failed", { userId: session.user.id, error: e.message });
    const err = sanitizeError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
