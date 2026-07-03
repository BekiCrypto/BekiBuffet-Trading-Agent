// ============================================================================
// BekiBuffet SaaS — Application Startup Instrumentation
// ============================================================================
// Runs once when the application starts (server-side only).
// Validates all required environment variables and logs the result.
// In production, logs errors for any missing required configuration.
// ============================================================================

export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logStartupValidation } = await import("./src/lib/config");
    const config = logStartupValidation();

    if (config.environment === "production" && !config.allRequiredMet) {
      console.error("========================================");
      console.error("PRODUCTION STARTUP WARNING");
      console.error("========================================");
      console.error("Some required services are not configured:");
      config.errors.forEach((err) => console.error(`  ❌ ${err}`));
      console.error("");
      console.error("The application will start, but affected features will fail.");
      console.error("Set the missing environment variables in Vercel.");
      console.error("========================================");
    } else if (config.warnings.length > 0) {
      console.warn("Startup warnings:");
      config.warnings.forEach((w) => console.warn(`  ⚠️  ${w}`));
    } else {
      console.log("✅ All required services configured");
    }
  }
}
