"use client";

import { useEffect, useState } from "react";

/**
 * Keep the screen on while cooking (F9, Screen Wake Lock API). The browser drops the lock when
 * the tab is hidden, so it is re-requested on return. Unsupported or refused (low battery,
 * permissions policy): Cook Mode works as normal, only without the "screen stays on" badge.
 */
export function useWakeLock(enabled: boolean): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const s = await navigator.wakeLock.request("screen");
        if (cancelled) return void s.release();
        sentinel = s;
        setHeld(true);
        s.addEventListener("release", () => setHeld(false));
      } catch {
        setHeld(false); // refused: carry on without it
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && (!sentinel || sentinel.released)) {
        void request();
      }
    };

    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
      setHeld(false);
    };
  }, [enabled]);

  return held;
}
