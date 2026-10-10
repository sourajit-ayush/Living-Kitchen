/**
 * Sliding-window rate limiter, in memory (per server instance). The routes count requests in
 * Supabase (limitRequest.ts) so limits hold across serverless instances; this is the fallback.
 */
export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();

  return function check(key: string, now = Date.now()): RateLimitResult {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return {
        ok: false,
        remaining: 0,
        retryAfterSec: Math.ceil((recent[0] + windowMs - now) / 1000),
      };
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    }
    return { ok: true, remaining: limit - recent.length, retryAfterSec: 0 };
  };
}

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local"
  );
}
