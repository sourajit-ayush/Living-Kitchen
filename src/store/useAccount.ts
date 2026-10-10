import { create } from "zustand";
import type { SyncStatus } from "@/lib/sync/engine";
import { accountsEnabled, getSupabase, hasStoredSession } from "@/lib/supabase/client";
import { useBook } from "./useBook";
import { useList } from "./useList";
import { usePantry } from "./usePantry";

type AccountState = {
  /** unknown until the stored session (if any) has been checked */
  status: "unknown" | "guest" | "signedIn";
  email: string | null;
  userId: string | null;
  sync: SyncStatus | null;
  /** Load the session if this device has one (or is finishing a magic-link sign-in). */
  boot: (opts?: { force?: boolean }) => Promise<void>;
  sendMagicLink: (email: string, redirectTo: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
};

let stopSync: (() => void) | null = null;
let startingFor: string | null = null;
let booted = false;

/** Accounts (Phase 6): magic-link sign-in and the sync engine, both loaded only when needed. */
export const useAccount = create<AccountState>()((set, get) => ({
  status: "unknown",
  email: null,
  userId: null,
  sync: null,

  boot: async ({ force = false } = {}) => {
    if (!accountsEnabled) return set({ status: "guest" });
    if (booted && !force) return;
    if (!force && !hasStoredSession()) return set({ status: "guest" });
    booted = true;
    const sb = await getSupabase();
    /**
     * Start syncing for this user, exactly once. The initial auth event and getSession() both
     * call this at start-up; without the guard two engines ran, and signing out stopped only
     * one of them (the other put the account's data back on the device).
     */
    const begin = async (userId: string, email: string | null) => {
      if (startingFor === userId || (get().userId === userId && stopSync)) return;
      startingFor = userId;
      try {
        stopSync?.();
        stopSync = null;
        set({ status: "signedIn", userId, email, sync: "syncing" });
        const { startSync } = await import("@/lib/sync/engine");
        // Signed out (or switched account) while the engine was loading: don't start it.
        if (get().status !== "signedIn" || get().userId !== userId) return;
        stopSync = startSync(sb, userId, (sync) => set({ sync }));
      } finally {
        startingFor = null;
      }
    };
    sb.auth.onAuthStateChange((event, session) => {
      if (session?.user) void begin(session.user.id, session.user.email ?? null);
      else if (event === "SIGNED_OUT") {
        stopSync?.();
        stopSync = null;
        set({ status: "guest", userId: null, email: null, sync: null });
      }
    });
    const { data } = await sb.auth.getSession();
    if (data.session?.user) await begin(data.session.user.id, data.session.user.email ?? null);
    else set({ status: "guest" });
  },

  sendMagicLink: async (email, redirectTo) => {
    try {
      const sb = await getSupabase();
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
      });
      return error ? { ok: false, error: error.message } : { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  },

  signOut: async () => {
    stopSync?.();
    stopSync = null;
    // The account's data leaves this device at once (shared phones, family laptops), without
    // waiting on the network.
    usePantry.getState().replace([]);
    useBook.getState().replace([]);
    useList.getState().replace([]);
    set({ status: "guest", userId: null, email: null, sync: null });
    // "local": sign out here only; the account's other devices stay signed in.
    const sb = await getSupabase();
    await sb.auth.signOut({ scope: "local" });
  },
}));
