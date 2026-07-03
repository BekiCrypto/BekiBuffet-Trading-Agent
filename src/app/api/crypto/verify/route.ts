import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyDirectPayment, getCryptoPaymentMode } from "@/lib/crypto-payments";
import { logger, sanitizeError } from "@/lib/logger";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verify a direct blockchain payment (user submits tx hash for verification)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(session.user.id, "default");
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const mode = getCryptoPaymentMode();
  if (mode !== "direct") {
    return NextResponse.json(
      { error: "Direct verification not active. Using NOWPayments gateway." },
      { status: 400 }
    );
  }

  try {
    const body = await req.json();
    const { paymentId, txHash } = body;

    if (!paymentId) {
      return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });
    }

    const result = await verifyDirectPayment(paymentId, txHash);

    logger.info("Payment verification checked", {
      userId: session.user.id,
      paymentId,
      confirmed: result.confirmed,
      confirmations: result.confirmations,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("Payment verification failed", { error: e.message });
    const err = sanitizeError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
