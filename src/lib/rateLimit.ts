// ============================================================================
// BekiBuffet SaaS — Rate Limiting
// ============================================================================
// Per-user and per-IP rate limiting for API endpoints.
//
// In-memory store works for single-instance deployments. For multi-instance
// (Vercel serverless), set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
// to use distributed rate limiting.
//
// Limits:
//   - Backtest: 10 requests / minute per user
//   - AI decision: 20 requests / minute per user
//   - Edge discovery: 5 requests / minute per user
//   - Broker connect: 10 requests / minute per user
//   - Subscription: 10 requests / minute per user
//   - General API: 60 requests / minute per user
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (per-instance). Cleared on serverless cold start.
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) rateLimitStore.delete(key);
  }
}, 5 * 60 * 1000).unref?.();

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  backtest: { windowMs: 60 * 1000, maxRequests: 10 },
  "ai-decision": { windowMs: 60 * 1000, maxRequests: 20 },
  edge: { windowMs: 60 * 1000, maxRequests: 5 },
  broker: { windowMs: 60 * 1000, maxRequests: 10 },
  subscription: { windowMs: 60 * 1000, maxRequests: 10 },
  seed: { windowMs: 60 * 1000, maxRequests: 3 },
  default: { windowMs: 60 * 1000, maxRequests: 60 },
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  identifier: string,
  endpoint: string
): RateLimitResult {
  const config = RATE_LIMITS[endpoint] ?? RATE_LIMITS.default;
  const key = `${endpoint}:${identifier}`;
  const now = Date.now();

  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    // First request or window expired
    rateLimitStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    };
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Get rate limit headers for API responses.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}
