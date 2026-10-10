import type { RateLimitResult } from "./ratelimit";

/**
 * Hourly request limits per caller (docs/01 §7: 20 generations per hour per guest IP, 60 per user).
 * Signed-in users get more because they are accountable; the other routes follow the same idea.
 */
export const LIMITS = {
  generate: { guest: 20, user: 60 },
  /** Fridge scans are the priciest call (vision). */
  scan: { guest: 15, user: 45 },
  surprise: { guest: 30, user: 90 },
  /** Each share stores a page and a picture. */
  share: { guest: 30, user: 60 },
} as const;
export type LimitKind = keyof typeof LIMITS;
export const LIMIT_WINDOW_SECONDS = 60 * 60;

/** Who is asking: a signed-in user (verified token) or a guest, by a keyed hash of their IP. */
export type Caller = { type: "user"; id: string } | { type: "guest"; ipHash: string };

export function limitFor(kind: LimitKind, caller: Caller): number {
  return LIMITS[kind][caller.type];
}

export function limitKey(kind: LimitKind, caller: Caller): string {
  return caller.type === "user" ? `${kind}:user:${caller.id}` : `${kind}:ip:${caller.ipHash}`;
}

/** Counts one request against a key: `ok` false once over `limit` within the window. */
export type LimitStore = (
  key: string,
  limit: number,
  windowSec: number,
) => Promise<RateLimitResult>;

/**
 * Count this request. The shared store (Supabase) holds across serverless instances; if it fails,
 * the per-instance fallback still applies a limit rather than letting everything through.
 */
export async function checkLimit(
  kind: LimitKind,
  caller: Caller,
  store: LimitStore,
  fallback: LimitStore,
): Promise<RateLimitResult> {
  const key = limitKey(kind, caller);
  const limit = limitFor(kind, caller);
  try {
    return await store(key, limit, LIMIT_WINDOW_SECONDS);
  } catch {
    return fallback(key, limit, LIMIT_WINDOW_SECONDS);
  }
}

/** The bearer token from an `Authorization: Bearer …` header, if it looks like a JWT. */
export function bearerToken(headers: Headers): string | null {
  const m = headers.get("authorization")?.match(/^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)$/);
  return m ? m[1] : null;
}
