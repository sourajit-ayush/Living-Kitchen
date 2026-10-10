import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { UnitSystem } from "@/data/units";
import type { Meal, Prefs } from "@/lib/ai/schema";

/** F4: the meal defaults from local time. */
export function mealForHour(hour: number): Meal {
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 18) return "snack";
  return "dinner";
}

export const DEFAULT_PREFS: Prefs = {
  diet: "any",
  cuisine: "any",
  maxMinutes: null,
  spice: 3,
  difficulty: "any",
  cookware: [],
  servings: 2,
  meal: "dinner",
};

type PrefsState = {
  prefs: Prefs;
  /** The meal the user picked explicitly; null = follow the clock. */
  mealOverride: Meal | null;
  unitSystem: UnitSystem;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  setUnitSystem: (system: UnitSystem) => void;
  reset: () => void;
  /** Prefs as sent to the API, with the time-of-day meal filled in. */
  effectivePrefs: (now?: Date) => Prefs;
};

export const usePrefs = create<PrefsState>()(
  persist(
    (set, get) => ({
      prefs: DEFAULT_PREFS,
      mealOverride: null,
      unitSystem: "indian",
      setPref: (key, value) =>
        set((s) => ({
          prefs: { ...s.prefs, [key]: value },
          ...(key === "meal" ? { mealOverride: value as Meal } : {}),
        })),
      setUnitSystem: (unitSystem) => set({ unitSystem }),
      reset: () => set({ prefs: DEFAULT_PREFS, mealOverride: null }),
      effectivePrefs: (now = new Date()) => {
        const { prefs, mealOverride } = get();
        return { ...prefs, meal: mealOverride ?? mealForHour(now.getHours()) };
      },
    }),
    {
      name: "lk-prefs",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ prefs, mealOverride, unitSystem }) => ({ prefs, mealOverride, unitSystem }),
      // Hydrated from <StoreHydrator/> after mount so server and first client render match.
      skipHydration: true,
    },
  ),
);
