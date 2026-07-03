// ============================================================================
// BekiBuffet SaaS — Stripe Billing Integration
// ============================================================================
// Real payment processing via Stripe Checkout Sessions + Webhooks.
// Handles subscription creation, upgrades, downgrades, cancellations,
// and failed payment events.
// ============================================================================

import Stripe from "stripe";
import { db } from "./db";
import { logger } from "./logger";
import { sendTemplatedEmail } from "./email";
import type { Tier } from "./saas";

let stripeInstance: Stripe | null = null;

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!stripeInstance) {
    stripeInstance = new Stripe(key, { apiVersion: "2024-06-20" as any });
  }
  return stripeInstance;
}

export function isStripeEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

// Price IDs per tier (set these in Stripe dashboard + env vars)
const PRICE_IDS: Record<Tier, string | undefined> = {
  FREE: undefined,
  PRO: process.env.STRIPE_PRICE_PRO,
  ELITE: process.env.STRIPE_PRICE_ELITE,
  INSTITUTIONAL: process.env.STRIPE_PRICE_INSTITUTIONAL,
};

const TIER_CONFIG: Record<Tier, { seats: number; capital: number; risk: number; credits: number }> = {
  FREE: { seats: 1, capital: 10000, risk: 0.5, credits: 10 },
  PRO: { seats: 3, capital: 100000, risk: 1.5, credits: 100 },
  ELITE: { seats: 10, capital: 1000000, risk: 2.0, credits: 1000 },
  INSTITUTIONAL: { seats: 100, capital: 100000000, risk: 3.0, credits: 100000 },
};

/**
 * Create a Stripe Checkout Session for upgrading to a tier.
 */
export async function createCheckoutSession(
  userId: string,
  userEmail: string,
  tier: Tier,
  successUrl: string,
  cancelUrl: string
): Promise<{ url: string | null; sessionId: string | null; error?: string }> {
  const stripe = getStripe();
  if (!stripe) {
    return { url: null, sessionId: null, error: "Stripe is not configured" };
  }

  const priceId = PRICE_IDS[tier];
  if (!priceId) {
    return { url: null, sessionId: null, error: `No Stripe price configured for ${tier} tier` };
  }

  try {
    // Check if user already has a Stripe customer ID
    const existingSub = await db.subscription.findUnique({ where: { userId } });
    let customerId = existingSub?.stripeCustomerId ?? undefined;

    // If no customer ID, create one
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { userId },
      });
      customerId = customer.id;
      // Save customer ID
      await db.subscription.update({
        where: { userId },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId, tier },
      subscription_data: {
        metadata: { userId, tier },
      },
    });

    logger.info("Stripe checkout session created", { userId, tier, sessionId: session.id });

    return { url: session.url, sessionId: session.id };
  } catch (e: any) {
    logger.error("Stripe checkout session failed", { userId, tier, error: e.message });
    return { url: null, sessionId: null, error: e.message };
  }
}

/**
 * Activate a subscription after successful payment.
 * Called by the Stripe webhook handler.
 */
export async function activateSubscription(
  userId: string,
  tier: Tier,
  stripeSubId: string,
  currentPeriodEnd: Date
): Promise<void> {
  const config = TIER_CONFIG[tier];

  await db.subscription.upsert({
    where: { userId },
    create: {
      userId,
      tier,
      status: "ACTIVE",
      stripeSubId,
      seats: config.seats,
      maxCapitalUsd: config.capital,
      riskLimitPct: config.risk,
      backtestCredits: config.credits,
      aiAgentEnabled: tier !== "FREE",
      edgeDiscoveryEnabled: tier !== "FREE",
      currentPeriodEnd,
    },
    update: {
      tier,
      status: "ACTIVE",
      stripeSubId,
      seats: config.seats,
      maxCapitalUsd: config.capital,
      riskLimitPct: config.risk,
      backtestCredits: config.credits,
      aiAgentEnabled: tier !== "FREE",
      edgeDiscoveryEnabled: tier !== "FREE",
      currentPeriodEnd,
    },
  });

  // Send confirmation email
  const user = await db.user.findUnique({ where: { id: userId } });
  if (user?.email) {
    await sendTemplatedEmail(user.email, "subscription_activated", {
      tier,
      seats: config.seats,
      maxCapital: config.capital,
      backtestCredits: config.credits,
      renewalDate: currentPeriodEnd.toLocaleDateString(),
    });
  }

  await db.activityLog.create({
    data: {
      userId,
      type: "SUBSCRIPTION",
      action: "ACTIVATED",
      detail: `Subscription activated: ${tier} (Stripe: ${stripeSubId})`,
    },
  });

  logger.info("Subscription activated", { userId, tier, stripeSubId });
}

/**
 * Cancel a subscription (at period end).
 */
export async function cancelSubscription(userId: string): Promise<{ ok: boolean; error?: string }> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe not configured" };

  const sub = await db.subscription.findUnique({ where: { userId } });
  if (!sub?.stripeSubId) return { ok: false, error: "No active Stripe subscription" };

  try {
    await stripe.subscriptions.cancel(sub.stripeSubId);

    await db.subscription.update({
      where: { userId },
      data: { status: "CANCELED" },
    });

    const user = await db.user.findUnique({ where: { id: userId } });
    if (user?.email && sub.currentPeriodEnd) {
      await sendTemplatedEmail(user.email, "subscription_canceled", {
        periodEnd: sub.currentPeriodEnd.toLocaleDateString(),
      });
    }

    await db.activityLog.create({
      data: {
        userId,
        type: "SUBSCRIPTION",
        action: "CANCELED",
        detail: `Subscription canceled (Stripe: ${sub.stripeSubId})`,
      },
    });

    logger.info("Subscription canceled", { userId, stripeSubId: sub.stripeSubId });
    return { ok: true };
  } catch (e: any) {
    logger.error("Cancel subscription failed", { userId, error: e.message });
    return { ok: false, error: e.message };
  }
}

/**
 * Handle Stripe webhook events.
 */
export async function handleStripeWebhook(event: Stripe.Event): Promise<void> {
  logger.info("Stripe webhook received", { type: event.type, id: event.id });

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const tier = session.metadata?.tier as Tier;
      if (userId && tier) {
        const periodEnd = session.expires_at ? new Date(session.expires_at * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await activateSubscription(userId, tier, session.id, periodEnd);
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata.userId;
      const tier = sub.metadata.tier as Tier;
      if (userId && tier) {
        const periodEnd = new Date((sub as any).current_period_end * 1000);
        await activateSubscription(userId, tier, sub.id, periodEnd);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata.userId;
      if (userId) {
        await db.subscription.update({
          where: { userId },
          data: { status: "CANCELED", tier: "FREE" },
        });
        await db.activityLog.create({
          data: {
            userId,
            type: "SUBSCRIPTION",
            action: "EXPIRED",
            detail: `Subscription expired (Stripe: ${sub.id})`,
          },
        });
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const sub = await db.subscription.findFirst({ where: { stripeCustomerId: customerId } });
      if (sub) {
        await db.subscription.update({
          where: { userId: sub.userId },
          data: { status: "PAST_DUE" },
        });
        await db.activityLog.create({
          data: {
            userId: sub.userId,
            type: "SUBSCRIPTION",
            action: "PAYMENT_FAILED",
            detail: `Payment failed for invoice ${invoice.id}`,
          },
        });
      }
      break;
    }

    default:
      logger.debug("Unhandled Stripe webhook event", { type: event.type });
  }
}

/**
 * Verify Stripe webhook signature.
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret?: string
): Stripe.Event | null {
  const stripe = getStripe();
  if (!stripe) return null;
  const webhookSecret = secret || process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return null;

  try {
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (e: any) {
    logger.error("Stripe webhook signature verification failed", { error: e.message });
    return null;
  }
}
