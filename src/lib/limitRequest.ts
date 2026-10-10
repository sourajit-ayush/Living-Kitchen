import "server-only";
import { createHmac } from "node:crypto";
import { rateLimited } from "@/lib/ai/http";
import { isMockMode } from "@/lib/ai/provider";
import { bearerToken, checkLimit, type Caller, type LimitKind, type LimitStore } from "./limits";
import { clientIp, createRateLimiter, type RateLimitResult } from "./ratelimit";
import { supabaseAdmin } from "./supabase/admin";

/** Per-instance fallback, one sliding window per limit size (used if Supabase is unreachable). */
const memory = new Map<string, ReturnType<typeof createRateLimiter>>();
const memoryStore: LimitStore = async (key, limit, windowSec) => {
  const id = `${limit}/${windowSec}`;
  let check = memory.get(id);
  if (!check) memory.set(id, (check = createRateLimiter({ limit, windowMs: windowSec * 1000 })));
  return check(key);
};

const supabaseStore: LimitStore = async (key, limit, windowSec) => {
  const db = supabaseAdmin();
  if (!db) return memoryStore(key, limit, windowSec);
  const { data, error } = await db
    .rpc("hit_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSec })
    .single<{ ok: boolean; remaining: number; retry_after: number }>();
  if (error || !data) throw error ?? new Error("no rate limit row");
  return { ok: data.ok, remaining: data.remaining, retryAfterSec: data.retry_after };
};

/**
 * Guests are counted by a keyed hash of their IP, so the table never holds an address. The key is
 * the server's secret (never sent anywhere), which also stops anyone recomputing the hashes.
 */
function ipHash(ip: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "lk-local";
  return createHmac("sha256", secret).update(ip).digest("base64url").slice(0, 22);
}

/** Verified user ids by token, briefly, so each request doesn't re-ask Supabase. */
const verified = new Map<string, { id: string | null; until: number }>();

/** The user a token belongs to. `fresh` skips the short cache (for deleting an account). */
export async function userFromToken(token: string, { fresh = false } = {}): Promise<string | null> {
  const hit = verified.get(token);
  if (!fresh && hit && hit.until > Date.now()) return hit.id;
  const db = supabaseAdmin();
  if (!db) return null;
  const { data } = await db.auth.getUser(token);
  const id = data.user?.id ?? null;
  if (verified.size > 5000) verified.clear();
  verified.set(token, { id, until: Date.now() + 5 * 60_000 });
  return id;
}

/** The caller of this request: a signed-in user when the token checks out, else a guest. */
export async function callerOf(request: Request): Promise<Caller> {
  const token = bearerToken(request.headers);
  const id = token ? await userFromToken(token).catch(() => null) : null;
  return id ? { type: "user", id } : { type: "guest", ipHash: ipHash(clientIp(request.headers)) };
}

/**
 * Count this request against the caller's hourly limit. Returns the 429 response to send, or
 * null to go ahead. Off in mock mode (local development and the e2e suite).
 */
export async function limitRequest(request: Request, kind: LimitKind): Promise<Response | null> {
  if (isMockMode()) return null;
  const result: RateLimitResult = await checkLimit(
    kind,
    await callerOf(request),
    supabaseStore,
    memoryStore,
  );
  return result.ok ? null : rateLimited(result.retryAfterSec);
}
