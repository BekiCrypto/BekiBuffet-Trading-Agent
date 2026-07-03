import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Tier } from "@/lib/saas";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sub = await db.subscription.findUnique({ where: { userId: session.user.id } });
  return NextResponse.json({ subscription: sub });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { tier } = await req.json();
    const tierId = tier as Tier;

    const credits = tierId === "PRO" ? 100 : tierId === "ELITE" ? 1000 : tierId === "INSTITUTIONAL" ? 100000 : 10;
    const seats = tierId === "PRO" ? 3 : tierId === "ELITE" ? 10 : tierId === "INSTITUTIONAL" ? 100 : 1;
    const capital = tierId === "PRO" ? 100000 : tierId === "ELITE" ? 1000000 : tierId === "INSTITUTIONAL" ? 100000000 : 10000;
    const risk = tierId === "PRO" ? 1.5 : tierId === "ELITE" ? 2.0 : tierId === "INSTITUTIONAL" ? 3.0 : 0.5;

    const sub = await db.subscription.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        tier: tierId,
        status: "ACTIVE",
        seats,
        maxCapitalUsd: capital,
        riskLimitPct: risk,
        backtestCredits: credits,
        aiAgentEnabled: tierId !== "FREE",
        edgeDiscoveryEnabled: tierId !== "FREE",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      update: {
        tier: tierId,
        status: "ACTIVE",
        seats,
        maxCapitalUsd: capital,
        riskLimitPct: risk,
        backtestCredits: credits,
        aiAgentEnabled: tierId !== "FREE",
        edgeDiscoveryEnabled: tierId !== "FREE",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await db.activityLog.create({
      data: {
        userId: session.user.id,
        type: "SUBSCRIPTION",
        action: "UPGRADED",
        detail: `Upgraded to ${tierId}`,
      },
    });

    return NextResponse.json({ ok: true, subscription: sub });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
