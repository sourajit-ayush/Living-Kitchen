import { create } from "zustand";
import type { SurpriseIdea } from "@/lib/ai/schema";
import { LANDED_HOLD_MS, planSpin, PLATES, SPIN_MS, type SpinPlan } from "@/lib/wheel";
import { useKitchen } from "./useKitchen";
import { usePrefs } from "./usePrefs";
import { authHeaders } from "@/lib/supabase/client";
import type { Locale } from "@/i18n/routing";

export type SurpriseStatus = "idle" | "loading" | "spinning" | "landed" | "error";

type SurpriseState = {
  status: SurpriseStatus;
  ideas: SurpriseIdea[];
  target: number;
  plan: SpinPlan | null;
  /** performance.now() when the spin started (the 3D wheel and the DOM list share it) */
  startedAt: number;
  error: string | null;
  start: (locale: Locale, options?: { reducedMotion?: boolean }) => Promise<void>;
  cancel: () => void;
};

let controller: AbortController | null = null;
const timers: ReturnType<typeof setTimeout>[] = [];
const clearTimers = () => timers.splice(0).forEach(clearTimeout);
/** Where the wheel stopped last time, so the next spin starts there instead of jumping. */
let restAngle = 0;

/**
 * Surprise Me (R3): fetch 8 dish ideas, spin the lazy-susan to a random one, hold it up for a
 * moment, then cook it (sent as the request's `wish`).
 */
export const useSurprise = create<SurpriseState>()((set, get) => ({
  status: "idle",
  ideas: [],
  target: 0,
  plan: null,
  startedAt: 0,
  error: null,

  start: async (locale, { reducedMotion = false } = {}) => {
    const ingredients = useKitchen.getState().ingredients;
    if (!ingredients.length) return;
    get().cancel();
    const c = new AbortController();
    controller = c;
    set({ status: "loading", error: null, ideas: [], plan: null });
    try {
      const res = await fetch("/api/surprise", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          ingredients: ingredients.map((i) => i.name),
          prefs: usePrefs.getState().effectivePrefs(),
          locale,
          category: useKitchen.getState().category,
        }),
        signal: c.signal,
      });
      const json = (await res.json().catch(() => null)) as {
        ideas?: SurpriseIdea[];
        error?: { message: string };
      } | null;
      if (c.signal.aborted) return;
      if (!res.ok || !json?.ideas || json.ideas.length !== PLATES) {
        set({ status: "error", error: json?.error?.message ?? null });
        return;
      }
      const target = Math.floor(Math.random() * PLATES);
      const plan = planSpin(target, restAngle, undefined, reducedMotion ? 0 : SPIN_MS);
      restAngle = plan.to % (Math.PI * 2);
      set({ status: "spinning", ideas: json.ideas, target, plan, startedAt: performance.now() });
      timers.push(
        setTimeout(() => {
          if (controller !== c) return;
          set({ status: "landed" });
          timers.push(
            setTimeout(() => {
              if (controller !== c) return;
              controller = null;
              const idea = get().ideas[target];
              set({ status: "idle" });
              void useKitchen.getState().cook(locale, { wish: idea.title });
            }, LANDED_HOLD_MS),
          );
        }, plan.durationMs),
      );
    } catch {
      if (!c.signal.aborted) set({ status: "error", error: null });
    }
  },

  cancel: () => {
    controller?.abort();
    controller = null;
    clearTimers();
    set({ status: "idle", plan: null, error: null });
  },
}));
