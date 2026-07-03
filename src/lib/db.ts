import { PrismaClient } from '@prisma/client'

// ============================================================================
// Prisma Client — PostgreSQL (Neon)
// Single source of truth for all environments. No SQLite.
//
// IMPORTANT: Do NOT override datasources.db.url here. Prisma reads the
// connection string from schema.prisma's env("DATABASE_URL") lazily —
// only when the first query is executed at request time. This prevents
// PrismaClientConstructorValidationError during `next build` when
// DATABASE_URL is not yet available (build-time page data collection).
//
// For Neon serverless deployments:
// - Use the pooled connection string (ends with -pooler) from the Neon dashboard
// - Set DATABASE_URL in Vercel environment variables (Production + Preview)
// ============================================================================

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Instantiate PrismaClient without a datasource override.
// Prisma resolves DATABASE_URL from schema.prisma at query time, not at
// construction time — this is what makes the build safe when DATABASE_URL
// is absent during static page-data collection.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['query', 'error', 'warn'],
  })

// Prevent multiple PrismaClient instances during dev hot reload
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
