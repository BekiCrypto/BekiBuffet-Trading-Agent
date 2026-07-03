import { PrismaClient } from '@prisma/client'

// ============================================================================
// Prisma Client — PostgreSQL (Neon)
// Single source of truth for all environments. No SQLite.
//
// For Neon serverless deployments:
// - Use the pooled connection string (ends with -pooler) from the Neon dashboard
// - The pooler handles connection multiplexing for serverless environments
// - Connection limit is kept low to avoid exhausting Neon's connection pool
// ============================================================================

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// In production (Vercel/Neon), use a low connection limit to avoid
// exhausting the Neon connection pool. In development, use defaults.
const isProduction = process.env.NODE_ENV === 'production'

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ['error', 'warn'] : ['query', 'error', 'warn'],
    ...(isProduction
      ? {
          datasources: {
            db: {
              url: process.env.DATABASE_URL,
            },
          },
        }
      : {}),
  })

// Prevent multiple Prisma Client instances in development (hot reload)
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
