import { NextResponse } from "next/server";

// ============================================================================
// GET /api/auth/config
// Returns public auth configuration so the client knows which providers
// are available. This replaces the need for NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED
// — the Google button auto-shows when GOOGLE_CLIENT_ID/SECRET are set.
// ============================================================================

export async function GET() {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const googleEnabled = !!(googleClientId && googleClientSecret && googleClientId.length > 10 && googleClientSecret.length > 10);

  return NextResponse.json({
    googleEnabled,
    nextauthUrl: process.env.NEXTAUTH_URL || "",
    // Don't expose secrets — just whether they're configured
  });
}
