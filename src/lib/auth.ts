// ============================================================================
// BekiBuffet SaaS — NextAuth Configuration
// Google OAuth + credentials (demo) login. Persists via Prisma adapter.
// ============================================================================

import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

// Auto-provision a default subscription for new users
async function provisionDefaultSubscription(userId: string) {
  const existing = await db.subscription.findUnique({ where: { userId } });
  if (existing) return;
  await db.subscription.create({
    data: {
      userId,
      tier: "FREE",
      status: "TRIALING",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day Pro trial
      seats: 1,
      maxCapitalUsd: 25000,
      riskLimitPct: 1.0,
      backtestCredits: 50,
      aiAgentEnabled: true, // trial gives full features
      edgeDiscoveryEnabled: true,
    },
  });
  await db.activityLog.create({
    data: {
      userId,
      type: "SUBSCRIPTION",
      action: "TRIAL_STARTED",
      detail: "14-day Pro trial activated",
    },
  });
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  providers: [
    // Only register Google provider if credentials are configured
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
            // Request profile + email scopes for name and avatar
            authorization: {
              params: {
                prompt: "select_account",
                access_type: "offline",
                response_type: "code",
              },
            },
          }),
        ]
      : []),
    CredentialsProvider({
      name: "Demo Account",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });
        if (!user || !user.password) return null;
        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // For OAuth providers (Google), the Prisma adapter has already created
      // the User + Account records by this point. user.id is the DB user id.
      // For credentials, user.id comes from the authorize() return.
      if (user?.email) {
        // Resolve the actual DB user by email to ensure we have the correct id
        const dbUser = await db.user.findUnique({ where: { email: user.email.toLowerCase() } });
        if (dbUser) {
          await provisionDefaultSubscription(dbUser.id);
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        // For OAuth sign-ins, resolve the DB user by email to get the correct id
        // (the Prisma adapter sets user.id to the DB id, but we double-check)
        if (user.email) {
          const dbUser = await db.user.findUnique({
            where: { email: user.email.toLowerCase() },
            select: { id: true },
          });
          if (dbUser) {
            token.id = dbUser.id;
          } else {
            token.id = user.id;
          }
        } else {
          token.id = user.id;
        }
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      // Attach subscription tier to token for client-side gating
      if (token.id) {
        const sub = await db.subscription.findUnique({
          where: { userId: token.id as string },
          select: {
            tier: true,
            status: true,
            aiAgentEnabled: true,
            edgeDiscoveryEnabled: true,
            backtestCredits: true,
            maxCapitalUsd: true,
            riskLimitPct: true,
            seats: true,
          },
        });
        if (sub) {
          token.tier = sub.tier;
          token.subStatus = sub.status;
          token.aiAgentEnabled = sub.aiAgentEnabled;
          token.edgeDiscoveryEnabled = sub.edgeDiscoveryEnabled;
          token.backtestCredits = sub.backtestCredits;
          token.maxCapitalUsd = sub.maxCapitalUsd;
          token.riskLimitPct = sub.riskLimitPct;
          token.seats = sub.seats;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).tier = token.tier ?? "FREE";
        (session.user as any).subStatus = token.subStatus ?? "TRIALING";
        (session.user as any).aiAgentEnabled = token.aiAgentEnabled ?? false;
        (session.user as any).edgeDiscoveryEnabled = token.edgeDiscoveryEnabled ?? false;
        (session.user as any).backtestCredits = token.backtestCredits ?? 0;
        (session.user as any).maxCapitalUsd = token.maxCapitalUsd ?? 25000;
        (session.user as any).riskLimitPct = token.riskLimitPct ?? 1.0;
        (session.user as any).seats = token.seats ?? 1;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
};
