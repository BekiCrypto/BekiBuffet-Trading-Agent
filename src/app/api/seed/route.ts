import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

// Provision a demo user with Pro tier if none exists.
// Called automatically by the SaaS shell when no GOOGLE_CLIENT_ID is configured.
export async function POST() {
  try {
    const email = "demo@bekibuffet.ai";
    const password = "bekibuffet";
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({
        ok: true,
        exists: true,
        email,
        password,
        message: "Demo account already exists. Sign in with these credentials.",
      });
    }
    const hashed = await bcrypt.hash(password, 12);
    const user = await db.user.create({
      data: {
        email,
        name: "BekiBuffet Demo",
        password: hashed,
        role: "ADMIN",
      },
    });
    await db.subscription.create({
      data: {
        userId: user.id,
        tier: "ELITE",
        status: "ACTIVE",
        seats: 10,
        maxCapitalUsd: 1000000,
        riskLimitPct: 2.0,
        backtestCredits: 1000,
        aiAgentEnabled: true,
        edgeDiscoveryEnabled: true,
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });
    // Seed a demo broker account
    await db.brokerAccount.create({
      data: {
        userId: user.id,
        brokerType: "DEMO",
        accountName: "BekiBuffet Paper",
        accountId: "100000",
        balance: 100000,
        equity: 100000,
        isConnected: true,
        lastSyncAt: new Date(),
      },
    });
    await db.activityLog.create({
      data: {
        userId: user.id,
        type: "AUTH",
        action: "DEMO_PROVISIONED",
        detail: "Demo Elite account provisioned with paper broker",
      },
    });
    return NextResponse.json({
      ok: true,
      email,
      password,
      message: "Demo account created with Elite tier. Sign in with these credentials.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
