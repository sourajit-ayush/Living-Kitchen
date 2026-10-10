import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { INGREDIENTS_BY_ID, isLeftover, type IngredientCategory } from "@/data/ingredients";
import type { GenerateErrorCode } from "@/lib/ai/events";
// constants, not schema: a value import from schema.ts would bundle Zod into the kitchen page.
import { isSingleRecipe } from "@/lib/ai/constants";
import type { GenerateMode, Recipe, RecipeCategory } from "@/lib/ai/schema";
import { normalize } from "@/lib/matchIngredient";
import { parseIngredients, type ParsedIngredient } from "@/lib/parseIngredients";
import { GenerateRequestError, streamGenerate } from "@/lib/sseClient";
import { expiringSoon } from "@/lib/pantry";
import { live } from "@/lib/sync/rows";
import { usePantry } from "./usePantry";
import { usePrefs } from "./usePrefs";
import { useScene } from "./useScene";
import type { Locale } from "@/i18n/routing";

export type IngredientSource = "typed" | "voice" | "scan" | "pantry" | "staple";

export type KitchenIngredient = {
  /** Stable key: dictionary id, or the normalized name for unknown items */
  key: string;
  id: string | null;
  name: string;
  emoji: string;
  category: IngredientCategory;
  qty?: string;
  expiring?: boolean;
  source: IngredientSource;
};

export type KitchenPhase = "idle" | "cooking" | "revealing" | "results" | "recipe" | "error";

export const MAX_INGREDIENTS = 40;

type KitchenState = {
  ingredients: KitchenIngredient[];
  phase: KitchenPhase;
  /** 0..1 from SSE, drives the pot animation (Phase 3) and the progress bar */
  progress: number;
  loadingLine: string | null;
  results: Recipe[];
  selectedId: string | null;
  error: { code: GenerateErrorCode; message: string } | null;
  /** Titles shown so far, sent as `exclude` when regenerating */
  seenTitles: string[];
  /** Language of the in-flight or displayed recipes; null when the counter is idle */
  requestLocale: Locale | null;
  /** Food (the pot) or drinks (the glass). Remembered on this device. */
  category: RecipeCategory;
  /** What the in-flight or displayed answer was for: counter ideas, or one named dish. */
  mode: GenerateMode;
  /** The dish that was asked for ("Name a dish"), for re-asking in another language. */
  dish: string | null;
  /** Food or drinks for the in-flight or displayed answer (the 3D pot or glass follows it). */
  requestCategory: RecipeCategory;
  /** "What's for dinner?" picks so far this visit: asking again suggests something new. */
  tonightSeen: string[];

  addParsed: (items: ParsedIngredient[], source: IngredientSource) => void;
  addText: (text: string, source?: IngredientSource) => number;
  addById: (id: string, source?: IngredientSource) => void;
  remove: (key: string) => void;
  toggleExpiring: (key: string) => void;
  clearIngredients: () => void;
  /** `wish`: a dish picked on the Surprise Me wheel, made as one of the three recipes. */
  cook: (locale: Locale, options?: { regenerate?: boolean; wish?: string }) => Promise<void>;
  /** "Name a dish": the full recipe for one dish or drink, opened as soon as it's ready. */
  cookDish: (locale: Locale, dish: string) => Promise<void>;
  /** "What's for dinner?": one dish Nani picks from the pantry and counter, for this time of day. */
  cookTonight: (locale: Locale) => Promise<void>;
  setCategory: (category: RecipeCategory) => void;
  cancel: () => void;
  /** Re-cook in `locale` if recipes are cooking or showing in another language. */
  syncLocale: (locale: Locale) => void;
  select: (id: string) => void;
  backToResults: () => void;
  startOver: () => void;
  /** The 3D reveal finished (or timed out): show the results panel. */
  finishReveal: () => void;
};

/**
 * What goes to the AI besides the counter (R1, R4): with "Use my pantry" on, the pantry's staples,
 * and pantry items expiring within 2 days as ingredients marked expiring, so they get used up.
 */
export function pantryForCooking(
  counter: { name: string; key: string }[],
  pantry: { key: string; name: string; expiresOn: string | null }[],
  today?: string,
) {
  const onCounter = new Set(counter.map((i) => i.key));
  const rest = pantry.filter((p) => !onCounter.has(p.key));
  const expiring = expiringSoon(rest, today).map((p) => ({ name: p.name, expiring: true }));
  const expiringKeys = new Set(expiringSoon(rest, today).map((p) => p.key));
  return {
    extraIngredients: expiring,
    pantry: rest
      .filter((p) => !expiringKeys.has(p.key))
      .map((p) => p.name)
      .slice(0, 40),
  };
}

function toKitchenIngredient(item: ParsedIngredient, source: IngredientSource): KitchenIngredient {
  const dict = item.id ? INGREDIENTS_BY_ID.get(item.id) : undefined;
  return {
    key: item.id ?? normalize(item.name),
    id: item.id,
    name: item.name,
    emoji: dict?.emoji ?? "🫙",
    category: dict?.category ?? "other",
    ...(item.qty ? { qty: item.qty } : {}),
    source,
  };
}

let inflight: AbortController | null = null;
let revealTimer: ReturnType<typeof setTimeout> | null = null;
const REVEAL_TIMEOUT_MS = 4000;

export const useKitchen = create<KitchenState>()(
  persist(
    (set, get) => {
      const store: KitchenState = {
        ingredients: [],
        phase: "idle",
        progress: 0,
        loadingLine: null,
        results: [],
        selectedId: null,
        error: null,
        seenTitles: [],
        requestLocale: null,
        category: "food",
        mode: "ingredients",
        dish: null,
        requestCategory: "food",
        tonightSeen: [],

        addParsed: (items, source) =>
          set((s) => {
            const next = [...s.ingredients];
            for (const item of items) {
              const ing = toKitchenIngredient(item, source);
              const existing = next.findIndex((i) => i.key === ing.key);
              if (existing >= 0) {
                // Duplicates merge; a newly typed quantity wins.
                if (ing.qty) next[existing] = { ...next[existing], qty: ing.qty };
              } else if (next.length < MAX_INGREDIENTS) {
                next.push(ing);
              }
            }
            return { ingredients: next };
          }),

        addText: (text, source = "typed") => {
          const parsed = parseIngredients(text);
          get().addParsed(parsed, source);
          return parsed.length;
        },

        addById: (id, source = "typed") => {
          const dict = INGREDIENTS_BY_ID.get(id);
          if (dict) get().addParsed([{ id, name: dict.names.en }], source);
        },

        remove: (key) => set((s) => ({ ingredients: s.ingredients.filter((i) => i.key !== key) })),

        toggleExpiring: (key) =>
          set((s) => ({
            ingredients: s.ingredients.map((i) =>
              i.key === key ? { ...i, expiring: !i.expiring } : i,
            ),
          })),

        clearIngredients: () => set({ ingredients: [] }),

        setCategory: (category) => set({ category }),

        cookDish: async (locale, dish) => {
          const name = dish.trim();
          if (name.length < 2) return;
          await run(locale, { mode: "dish", dish: name });
        },

        cookTonight: async (locale) => {
          await run(locale, { mode: "tonight", exclude: get().tonightSeen.slice(-8) });
        },

        cook: async (locale, options = {}) => {
          if (!get().ingredients.length) return;
          await run(locale, { mode: "ingredients", ...options });
        },

        cancel: () => {
          inflight?.abort();
          inflight = null;
          set({ phase: "idle", progress: 0, loadingLine: null, requestLocale: null });
        },

        syncLocale: (locale) => {
          const { phase, requestLocale, cook, cookDish, mode, dish, tonightSeen } = get();
          const live =
            phase === "cooking" ||
            phase === "revealing" ||
            phase === "results" ||
            phase === "recipe";
          // A fresh request (not "regenerate") so the same answer comes back in the new language.
          if (live && requestLocale && requestLocale !== locale) {
            if (mode === "dish" && dish) void cookDish(locale, dish);
            // The same pick, re-asked in the new language (not counted as a new suggestion).
            else if (mode === "tonight")
              void run(locale, { mode, exclude: tonightSeen.slice(0, -1).slice(-8), repeat: true });
            else void cook(locale);
          }
        },

        finishReveal: () => {
          if (revealTimer) clearTimeout(revealTimer);
          revealTimer = null;
          const { phase, mode, results } = get();
          if (phase !== "revealing") return;
          // One recipe (a named dish, tonight's pick): open it (its card flies to the camera in 3D).
          if (isSingleRecipe(mode) && results[0])
            set({ phase: "recipe", selectedId: results[0].id });
          else set({ phase: "results" });
        },

        select: (id) => set({ selectedId: id, phase: "recipe" }),
        backToResults: () => set({ selectedId: null, phase: "results" }),
        startOver: () => {
          inflight?.abort();
          set({
            phase: "idle",
            progress: 0,
            results: [],
            selectedId: null,
            error: null,
            loadingLine: null,
            requestLocale: null,
          });
        },
      };

      /** One request to the recipe API, for either mode; drives the phases the 3D scene follows. */
      async function run(
        locale: Locale,
        options: {
          mode: GenerateMode;
          dish?: string;
          regenerate?: boolean;
          wish?: string;
          /** "tonight": dishes already suggested */
          exclude?: string[];
          /** "tonight" re-asked in another language: don't record it as a new pick */
          repeat?: boolean;
        },
      ) {
        {
          const { ingredients, seenTitles, category } = get();
          inflight?.abort();
          const controller = new AbortController();
          inflight = controller;

          const exclude = options.exclude ?? (options.regenerate ? seenTitles.slice(-12) : []);
          const tonight = options.mode === "tonight";
          set({
            phase: "cooking",
            progress: 0,
            loadingLine: null,
            results: [],
            selectedId: null,
            error: null,
            requestLocale: locale,
            mode: options.mode,
            dish: options.dish ?? null,
            requestCategory: category,
          });

          const results: Recipe[] = [];
          const pantryState = usePantry.getState();
          // "What's for dinner?" always cooks from the pantry: that's the point of it.
          const fromPantry =
            pantryState.useInCooking || tonight
              ? pantryForCooking(ingredients, live(pantryState.items))
              : { extraIngredients: [], pantry: [] };
          try {
            await streamGenerate(
              {
                ingredients: [
                  ...ingredients.map(({ id, name, qty, expiring }) => ({
                    name,
                    ...(qty ? { qty } : {}),
                    ...(expiring ? { expiring } : {}),
                    ...(isLeftover(id) ? { leftover: true } : {}),
                  })),
                  ...fromPantry.extraIngredients,
                ].slice(0, MAX_INGREDIENTS),
                pantry: fromPantry.pantry,
                prefs: usePrefs.getState().effectivePrefs(),
                locale,
                exclude,
                ...(options.wish ? { wish: options.wish } : {}),
                mode: options.mode,
                category,
                ...(options.dish ? { dish: options.dish } : {}),
              },
              (event) => {
                if (controller.signal.aborted) return;
                switch (event.type) {
                  case "progress":
                    set((s) => ({
                      progress: Math.max(s.progress, event.value),
                      loadingLine: event.line ?? s.loadingLine,
                    }));
                    break;
                  case "recipe":
                    results[event.index] = event.recipe;
                    break;
                  case "error":
                    throw new GenerateRequestError(event.code, event.message);
                  case "done":
                    break;
                }
              },
              controller.signal,
            );
            if (controller.signal.aborted) return;
            const complete = results.filter(Boolean);
            if (complete.length === 0)
              throw new GenerateRequestError("invalid_output", "No recipes came back.");
            // With live 3D cards, the recipes first rise out of the steam ("revealing"); the scene
            // calls finishReveal(), with a timeout so the DOM results can never get stuck.
            const reveal = useScene.getState().reveal3d;
            if (revealTimer) clearTimeout(revealTimer);
            if (reveal) revealTimer = setTimeout(() => get().finishReveal(), REVEAL_TIMEOUT_MS);
            const single = isSingleRecipe(options.mode);
            set((s) => ({
              // Without the 3D reveal one recipe opens straight away; counter ideas list first.
              phase: reveal ? "revealing" : single ? "recipe" : "results",
              selectedId: !reveal && single ? complete[0].id : null,
              progress: 1,
              results: complete,
              seenTitles: single
                ? s.seenTitles
                : [...s.seenTitles, ...complete.map((r) => r.title)],
              tonightSeen:
                tonight && !options.repeat
                  ? [...s.tonightSeen, complete[0].title].slice(-8)
                  : s.tonightSeen,
            }));
          } catch (error) {
            if (controller.signal.aborted) return;
            const e =
              error instanceof GenerateRequestError
                ? { code: error.code, message: error.message }
                : { code: "upstream" as const, message: "Network error" };
            set({ phase: "error", error: e });
          } finally {
            if (inflight === controller) inflight = null;
          }
        }
      }

      return store;
    },
    {
      name: "lk-kitchen",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ ingredients, category }) => ({ ingredients, category }),
      skipHydration: true,
    },
  ),
);
