import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Cook Mode timers (F9). Several can run at once. A running timer stores its absolute end time,
 * so it keeps counting while you move between steps, and even across a reload.
 */
export type CookTimer = {
  /** `${recipeId}:${stepN}:${index}`, so a step's inline chip finds its timer */
  id: string;
  recipeId: string;
  stepN: number;
  /** what the chip said ("3 minutes"), for the dock and announcements */
  label: string;
  durationMs: number;
  status: "running" | "paused" | "done";
  /** set while running */
  endsAt: number | null;
  /** set while paused (and 0 when done) */
  remainingMs: number;
};

export function timerId(recipeId: string, stepN: number, index: number) {
  return `${recipeId}:${stepN}:${index}`;
}

/** Milliseconds left at `now`. */
export function remainingMs(timer: CookTimer, now: number): number {
  if (timer.status === "running" && timer.endsAt !== null) return Math.max(0, timer.endsAt - now);
  return timer.status === "done" ? 0 : timer.remainingMs;
}

/** Timers that have run out at `now` but aren't marked done yet. */
export function finishedAt(timers: CookTimer[], now: number): CookTimer[] {
  return timers.filter((t) => t.status === "running" && t.endsAt !== null && t.endsAt <= now);
}

type TimersState = {
  timers: CookTimer[];
  start: (t: Omit<CookTimer, "status" | "endsAt" | "remainingMs">, now?: number) => void;
  pause: (id: string, now?: number) => void;
  resume: (id: string, now?: number) => void;
  /** add (or remove) time; a finished timer starts again with the extra time */
  extend: (id: string, ms: number, now?: number) => void;
  dismiss: (id: string) => void;
  /** mark run-out timers done; returns the ones that just finished */
  tick: (now?: number) => CookTimer[];
};

export const useTimers = create<TimersState>()(
  persist(
    (set, get) => ({
      timers: [],
      start: (spec, now = Date.now()) =>
        set((s) => {
          const others = s.timers.filter((t) => t.id !== spec.id);
          const timer: CookTimer = {
            ...spec,
            status: "running",
            endsAt: now + spec.durationMs,
            remainingMs: spec.durationMs,
          };
          return { timers: [...others, timer] };
        }),
      pause: (id, now = Date.now()) =>
        set((s) => ({
          timers: s.timers.map((t) =>
            t.id === id && t.status === "running"
              ? { ...t, status: "paused", remainingMs: remainingMs(t, now), endsAt: null }
              : t,
          ),
        })),
      resume: (id, now = Date.now()) =>
        set((s) => ({
          timers: s.timers.map((t) =>
            t.id === id && t.status === "paused"
              ? { ...t, status: "running", endsAt: now + t.remainingMs }
              : t,
          ),
        })),
      extend: (id, ms, now = Date.now()) =>
        set((s) => ({
          timers: s.timers.map((t) => {
            if (t.id !== id) return t;
            const left = Math.max(0, remainingMs(t, now) + ms);
            if (t.status === "paused") return { ...t, remainingMs: left };
            return left > 0
              ? { ...t, status: "running", endsAt: now + left, remainingMs: left }
              : { ...t, status: "done", endsAt: null, remainingMs: 0 };
          }),
        })),
      dismiss: (id) => set((s) => ({ timers: s.timers.filter((t) => t.id !== id) })),
      tick: (now = Date.now()) => {
        const done = finishedAt(get().timers, now);
        if (done.length) {
          const ids = new Set(done.map((t) => t.id));
          set((s) => ({
            timers: s.timers.map((t) =>
              ids.has(t.id) ? { ...t, status: "done", endsAt: null, remainingMs: 0 } : t,
            ),
          }));
        }
        return done;
      },
    }),
    {
      name: "lk-timers",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
