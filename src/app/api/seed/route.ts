import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Provision a demo user with Elite tier if none exists.
// SECURITY: Only allowed in non-production environments OR when a valid SETUP_TOKEN
// is provided via the X-Setup-Token header. This prevents unauthorized admin provisioning.
export async function POST(req: Request) {
  try {
    // Allow in development, or with a setup token in production
    const isDev = process.env.NODE_ENV !== "production";
    const setupToken = process.env.SETUP_TOKEN;
    const providedToken = req.headers.get("x-setup-token");

    if (!isDev) {
      if (!setupToken) {
        return NextResponse.json(
          { error: "Demo provisioning disabled in production. Set SETUP_TOKEN env var to enable." },
          { status: 403 }
        );
      }
      if (providedToken !== setupToken) {
        return NextResponse.json(
          { error: "Invalid setup token." },
          { status: 403 }
        );
      }
    }

    const email = "demo@bekibuffet.ai";
    const password = process.env.DEMO_PASSWORD || "bekibuffet";
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
        role: "USER", // not ADMIN — demo users are regular users with Elite tier
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
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
