// ============================================================================
// BekiBuffet SaaS — Server Actions for auth + subscription + broker + agent
// All 'use server' functions accessible from the client.
// ============================================================================

"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { db } from "./db";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { BrokerType, Tier } from "./saas";

// --- Auth helpers --------------------------------------------------------

export async function getSession() {
  return getServerSession(authOptions);
}

export async function requireUser() {
  const session = await getSession();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return session;
}

// --- Demo sign-up / sign-in (used when Google OAuth creds not configured) -

export async function signUpDemo(email: string, name: string, password: string) {
  const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return { ok: false, error: "Email already registered. Sign in instead." };
  }
  const hashed = await bcrypt.hash(password, 12);
  const user = await db.user.create({
    data: {
      email: email.toLowerCase(),
      name,
      password: hashed,
    },
  });
  // provisionDefaultSubscription is called by signIn callback, but for
  // credentials login we trigger it here as well
  const existingSub = await db.subscription.findUnique({ where: { userId: user.id } });
  if (!existingSub) {
    await db.subscription.create({
      data: {
        userId: user.id,
        tier: "PRO",
        status: "TRIALING",
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        seats: 3,
        maxCapitalUsd: 100000,
        riskLimitPct: 1.5,
        backtestCredits: 100,
        aiAgentEnabled: true,
        edgeDiscoveryEnabled: true,
      },
    });
  }
  await db.activityLog.create({
    data: {
      userId: user.id,
      type: "AUTH",
      action: "SIGN_UP_DEMO",
      detail: `Demo account created: ${email}`,
    },
  });
  return { ok: true, userId: user.id };
}

// --- Subscription --------------------------------------------------------

export async function upgradeSubscription(tier: Tier) {
  const session = await requireUser();
  const sub = await db.subscription.findUnique({ where: { userId: session.user.id } });
  if (!sub) throw new Error("No subscription found");
  const newCredits =
    tier === "PRO" ? 100 : tier === "ELITE" ? 1000 : tier === "INSTITUTIONAL" ? 100000 : 10;
  const newSeats =
    tier === "PRO" ? 3 : tier === "ELITE" ? 10 : tier === "INSTITUTIONAL" ? 100 : 1;
  const newCapital =
    tier === "PRO"
      ? 100000
      : tier === "ELITE"
      ? 1000000
      : tier === "INSTITUTIONAL"
      ? 100000000
      : 10000;
  const newRisk =
    tier === "PRO" ? 1.5 : tier === "ELITE" ? 2.0 : tier === "INSTITUTIONAL" ? 3.0 : 0.5;
  await db.subscription.update({
    where: { userId: session.user.id },
    data: {
      tier,
      status: "ACTIVE",
      seats: newSeats,
      maxCapitalUsd: newCapital,
      riskLimitPct: newRisk,
      backtestCredits: newCredits,
      aiAgentEnabled: tier !== "FREE",
      edgeDiscoveryEnabled: tier !== "FREE",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  await db.activityLog.create({
    data: {
      userId: session.user.id,
      type: "SUBSCRIPTION",
      action: "UPGRADED",
      detail: `Upgraded to ${tier}`,
    },
  });
  revalidatePath("/");
  return { ok: true };
}

export async function cancelSubscription() {
  const session = await requireUser();
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
  revalidatePath("/");
  return { ok: true };
}

// --- Brokers -------------------------------------------------------------

export async function connectBroker(formData: {
  brokerType: BrokerType;
  accountName: string;
  accountId: string;
  apiKey?: string;
  apiSecret?: string;
  server?: string;
  initialCapital?: number;
}) {
  const session = await requireUser();
  // Count existing brokers vs seats allowed
  const sub = await db.subscription.findUnique({ where: { userId: session.user.id } });
  if (!sub) throw new Error("No subscription");
  const count = await db.brokerAccount.count({ where: { userId: session.user.id } });
  if (count >= sub.seats) {
    return { ok: false, error: `Tier ${sub.tier} allows ${sub.seats} broker connections. Upgrade for more.` };
  }
  const broker = await db.brokerAccount.create({
    data: {
      userId: session.user.id,
      brokerType: formData.brokerType,
      accountName: formData.accountName,
      accountId: formData.accountId,
      apiKey: formData.apiKey ?? null,
      apiSecret: formData.apiSecret ?? null,
      server: formData.server ?? null,
      balance: formData.initialCapital ?? 100000,
      equity: formData.initialCapital ?? 100000,
      isConnected: true,
      lastSyncAt: new Date(),
    },
  });
  await db.activityLog.create({
    data: {
      userId: session.user.id,
      type: "BROKER",
      action: "CONNECTED",
      detail: `Connected ${formData.brokerType} account ${formData.accountName}`,
    },
  });
  revalidatePath("/");
  return { ok: true, brokerId: broker.id };
}

export async function disconnectBroker(brokerId: string) {
  const session = await requireUser();
  await db.brokerAccount.deleteMany({
    where: { id: brokerId, userId: session.user.id },
  });
  await db.activityLog.create({
    data: {
      userId: session.user.id,
      type: "BROKER",
      action: "DISCONNECTED",
      detail: `Disconnected broker ${brokerId}`,
    },
  });
  revalidatePath("/");
  return { ok: true };
}

// --- Agent state persistence --------------------------------------------

export async function getAgentState(brokerId: string | null) {
  const session = await requireUser();
  return db.agentState.findUnique({
    where: { userId_brokerAccountId: { userId: session.user.id, brokerAccountId: brokerId ?? "PAPER" } },
  });
}

export async function upsertAgentState(state: {
  brokerAccountId: string | null;
  mode: string;
  equity: number;
  balance: number;
  floatingPnl: number;
  dayStartEquity: number;
  consecutiveLosses: number;
  ticksProcessed: number;
  decisionsTaken: number;
  decisionsRejected: number;
  decisionsWaiting: number;
  campaignsActive: number;
  selfLearningJson: string;
  activeAssets: string;
}) {
  const session = await requireUser();
  const userId = session.user.id;
  const { brokerAccountId, ...rest } = state;
  const effectiveBrokerId = brokerAccountId ?? "PAPER";
  await db.agentState.upsert({
    where: {
      userId_brokerAccountId: {
        userId,
        brokerAccountId: effectiveBrokerId,
      },
    },
    create: {
      userId,
      brokerAccountId: effectiveBrokerId,
      ...rest,
    },
    update: rest,
  });
  return { ok: true };
}

// --- Activity log fetch -------------------------------------------------

export async function getActivityLog(limit = 50) {
  const session = await requireUser();
  return db.activityLog.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// --- Backtest runner (delegates to backtest engine) --------------------

export async function startBacktest(params: {
  name: string;
  asset: string;
  strategy: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  parameters: Record<string, any>;
}) {
  const session = await requireUser();
  // Check credits
  const sub = await db.subscription.findUnique({ where: { userId: session.user.id } });
  if (!sub || sub.backtestCredits <= 0) {
    return { ok: false, error: "No backtest credits remaining. Upgrade your plan." };
  }
  const bt = await db.backtest.create({
    data: {
      userId: session.user.id,
      name: params.name,
      asset: params.asset,
      strategy: params.strategy,
      timeframe: params.timeframe,
      startDate: new Date(params.startDate),
      endDate: new Date(params.endDate),
      initialCapital: params.initialCapital,
      parameters: JSON.stringify(params.parameters),
      status: "RUNNING",
    },
  });
  // Decrement credits
  await db.subscription.update({
    where: { userId: session.user.id },
    data: { backtestCredits: { decrement: 1 } },
  });
  await db.activityLog.create({
    data: {
      userId: session.user.id,
      type: "BACKTEST",
      action: "STARTED",
      detail: `Backtest ${params.name} on ${params.asset} ${params.strategy}`,
    },
  });
  revalidatePath("/");
  return { ok: true, backtestId: bt.id };
}

// --- Edge discovery -----------------------------------------------------

export async function startEdgeDiscovery(asset: string) {
  const session = await requireUser();
  const sub = await db.subscription.findUnique({ where: { userId: session.user.id } });
  if (!sub?.edgeDiscoveryEnabled) {
    return { ok: false, error: "Edge discovery requires Pro or higher." };
  }
  await db.activityLog.create({
    data: {
      userId: session.user.id,
      type: "EDGE",
      action: "DISCOVERY_STARTED",
      detail: `Edge discovery on ${asset}`,
    },
  });
  revalidatePath("/");
  return { ok: true };
}
