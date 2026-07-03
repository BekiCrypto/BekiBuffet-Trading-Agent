// ============================================================================
// NextAuth Type Augmentation
// Extends the default session/user types to include our custom fields
// (id, tier, subStatus, aiAgentEnabled, etc.) added via JWT callbacks.
// ============================================================================

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      // SaaS subscription fields (attached via JWT callback)
      tier?: string;
      subStatus?: string;
      aiAgentEnabled?: boolean;
      edgeDiscoveryEnabled?: boolean;
      backtestCredits?: number;
      maxCapitalUsd?: number;
      riskLimitPct?: number;
      seats?: number;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    password?: string | null;
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    email?: string;
    name?: string | null;
    picture?: string | null;
    tier?: string;
    subStatus?: string;
    aiAgentEnabled?: boolean;
    edgeDiscoveryEnabled?: boolean;
    backtestCredits?: number;
    maxCapitalUsd?: number;
    riskLimitPct?: number;
    seats?: number;
  }
}
