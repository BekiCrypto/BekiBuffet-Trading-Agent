import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createCheckoutSession, isStripeEnabled } from "@/lib/stripe";
import { logger, sanitizeError } from "@/lib/logger";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { tierSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit
  const rl = checkRateLimit(session.user.id, "subscription");
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  if (!isStripeEnabled()) {
    return NextResponse.json(
      { error: "Payment processing is not configured. Set STRIPE_SECRET_KEY." },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const tier = tierSchema.parse(body.tier);

    if (tier === "FREE") {
      return NextResponse.json({ error: "Cannot checkout FREE tier" }, { status: 400 });
    }

    const origin = req.headers.get("origin") || "http://localhost:3000";
    const result = await createCheckoutSession(
      session.user.id,
      session.user.email!,
      tier,
      `${origin}/?upgrade=success`,
      `${origin}/?upgrade=canceled`
    );

    if (result.error || !result.url) {
      return NextResponse.json({ error: result.error || "Failed to create checkout session" }, { status: 400 });
    }

    logger.info("Checkout session created", { userId: session.user.id, tier, sessionId: result.sessionId });

    return NextResponse.json({ url: result.url, sessionId: result.sessionId });
  } catch (e: any) {
    logger.error("Checkout failed", { userId: session.user.id, error: e.message });
    const err = sanitizeError(e);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
