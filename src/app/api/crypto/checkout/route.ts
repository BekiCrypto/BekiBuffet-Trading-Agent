import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createCryptoPayment, isCryptoPaymentEnabled, getReceivingWallet } from "@/lib/crypto-payments";
import { logger, sanitizeError } from "@/lib/logger";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { tierSchema } from "@/lib/validation";
import type { Tier } from "@/lib/saas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a self-custody crypto payment (USDT BEP-20)
// User sends USDT directly to our wallet — no third party involved
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(session.user.id, "subscription");
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  if (!isCryptoPaymentEnabled()) {
    return NextResponse.json(
      { error: "Crypto payments are not configured. Set CRYPTO_RECEIVING_WALLET environment variable." },
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

    logger.info("Self-custody crypto checkout created", {
      userId: session.user.id,
      tier,
      paymentId: result.paymentId,
      amount: result.amountUsdt,
      receivingAddress: result.receivingAddress,
    });

    return NextResponse.json({
      ...result,
      walletAddress: result.receivingAddress,
      message: `Send ${result.amountUsdt} USDT (BEP-20) to ${result.receivingAddress}`,
      instructions: [
        `1. Open your Web3 wallet (MetaMask, Trust Wallet, Binance, etc.)`,
        `2. Send exactly ${result.amountUsdt} USDT to: ${result.receivingAddress}`,
        `3. IMPORTANT: Use BSC (Binance Smart Chain) network — BEP-20`,
        `4. After sending, submit the transaction hash to verify your payment`,
        `5. Subscription activates automatically after ${12} block confirmations (~1 minute)`,
        `6. Payment expires at ${result.expiresAt.toLocaleString()}`,
      ],
      network: "BSC (Binance Smart Chain)",
      token: "USDT BEP-20",
      contractAddress: "0x55d398326f99059fF775485246999027B3197955",
      verificationEndpoint: "/api/crypto/verify",
    });
  } catch (e: any) {
    logger.error("Crypto checkout failed", { userId: session.user.id, error: e.message });
    const err = sanitizeError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
