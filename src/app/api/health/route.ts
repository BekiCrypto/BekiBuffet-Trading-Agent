import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isRealMarketDataEnabled } from "@/lib/marketDataFeed";
import { isStripeEnabled } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Health check endpoint for uptime monitoring
export async function GET() {
  const checks: Record<string, { status: string; latency?: number }> = {};

  // Database check
  try {
    const start = Date.now();
    await db.$queryRaw`SELECT 1`;
    checks.database = { status: "ok", latency: Date.now() - start };
  } catch (e: any) {
    checks.database = { status: "error" };
  }

  // Market data check
  checks.marketData = {
    status: isRealMarketDataEnabled() ? "live" : "simulator",
  };

  // Stripe check
  checks.stripe = {
    status: isStripeEnabled() ? "ok" : "not_configured",
  };

  // Overall status
  const allOk = checks.database.status === "ok";
  const status = allOk ? 200 : 503;

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
      checks,
    },
    { status }
  );
}
