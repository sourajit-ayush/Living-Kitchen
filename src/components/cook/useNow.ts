"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { useTimers } from "@/store/useTimers";

/**
 * One shared clock for every timer chip and the dock: it ticks 4×/s only while some timer is
 * running, instead of an interval per chip.
 */
const useClock = create<{ now: number }>(() => ({ now: Date.now() }));
let subscribers = 0;
let interval: ReturnType<typeof setInterval> | undefined;

export function useNow(): number {
  const running = useTimers((s) => s.timers.some((t) => t.status === "running"));
  useEffect(() => {
    if (!running) return;
    if (subscribers++ === 0) {
      interval = setInterval(() => useClock.setState({ now: Date.now() }), 250);
    }
    useClock.setState({ now: Date.now() });
    return () => {
      if (--subscribers === 0) clearInterval(interval);
    };
  }, [running]);
  return useClock((s) => s.now);
}
