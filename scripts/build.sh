#!/usr/bin/env bash
# ============================================================================
# BekiBuffet SaaS — Build Script
# ============================================================================
# Runs Prisma generate, applies migrations (if DATABASE_URL is available),
# and builds the Next.js production bundle.
#
# Migration behavior:
#   - If DATABASE_URL is set and reachable → prisma migrate deploy runs
#   - If DATABASE_URL is not set or unreachable → migrations are skipped
#     (this allows local builds without a database connection; the build
#     will still succeed for testing the Next.js compilation)
#
# On Vercel, DATABASE_URL is always set, so migrations always run.
# ============================================================================

set -euo pipefail

echo "▶ Step 1/3: Generating Prisma Client..."
bunx prisma generate
echo "✅ Prisma Client generated."
echo ""

# Only run migrations if DATABASE_URL looks like a real connection string
# (not the placeholder). This allows local builds to succeed without a DB.
if [ -n "${DATABASE_URL:-}" ] && \
   [[ "${DATABASE_URL}" != *"placeholder"* ]] && \
   [[ "${DATABASE_URL}" != *"ep-xxx"* ]] && \
   [[ "${DATABASE_URL}" == postgresql://* ]]; then
  echo "▶ Step 2/3: Applying Prisma migrations..."
  bunx prisma migrate deploy
  echo "✅ Migrations applied."
  echo ""
else
  echo "▶ Step 2/3: Skipping migrations (DATABASE_URL not configured or is placeholder)"
  echo "   On Vercel, migrations run automatically when DATABASE_URL is set."
  echo ""
fi

echo "▶ Step 3/3: Building Next.js production bundle..."
bunx next build
echo "✅ Next.js build complete."
echo ""

# Copy static files to standalone output (for Vercel/Docker deployment)
if [ -d ".next/standalone" ]; then
  echo "▶ Copying static assets to standalone output..."
  cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
  cp -r public .next/standalone/ 2>/dev/null || true
  echo "✅ Static assets copied."
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  ✅  Build Complete                                              ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
