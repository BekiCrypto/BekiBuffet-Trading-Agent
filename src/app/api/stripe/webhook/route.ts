import { NextRequest, NextResponse } from "next/server";
import { handleStripeWebhook, verifyWebhookSignature, isStripeEnabled } from "@/lib/stripe";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const payload = await req.text();

  const event = verifyWebhookSignature(payload, signature);
  if (!event) {
    logger.warn("Stripe webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await handleStripeWebhook(event);
    return NextResponse.json({ received: true });
  } catch (e: any) {
    logger.error("Stripe webhook handler failed", { type: event.type, error: e.message });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
