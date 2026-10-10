import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { setSoundEnabled } from "@/lib/sound";

/** Sound on/off (docs/02 §7): off by default, remembered per browser. */
export const useSound = create<{ enabled: boolean; toggle: () => void }>()(
  persist(
    (set, get) => ({
      enabled: false,
      toggle: () => {
        const enabled = !get().enabled;
        setSoundEnabled(enabled); // inside the click, so the AudioContext may start
        set({ enabled });
      },
    }),
    {
      name: "lk-sound",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // A remembered "on" still waits for the next user gesture before audio can start.
      onRehydrateStorage: () => (state) => {
        if (state?.enabled) setSoundEnabled(true);
      },
    },
  ),
);
