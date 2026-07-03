// ============================================================================
// BekiBuffet SaaS — Super Admin Access
// ============================================================================
// Hardcoded super-admin email with full access to every subscription tier,
// every module, every feature, and all admin operations.
//
// The super admin bypasses all payment/tier/feature gates automatically.
// ============================================================================

// The super admin email — has unrestricted access to everything
export const SUPER_ADMIN_EMAIL = "bikilad@gmail.com";

/**
 * Check if an email is the super admin.
 */
export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}

/**
 * Super admin subscription config — INSTITUTIONAL tier with everything unlocked.
 * This is returned for the super admin regardless of what's in the database.
 */
export const SUPER_ADMIN_SUBSCRIPTION = {
  tier: "INSTITUTIONAL" as const,
  status: "ACTIVE" as const,
  seats: 999,
  maxCapitalUsd: 1000000000,
  riskLimitPct: 5.0,
  backtestCredits: 999999,
  aiAgentEnabled: true,
  edgeDiscoveryEnabled: true,
};

/**
 * Check if a session user is the super admin.
 */
export function isSuperAdmin(user?: { email?: string | null; role?: string | null } | null): boolean {
  if (!user) return false;
  return isSuperAdminEmail(user.email) || user.role === "ADMIN";
}

/**
 * Get the effective subscription for a user.
 * Super admin always gets INSTITUTIONAL with unlimited everything.
 */
export function getEffectiveSubscription(
  user: { email?: string | null; role?: string | null } | null,
  dbSubscription: any
): any {
  if (isSuperAdmin(user)) {
    return {
      ...dbSubscription,
      ...SUPER_ADMIN_SUBSCRIPTION,
      // Keep existing userId, id, timestamps from DB record if present
      userId: dbSubscription?.userId,
      id: dbSubscription?.id,
      createdAt: dbSubscription?.createdAt,
      updatedAt: dbSubscription?.updatedAt,
    };
  }
  return dbSubscription;
}

/**
 * Check if a user has access to a feature.
 * Super admin always has access.
 */
export function hasFeatureAccess(
  user: { email?: string | null; role?: string | null } | null,
  feature: "aiAgent" | "edgeDiscovery" | "liveTrading" | "admin" | "institutions"
): boolean {
  if (isSuperAdmin(user)) return true;
  // For non-super-admins, check the session flags (set by JWT callback)
  // This is a fallback — actual gating happens in API routes
  switch (feature) {
    case "admin":
      return user?.role === "ADMIN";
    default:
      return false;
  }
}
