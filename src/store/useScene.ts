import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { stepDown, type QualitySetting, type QualityTier } from "@/components/scene/quality";
import type { RecipeStep } from "@/lib/ai/schema";

/** User's 3D quality choice (Settings page in Phase 7; persisted now). */
export const useQualitySetting = create<{
  setting: QualitySetting;
  setSetting: (s: QualitySetting) => void;
}>()(
  persist((set) => ({ setting: "auto", setSetting: (setting) => set({ setting }) }), {
    name: "lk-quality",
    version: 1,
    storage: createJSONStorage(() => localStorage),
    skipHydration: true,
  }),
);

type SceneState = {
  /** Effective tier after detection and auto step-down; null until the client has decided. */
  tier: QualityTier | null;
  reducedMotion: boolean;
  /** Canvas has rendered its first frame (poster can fade out). */
  ready: boolean;
  /** Ingredient key highlighted from either side (3D hover ↔ chip hover/focus). */
  highlighted: string | null;
  /** Ingredients currently on the 3D counter (exposed as data-on-counter for tests). */
  onCounter: number;
  /** Cook Mode: the current step's action, acted out by the blurred background scene. */
  cookAction: RecipeStep["action"] | null;
  /** Cook Mode: whether the recipe is a drink (the glass acts it out instead of the pot). */
  cookCategory: "food" | "drink";
  /** Cook sequence state, exposed as data-pot / data-in-pot for tests. */
  potOpen: boolean;
  inPot: number;
  /** Surprise Me lazy-susan: fully risen ("up"), on its way, or under the counter (data-wheel). */
  wheel: "down" | "moving" | "up";
  /** The user is about to add ingredients: fetch the lazy physics engine now. */
  physicsWanted: boolean;
  /** The 3D recipe cards are live and will play the reveal (otherwise results show directly). */
  reveal3d: boolean;
  setTier: (tier: QualityTier) => void;
  declineTier: () => void;
  setReducedMotion: (v: boolean) => void;
  setReady: (v: boolean) => void;
  setHighlighted: (key: string | null) => void;
  wantPhysics: () => void;
  setReveal3d: (v: boolean) => void;
};

/** Ephemeral scene state shared between the DOM UI and the R3F canvas. */
export const useScene = create<SceneState>()((set) => ({
  tier: null,
  reducedMotion: false,
  ready: false,
  highlighted: null,
  onCounter: 0,
  physicsWanted: false,
  reveal3d: false,
  potOpen: false,
  inPot: 0,
  wheel: "down",
  cookAction: null,
  cookCategory: "food",
  setTier: (tier) => set({ tier }),
  declineTier: () => set((s) => ({ tier: s.tier ? stepDown(s.tier) : s.tier })),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setReady: (ready) => set({ ready }),
  setHighlighted: (highlighted) => set({ highlighted }),
  wantPhysics: () => set({ physicsWanted: true }),
  setReveal3d: (reveal3d) => set({ reveal3d }),
}));
