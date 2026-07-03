import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isRealMarketDataEnabled } from "@/lib/marketDataFeed";
import { isCryptoPaymentEnabled, getCryptoPaymentMode } from "@/lib/crypto-payments";
import { validateProductionConfig } from "@/lib/config";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Health check endpoint for uptime monitoring
export async function GET() {
  const config = validateProductionConfig();
  const checks: Record<string, { status: string; latency?: number }> = {};

  // Database connectivity check
  try {
    const start = Date.now();
    await db.$queryRaw`SELECT 1`;
    checks.database = { status: "ok", latency: Date.now() - start };
  } catch (e: any) {
    checks.database = { status: "error" };
    logger.error("Health check: database error", { error: e.message });
  }

  // Market data check
  checks.marketData = {
    status: isRealMarketDataEnabled() ? "live" : (config.environment === "production" ? "error" : "simulator"),
  };

  // Crypto payment check
  const cryptoMode = getCryptoPaymentMode();
  checks.cryptoPayments = {
    status: isCryptoPaymentEnabled() ? "ok" : (config.environment === "production" ? "error" : "not_configured"),
    latency: undefined,
  };
  (checks.cryptoPayments as any).mode = cryptoMode;

  // Google OAuth check
  checks.googleOAuth = {
    status: config.services.find((s) => s.name.includes("Google"))?.configured ? "ok" : "not_configured",
  };

  // Encryption check
  checks.encryption = {
    status: config.services.find((s) => s.name.includes("Encryption"))?.configured ? "ok" : "not_configured",
  };

  // Overall status
  const criticalOk = checks.database.status === "ok";
  const allRequiredMet = config.allRequiredMet;
  const status = criticalOk && allRequiredMet ? 200 : 503;
  const overall = criticalOk && allRequiredMet ? "healthy" : "degraded";

  return NextResponse.json(
    {
      status: overall,
      timestamp: new Date().toISOString(),
      environment: config.environment,
      version: process.env.npm_package_version || "1.0.0",
      allRequiredMet,
      checks,
      warnings: config.warnings,
      errors: config.errors,
    },
    { status }
  );
}
