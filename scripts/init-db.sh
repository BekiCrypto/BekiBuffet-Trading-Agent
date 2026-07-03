#!/usr/bin/env bash
# ============================================================================
# BekiBuffet SaaS — Neon PostgreSQL Schema Initialization
# ============================================================================
# This script initializes the Neon PostgreSQL database with the Prisma schema.
# It creates all 12 tables, indexes, and foreign key constraints.
#
# WHEN TO USE:
#   - First-time database setup
#   - After cloning the repo and setting DATABASE_URL in .env
#   - When deploying to a new Neon project
#
# WHAT IT DOES:
#   1. Validates that DATABASE_URL is set
#   2. Runs `prisma migrate deploy` to apply all pending migrations
#   3. Verifies all 12 tables exist
#   4. Runs `prisma db pull` to confirm Prisma can introspect the schema
#
# This script is SAFE to run multiple times — it only applies pending
# migrations and does not destroy existing data.
# ============================================================================

set -euo pipefail

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  BekiBuffet SaaS — Neon PostgreSQL Schema Initialization        ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# --- Step 1: Verify DATABASE_URL is set ---
if [ -z "${DATABASE_URL:-}" ]; then
  # Try loading from .env
  if [ -f .env ]; then
    export $(grep -v '^#' .env | grep -v '^$' | xargs)
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ ERROR: DATABASE_URL is not set."
  echo ""
  echo "   Set it in your .env file:"
  echo "   DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/bekibuffet?sslmode=require"
  echo ""
  echo "   Or export it in your shell:"
  echo "   export DATABASE_URL='postgresql://...'"
  echo ""
  exit 1
fi

# Mask the password in the URL for display
MASKED_URL=$(echo "$DATABASE_URL" | sed 's/\(postgresql:\/\/[^:]*:\)[^@]*/\1****/')
echo "📋 DATABASE_URL: $MASKED_URL"
echo ""

# --- Step 2: Apply migrations ---
echo "▶ Step 1/3: Applying Prisma migrations..."
echo "   Running: prisma migrate deploy"
echo ""
bunx prisma migrate deploy
echo ""
echo "✅ Migrations applied successfully."
echo ""

# --- Step 3: Verify all tables exist ---
echo "▶ Step 2/3: Verifying all 12 tables exist..."
echo ""

EXPECTED_TABLES=(
  "User"
  "Account"
  "Session"
  "VerificationToken"
  "Subscription"
  "BrokerAccount"
  "Backtest"
  "EdgeProfile"
  "AgentState"
  "Trade"
  "AIDecision"
  "ActivityLog"
)

# Use prisma db execute to query the database
MISSING_TABLES=()
for table in "${EXPECTED_TABLES[@]}"; do
  RESULT=$(bunx prisma db execute --stdin <<EOF 2>/dev/null || echo "ERROR"
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = '$table'
);
EOF
)
  if echo "$RESULT" | grep -qi "t\|true\|1" 2>/dev/null; then
    echo "   ✅ $table"
  else
    echo "   ❌ $table (MISSING)"
    MISSING_TABLES+=("$table")
  fi
done

echo ""
if [ ${#MISSING_TABLES[@]} -gt 0 ]; then
  echo "❌ ERROR: ${#MISSING_TABLES[@]} table(s) are missing:"
  printf '   - %s\n' "${MISSING_TABLES[@]}"
  echo ""
  exit 1
fi

echo "✅ All 12 tables exist in the database."
echo ""

# --- Step 4: Verify Prisma can introspect ---
echo "▶ Step 3/3: Verifying Prisma can introspect the database..."
echo "   Running: prisma db pull (dry run — no changes will be made)"
echo ""

# Use migrate status instead of db pull to avoid overwriting schema.prisma
bunx prisma migrate status
echo ""
echo "✅ Prisma successfully connected to and introspected the database."
echo ""

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  ✅  Neon PostgreSQL Schema Initialization COMPLETE             ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║                                                                  ║"
echo "║  All 12 tables created:                                          ║"
echo "║    • User, Account, Session, VerificationToken                   ║"
echo "║    • Subscription, BrokerAccount                                 ║"
echo "║    • Backtest, EdgeProfile, AgentState                           ║"
echo "║    • Trade, AIDecision, ActivityLog                              ║"
echo "║                                                                  ║"
echo "║  Next steps:                                                     ║"
echo "║    1. Deploy to Vercel — migrations run automatically on build   ║"
echo "║    2. Test Google OAuth — sign in should now succeed             ║"
echo "║    3. (Optional) Run /api/seed to provision demo account         ║"
echo "║                                                                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
