import { describe, expect, it, vi } from "vitest";
import { generateCacheKey } from "@/lib/ai/cacheKey";
import { DRINK_FIXTURES, FIXTURES, mockDish, mockGenerate } from "@/lib/ai/mock";
import {
  buildUserPrompt,
  DISH_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  systemPromptFor,
} from "@/lib/ai/prompts";
import {
  DishRecipeSetSchema,
  GenerateRequestSchema,
  RecipeSchema,
  RecipeSetSchema,
  type GenerateRequestInput,
} from "@/lib/ai/schema";
import { parseRecipeSet } from "@/lib/ai/validate";
import { GLASS_OFFSET, SHOTS, shotFor } from "@/components/scene/cameraShots";
import { GLASS_MOUTH, POT_MOUTH } from "@/components/scene/cookSignals";
import { glassLookFor } from "@/components/scene/useCookSequence";

vi.mock("server-only", () => ({}));

const prefs = {
  diet: "any",
  cuisine: "any",
  maxMinutes: null,
  spice: 3,
  difficulty: "any",
  cookware: [],
  servings: 2,
  meal: "dinner",
} as const;
const req = (over: Partial<GenerateRequestInput> = {}) =>
  GenerateRequestSchema.parse({ ingredients: [{ name: "onion" }], prefs, locale: "en", ...over });

describe("requests: a named dish, and drinks", () => {
  it("a named dish needs no counter, but does need a name", () => {
    expect(req({ mode: "dish", dish: "Chilli Chicken", ingredients: [] }).dish).toBe(
      "Chilli Chicken",
    );
    expect(
      GenerateRequestSchema.safeParse({ prefs, locale: "en", mode: "dish", ingredients: [] })
        .success,
    ).toBe(false);
    // the counter flow still needs ingredients
    expect(GenerateRequestSchema.safeParse({ prefs, locale: "en", ingredients: [] }).success).toBe(
      false,
    );
  });

  it("defaults to food from the counter (older clients keep working)", () => {
    expect(req()).toMatchObject({ mode: "ingredients", category: "food" });
  });
});

describe("recipes: drinks and alcohol", () => {
  it("recipes saved before drinks existed still load, as food without alcohol", () => {
    const old: Record<string, unknown> = { ...FIXTURES[0] };
    delete old.category;
    delete old.contains_alcohol;
    expect(RecipeSchema.parse(old)).toMatchObject({ category: "food", contains_alcohol: false });
  });

  it("drink fixtures are three valid drinks, one of each kind, none alcoholic", () => {
    expect(RecipeSetSchema.safeParse({ recipes: DRINK_FIXTURES }).success).toBe(true);
    expect(DRINK_FIXTURES.every((d) => d.category === "drink" && !d.contains_alcohol)).toBe(true);
  });

  it("a named dish answer is exactly one recipe", () => {
    expect(DishRecipeSetSchema.safeParse({ recipes: [FIXTURES[0]] }).success).toBe(true);
    expect(DishRecipeSetSchema.safeParse({ recipes: FIXTURES }).success).toBe(false);
    const one = JSON.stringify({ recipes: [FIXTURES[0]] });
    expect(parseRecipeSet(one, false, "en", "dish").ok).toBe(true);
    expect(parseRecipeSet(one, false, "en", "ingredients").ok).toBe(false);
  });
});

describe("prompts", () => {
  it("each mode has its own instructions, sharing the diet, drink and alcohol rules", () => {
    expect(systemPromptFor("dish")).toBe(DISH_SYSTEM_PROMPT);
    expect(systemPromptFor("ingredients")).toBe(SYSTEM_PROMPT);
    for (const p of [SYSTEM_PROMPT, DISH_SYSTEM_PROMPT]) {
      expect(p).toContain("Respect diet strictly");
      expect(p).toContain("non-alcoholic by default");
      expect(p).toContain("contains_alcohol");
    }
    expect(DISH_SYSTEM_PROMPT).toContain("never swap anything out");
  });

  it("says what to make: the named dish, or drinks", () => {
    expect(buildUserPrompt(req({ mode: "dish", dish: "Chilli Chicken" }))).toContain(
      "Dish to make: Chilli Chicken",
    );
    expect(buildUserPrompt(req({ category: "drink" }))).toContain("Make: drinks");
    expect(buildUserPrompt(req({ mode: "dish", dish: "Mojito", ingredients: [] }))).toContain(
      "- none listed",
    );
  });

  it("caches a named dish, drinks and food separately", () => {
    const keys = new Set([
      generateCacheKey(req(), "m"),
      generateCacheKey(req({ category: "drink" }), "m"),
      generateCacheKey(req({ mode: "dish", dish: "Chilli Chicken" }), "m"),
      generateCacheKey(req({ mode: "dish", dish: "Chilli Paneer" }), "m"),
    ]);
    expect(keys.size).toBe(4);
    expect(generateCacheKey(req({ mode: "dish", dish: "chilli  CHICKEN" }), "m")).toBe(
      generateCacheKey(req({ mode: "dish", dish: "Chilli Chicken" }), "m"),
    );
  });
});

describe("mock answers (local development and e2e)", () => {
  it("a named dish comes back as one recipe under that name, with have/missing marked", () => {
    const r = mockDish(
      req({ mode: "dish", dish: "butter chicken", ingredients: [{ name: "onion" }] }),
    );
    expect(r.title).toBe("Butter Chicken");
    expect(r.ingredients.find((i) => i.ingredient_id === "onion")?.status).toBe("have");
    expect(r.kind).toBe("almost_there");
    expect(mockDish(req({ mode: "dish", dish: "Mango lassi", category: "drink" })).title).toBe(
      "Mango Lassi",
    );
  });

  it("streams one recipe for a dish, three drinks for drinks", async () => {
    const collect = async (r: ReturnType<typeof req>) => {
      const out = [];
      for await (const e of mockGenerate(r)) if (e.type === "recipe") out.push(e.recipe);
      return out;
    };
    expect(await collect(req({ mode: "dish", dish: "Chilli Chicken" }))).toHaveLength(1);
    const drinks = await collect(req({ category: "drink" }));
    expect(drinks.map((d) => d.category)).toEqual(["drink", "drink", "drink"]);
  });
});

describe("the drinks glass in 3D", () => {
  it("its camera shots are the pot's, moved by exactly the glass offset", () => {
    const d = GLASS_MOUTH.clone().sub(POT_MOUTH);
    expect([d.x, d.y, d.z].map((v) => +v.toFixed(3))).toEqual(GLASS_OFFSET);
    expect(SHOTS.glass.desktop.target[0] - SHOTS.stove.desktop.target[0]).toBeCloseTo(-0.28);
  });

  it("drinks are framed at the glass while mixing, and in Cook Mode except at the board", () => {
    expect(shotFor("cooking", "desktop", false, null, false, null, "glass")).toBe("glass");
    expect(shotFor("results", "desktop", false, null, false, null, "glass")).toBe("glassReveal");
    expect(shotFor("error", "desktop", false, null, false, null, "glass")).toBe("glassLeft");
    expect(shotFor("idle", "desktop", false, "grind", false, null, "glass")).toBe("cookGlass");
    expect(shotFor("idle", "desktop", false, "chop", false, null, "glass")).toBe("cookBoard");
    expect(shotFor("cooking", "desktop", false)).toBe("stove"); // food: unchanged
  });

  it("acts out drink steps: blending fizzes hard, chilling is calm, pouring adds the straw", () => {
    expect(glassLookFor("grind").fizz).toBeGreaterThan(glassLookFor("rest").fizz);
    expect(glassLookFor("plate").straw).toBe(1);
  });
});
