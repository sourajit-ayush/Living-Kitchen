import { beforeEach, describe, expect, it, vi } from "vitest";

/** One sync engine per sign-in, and none after signing out (a race the sync e2e test caught). */

const startSync = vi.fn();
const stops: ReturnType<typeof vi.fn>[] = [];
let authListener: ((event: string, session: unknown) => void) | null = null;
const session = { user: { id: "u1", email: "cook@example.com" } };

vi.mock("@/lib/sync/engine", () => ({
  startSync: (...args: unknown[]) => {
    startSync(...args);
    const stop = vi.fn();
    stops.push(stop);
    return stop;
  },
}));

vi.mock("@/lib/supabase/client", () => ({
  accountsEnabled: true,
  hasStoredSession: () => true,
  getSupabase: async () => ({
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authListener = cb;
        // supabase-js reports the stored session right away, while getSession() is also pending.
        queueMicrotask(() => cb("INITIAL_SESSION", session));
        return { data: { subscription: { unsubscribe() {} } } };
      },
      getSession: async () => ({ data: { session } }),
      signOut: vi.fn(async () => ({ error: null })),
    },
  }),
}));

describe("account start-up", () => {
  beforeEach(() => {
    vi.resetModules();
    startSync.mockClear();
    stops.length = 0;
    authListener = null;
  });

  it("starts exactly one sync engine when both start-up paths report the session", async () => {
    const { useAccount } = await import("@/store/useAccount");
    await useAccount.getState().boot();
    await new Promise((r) => setTimeout(r, 0));
    expect(useAccount.getState().status).toBe("signedIn");
    expect(startSync).toHaveBeenCalledTimes(1);
    // a later token refresh for the same user doesn't start another
    authListener?.("TOKEN_REFRESHED", session);
    await new Promise((r) => setTimeout(r, 0));
    expect(startSync).toHaveBeenCalledTimes(1);
  });

  it("signing out stops sync and clears the device", async () => {
    const { useAccount } = await import("@/store/useAccount");
    const { useList } = await import("@/store/useList");
    await useAccount.getState().boot();
    await new Promise((r) => setTimeout(r, 0));
    useList.getState().add({ name: "Curd" });
    await useAccount.getState().signOut();
    expect(stops.every((s) => s.mock.calls.length === 1)).toBe(true);
    expect(useList.getState().items).toEqual([]);
    expect(useAccount.getState().status).toBe("guest");
  });
});
