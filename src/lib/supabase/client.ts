import type { SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Accounts exist only when the project's public URL and anon key are configured. */
export const accountsEnabled = Boolean(URL && ANON_KEY);

/** Where supabase-js keeps the session ("sb-<project ref>-auth-token"). */
export function sessionStorageKey(): string | null {
  if (!URL) return null;
  try {
    return `sb-${new globalThis.URL(URL).hostname.split(".")[0]}-auth-token`;
  } catch {
    return null;
  }
}

/** A session is stored on this device: worth loading the Supabase library at startup. */
export function hasStoredSession(): boolean {
  const key = sessionStorageKey();
  try {
    return !!key && localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

let client: Promise<SupabaseClient> | null = null;

/**
 * The browser client, loaded on demand (~50 kB): guests who never sign in never download it.
 * PKCE magic links: the callback page's `?code=` is exchanged automatically on load.
 */
export function getSupabase(): Promise<SupabaseClient> {
  if (!accountsEnabled) return Promise.reject(new Error("Accounts are not configured"));
  client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(URL!, ANON_KEY!, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }),
  );
  return client;
}

/**
 * `Authorization` for our own API routes when signed in, so the server can apply the user's
 * (higher) hourly limits. Guests send nothing and never load the Supabase library for this.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!accountsEnabled || !hasStoredSession()) return {};
  try {
    const { data } = await (await getSupabase()).auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}
