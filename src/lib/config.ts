// ============================================================================
// BekiBuffet SaaS — Production Configuration Validation
// ============================================================================
// Validates all required environment variables and service configurations
// at application startup. In production, missing mandatory configuration
// causes the affected feature to fail with a clear error (not silently
// fall back to demo/simulator mode).
// ============================================================================

import { logger } from "./logger";

export interface ServiceStatus {
  name: string;
  configured: boolean;
  required: boolean;
  error?: string;
  details?: string;
}

export interface StartupValidation {
  environment: "production" | "development";
  services: ServiceStatus[];
  allRequiredMet: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Validate all environment variables and service configurations.
 * Called at startup and by the /api/health endpoint.
 */
export function validateProductionConfig(): StartupValidation {
  const isProd = process.env.NODE_ENV === "production";
  const services: ServiceStatus[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  // --- Database (always required) ---
  const dbUrl = process.env.DATABASE_URL;
  const dbConfigured = !!dbUrl && dbUrl.startsWith("postgresql://") && !dbUrl.includes("placeholder") && !dbUrl.includes("ep-xxx");
  services.push({
    name: "Database (Neon PostgreSQL)",
    configured: dbConfigured,
    required: true,
    error: dbConfigured ? undefined : "DATABASE_URL must be a valid PostgreSQL connection string",
    details: dbConfigured ? "Connected" : "Not configured",
  });
  if (!dbConfigured) errors.push("Database is not configured — application cannot function");

  // --- NextAuth (always required) ---
  const nextauthSecret = process.env.NEXTAUTH_SECRET;
  const nextauthUrl = process.env.NEXTAUTH_URL;
  const authConfigured = !!nextauthSecret && !!nextauthUrl;
  services.push({
    name: "NextAuth (Authentication)",
    configured: authConfigured,
    required: true,
    error: authConfigured ? undefined : "NEXTAUTH_SECRET and NEXTAUTH_URL are required",
  });
  if (!authConfigured) errors.push("Authentication is not configured");

  // --- Google OAuth (required in production) ---
  const googleId = process.env.GOOGLE_CLIENT_ID;
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
  const googleConfigured = !!(googleId && googleSecret && googleId.length > 10 && googleSecret.length > 10);
  services.push({
    name: "Google OAuth",
    configured: googleConfigured,
    required: isProd,
    error: isProd && !googleConfigured ? "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production" : undefined,
  });
  if (isProd && !googleConfigured) errors.push("Google OAuth is not configured — users cannot sign in");

  // --- Encryption Key (required in production) ---
  const encryptionKey = process.env.ENCRYPTION_KEY;
  const encryptionConfigured = !!encryptionKey && (encryptionKey.length === 64 || encryptionKey.length === 44);
  services.push({
    name: "Credential Encryption (AES-256)",
    configured: encryptionConfigured,
    required: isProd,
    error: isProd && !encryptionConfigured
      ? "ENCRYPTION_KEY is required in production (generate with: openssl rand -hex 32)"
      : undefined,
  });
  if (isProd && !encryptionConfigured) errors.push("Encryption key is not configured — broker credentials cannot be securely stored");

  // --- Crypto Payments (required in production for paid tiers) ---
  const nowpaymentsKey = process.env.NOWPAYMENTS_API_KEY;
  const cryptoWallet = process.env.CRYPTO_RECEIVING_WALLET;
  const cryptoConfigured = !!(nowpaymentsKey || cryptoWallet);
  services.push({
    name: "Crypto Payments (USDT BEP-20)",
    configured: cryptoConfigured,
    required: isProd,
    error: isProd && !cryptoConfigured
      ? "NOWPAYMENTS_API_KEY or CRYPTO_RECEIVING_WALLET is required for billing"
      : undefined,
  });
  if (isProd && !cryptoConfigured) {
    warnings.push("Crypto payments not configured — subscription upgrades will be blocked");
  }

  // --- Market Data (required in production) ---
  const twelvedataKey = process.env.TWELVEDATA_API_KEY;
  const marketDataConfigured = !!twelvedataKey && twelvedataKey.length > 10;
  services.push({
    name: "Market Data (TwelveData)",
    configured: marketDataConfigured,
    required: isProd,
    error: isProd && !marketDataConfigured ? "TWELVEDATA_API_KEY is required for live market data" : undefined,
  });
  if (isProd && !marketDataConfigured) {
    warnings.push("Market data API key is not configured — live trading terminal will be disabled");
  }

  // --- Email (recommended) ---
  const resendKey = process.env.RESEND_API_KEY;
  const emailConfigured = !!resendKey && resendKey.length > 10;
  services.push({
    name: "Email (Resend)",
    configured: emailConfigured,
    required: false,
    error: emailConfigured ? undefined : "RESEND_API_KEY not set — email notifications will be skipped",
  });
  if (!emailConfigured) warnings.push("Email service not configured — notifications will not be sent");

  // --- Cron Secret (required for scheduled jobs) ---
  const cronSecret = process.env.CRON_SECRET;
  const cronConfigured = !!cronSecret && cronSecret.length > 10;
  services.push({
    name: "Cron Authentication",
    configured: cronConfigured,
    required: isProd,
    error: isProd && !cronConfigured ? "CRON_SECRET is required to protect scheduled job endpoints" : undefined,
  });
  if (isProd && !cronConfigured) warnings.push("Cron secret not set — scheduled job endpoints are unprotected");

  const allRequiredMet = services.filter((s) => s.required).every((s) => s.configured);

  return {
    environment: isProd ? "production" : "development",
    services,
    allRequiredMet,
    warnings,
    errors,
  };
}

/**
 * Assert that a specific service is configured before proceeding.
 * Throws a clear error if the service is not available.
 */
export function requireService(serviceName: string): void {
  const config = validateProductionConfig();
  const service = config.services.find((s) => s.name.toLowerCase().includes(serviceName.toLowerCase()));
  if (service && !service.configured && service.required) {
    throw new Error(`Required service not configured: ${service.name}. ${service.error ?? ""}`);
  }
}

/**
 * Check if we're in production mode.
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Log startup validation results.
 */
export function logStartupValidation(): StartupValidation {
  const config = validateProductionConfig();
  logger.info("Startup configuration validation", {
    environment: config.environment,
    allRequiredMet: config.allRequiredMet,
    services: config.services.map((s) => ({ name: s.name, configured: s.configured, required: s.required })),
  });
  if (config.warnings.length > 0) {
    logger.warn("Startup warnings", { warnings: config.warnings });
  }
  if (config.errors.length > 0) {
    logger.error("Startup errors", { errors: config.errors });
  }
  return config;
}
