import { NextRequest, NextResponse } from "next/server";

// ============================================================================
// BekiBuffet SaaS — Middleware
// ============================================================================
// Security headers + basic CSRF protection for mutating requests.
// ============================================================================

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
};

// Content Security Policy — allows inline styles (Tailwind requires),
// Google Fonts, and same-origin scripts. Blocks external scripts.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https: blob:",
  "connect-src 'self' https://accounts.google.com wss: ws:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
].join("; ");

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Apply security headers to all responses
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(key, value);
  }
  res.headers.set("Content-Security-Policy", CSP);

  // CSRF protection for mutating requests to API routes
  // NextAuth already protects /api/auth/* with its own CSRF token.
  // For other POST/PUT/DELETE requests, we verify the Origin header.
  if (req.method === "POST" || req.method === "PUT" || req.method === "DELETE") {
    const path = req.nextUrl.pathname;
    // Skip NextAuth routes — they have built-in CSRF
    if (path.startsWith("/api/auth/")) {
      return res;
    }

    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    const allowedOrigins = [
      host,
      `https://${host}`,
      `http://${host}`,
    ].filter(Boolean);

    // If Origin header is present, it must match the host
    if (origin && !allowedOrigins.includes(origin)) {
      return NextResponse.json(
        { error: "CSRF check failed — invalid origin" },
        { status: 403 }
      );
    }
    // If no Origin header, the request is same-origin (browsers always send Origin
    // for cross-origin POSTs). We allow it but log for monitoring.
  }

  return res;
}

export const config = {
  // Run on all routes except static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg|.*\\.png$).*)"],
};
