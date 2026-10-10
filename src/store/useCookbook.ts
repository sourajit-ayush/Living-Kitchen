import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { UnitSystem } from "@/data/units";
import type { Recipe } from "@/lib/ai/schema";

/**
 * Recipes opened in Cook Mode, kept on this device so /cook/[id] survives a reload (and works
 * offline once the PWA lands in Phase 8), with the servings/units chosen in the recipe view, the
 * ingredients ticked off and the step you were on. Saved recipes (accounts) come in Phase 6.
 */
export type CookEntry = {
  recipe: Recipe;
  servings: number;
  unitSystem: UnitSystem;
  checked: number[];
  step: number;
  openedAt: number;
};

const KEEP = 10;

type CookbookState = {
  entries: Record<string, CookEntry>;
  open: (recipe: Recipe, servings: number, unitSystem: UnitSystem) => void;
  setStep: (id: string, step: number) => void;
  toggleChecked: (id: string, index: number) => void;
};

export const useCookbook = create<CookbookState>()(
  persist(
    (set) => ({
      entries: {},
      open: (recipe, servings, unitSystem) =>
        set((s) => {
          const previous = s.entries[recipe.id];
          // Re-opening the same recipe keeps your place; new servings reset the ticks.
          const sameScale =
            previous && previous.servings === servings && previous.unitSystem === unitSystem;
          const entry: CookEntry = {
            recipe,
            servings,
            unitSystem,
            checked: sameScale ? previous.checked : [],
            step: previous?.step ?? 0,
            openedAt: Date.now(),
          };
          const kept = Object.entries({ ...s.entries, [recipe.id]: entry })
            .sort(([, a], [, b]) => b.openedAt - a.openedAt)
            .slice(0, KEEP);
          return { entries: Object.fromEntries(kept) };
        }),
      setStep: (id, step) =>
        set((s) =>
          s.entries[id] ? { entries: { ...s.entries, [id]: { ...s.entries[id], step } } } : s,
        ),
      toggleChecked: (id, index) =>
        set((s) => {
          const e = s.entries[id];
          if (!e) return s;
          const checked = e.checked.includes(index)
            ? e.checked.filter((i) => i !== index)
            : [...e.checked, index];
          return { entries: { ...s.entries, [id]: { ...e, checked } } };
        }),
    }),
    {
      name: "lk-cookbook",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
