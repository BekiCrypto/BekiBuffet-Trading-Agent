import { NextRequest, NextResponse } from "next/server";
import { handleNowPaymentsWebhook, verifyNowPaymentsSignature, getCryptoPaymentMode } from "@/lib/crypto-payments";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// NOWPayments IPN webhook handler
export async function POST(req: NextRequest) {
  const mode = getCryptoPaymentMode();

  if (mode !== "nowpayments") {
    return NextResponse.json({ error: "Webhook not active (not using NOWPayments)" }, { status: 503 });
  }

  try {
    const payload = await req.text();
    const signature = req.headers.get("x-nowpayments-sig") || "";

    // Verify signature
    if (!verifyNowPaymentsSignature(payload, signature)) {
      logger.warn("NOWPayments webhook signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const data = JSON.parse(payload);
    await handleNowPaymentsWebhook(data);

    return NextResponse.json({ received: true });
  } catch (e: any) {
    logger.error("Crypto webhook failed", { error: e.message });
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
