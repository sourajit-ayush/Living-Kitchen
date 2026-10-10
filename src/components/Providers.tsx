"use client";

import { domAnimation, LazyMotion, MotionConfig } from "framer-motion";
import { useEffect } from "react";
import { useAccount } from "@/store/useAccount";
import { useDaypart } from "@/store/useDaypart";
import { useBook } from "@/store/useBook";
import { useKitchen } from "@/store/useKitchen";
import { usePantry } from "@/store/usePantry";
import { useList } from "@/store/useList";
import { usePrefs } from "@/store/usePrefs";
import { useCookbook } from "@/store/useCookbook";
import { useSound } from "@/store/useSound";
import { useTimers } from "@/store/useTimers";

/** Client-only providers: reduced-motion aware animation config and localStorage hydration. */
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Stores skip hydration so the server HTML and first client render match.
    void usePrefs.persist.rehydrate();
    void useKitchen.persist.rehydrate();
    void useSound.persist.rehydrate();
    void useTimers.persist.rehydrate();
    void useCookbook.persist.rehydrate();
    void useDaypart.persist.rehydrate();
    // Day/Night (R9): re-read the clock each minute; <html data-daypart> dims the poster and page.
    const showPart = (part: string) => (document.documentElement.dataset.daypart = part);
    showPart(useDaypart.getState().part);
    const unsubscribe = useDaypart.subscribe((s) => showPart(s.part));
    const clock = setInterval(() => useDaypart.getState().tick(), 60_000);
    // Synced stores load before the account, so a guest's data is there to merge on sign-in.
    void Promise.all([
      usePantry.persist.rehydrate(),
      useBook.persist.rehydrate(),
      useList.persist.rehydrate(),
    ]).then(() => useAccount.getState().boot());
    return () => {
      unsubscribe();
      clearInterval(clock);
    };
  }, []);

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig
        reducedMotion="user"
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
      >
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
