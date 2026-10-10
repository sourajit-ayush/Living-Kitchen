import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { effectiveDaypart, type Daypart, type DaypartSetting } from "@/lib/daypart";

type DaypartState = {
  /** The header choice: follow the clock, or a fixed part of day */
  setting: DaypartSetting;
  /** What the kitchen shows now (re-checked every minute while on "auto") */
  part: Daypart;
  setSetting: (setting: DaypartSetting) => void;
  /** Re-read the clock (auto) */
  tick: () => void;
};

/** Day/Night kitchen (R9). The setting is remembered on this device. */
export const useDaypart = create<DaypartState>()(
  persist(
    (set, get) => ({
      setting: "auto",
      part: "golden",
      setSetting: (setting) => set({ setting, part: effectiveDaypart(setting) }),
      tick: () => {
        const part = effectiveDaypart(get().setting);
        if (part !== get().part) set({ part });
      },
    }),
    {
      name: "lk-daypart",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ setting }) => ({ setting }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.tick(),
    },
  ),
);
