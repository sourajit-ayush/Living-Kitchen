import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateCacheKey } from "@/lib/ai/cacheKey";
import { geminiSchemaFor, GEMINI_DISH_SCHEMA } from "@/lib/ai/jsonSchema";
import { FIXTURES, mockTonight, DRINK_FIXTURES } from "@/lib/ai/mock";
import {
  buildRetryPrompt,
  buildUserPrompt,
  systemPromptFor,
  TONIGHT_SYSTEM_PROMPT,
} from "@/lib/ai/prompts";
import { GenerateRequestSchema, isSingleRecipe } from "@/lib/ai/schema";
import { parseRecipeSet } from "@/lib/ai/validate";

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
const tonight = (extra: Record<string, unknown> = {}) =>
  GenerateRequestSchema.parse({ ingredients: [], prefs, locale: "en", mode: "tonight", ...extra });

describe('"What\'s for dinner?" (tonight mode)', () => {
  it("needs no ingredients and no dish: one tap with an empty counter is a valid request", () => {
    expect(() => tonight()).not.toThrow();
    expect(tonight({ pantry: ["Rice", "Toor dal"] }).pantry).toEqual(["Rice", "Toor dal"]);
  });

  it("asks Nani to pick one dish for the meal, from what the kitchen has", () => {
    expect(systemPromptFor("tonight")).toBe(TONIGHT_SYSTEM_PROMPT);
    expect(TONIGHT_SYSTEM_PROMPT).toContain("Pick exactly 1 dish");
    expect(TONIGHT_SYSTEM_PROMPT).toContain("at most 3 common things to buy");
    const prompt = buildUserPrompt(tonight({ prefs: { ...prefs, meal: "breakfast" } }));
    expect(prompt).toContain("Pick for me: one dish for breakfast, right now");
    expect(buildUserPrompt(tonight({ category: "drink" }))).toContain("one drink for dinner");
    expect(buildUserPrompt(tonight({ exclude: ["Palak Paneer Bhurji"] }))).toContain(
      "Do not repeat these dishes: Palak Paneer Bhurji",
    );
    expect(buildRetryPrompt("- x", "tonight")).toContain("Return the recipe again");
  });

  it("is a single-recipe mode end to end: schema, validation and cache key", () => {
    expect(isSingleRecipe("tonight")).toBe(true);
    expect(isSingleRecipe("ingredients")).toBe(false);
    expect(geminiSchemaFor("tonight")).toBe(GEMINI_DISH_SCHEMA);
    expect(
      parseRecipeSet(JSON.stringify({ recipes: [FIXTURES[0]] }), false, "en", "tonight").ok,
    ).toBe(true);
    expect(parseRecipeSet(JSON.stringify({ recipes: FIXTURES }), false, "en", "tonight").ok).toBe(
      false,
    );
    // its own prompt, and a different meal or an excluded dish is a different answer
    expect(generateCacheKey(tonight(), "m")).not.toBe(
      generateCacheKey({ ...tonight(), mode: "dish", dish: "x" }, "m"),
    );
    expect(generateCacheKey(tonight(), "m")).not.toBe(
      generateCacheKey(tonight({ prefs: { ...prefs, meal: "lunch" } }), "m"),
    );
    expect(generateCacheKey(tonight(), "m")).not.toBe(
      generateCacheKey(tonight({ exclude: ["Palak Paneer Bhurji"] }), "m"),
    );
  });

  it("client stores only import types from schema.ts (a value import bundles Zod, +24 kB)", () => {
    for (const file of readdirSync("src/store")) {
      const source = readFileSync(`src/store/${file}`, "utf8");
      expect(source, file).not.toMatch(/^import \{[^}]*\} from "@\/lib\/ai\/schema"/m);
    }
  });

  it("mock mode suggests something new each time, and drinks when asked", () => {
    const first = mockTonight(tonight());
    const second = mockTonight(tonight({ exclude: [first.title] }));
    expect(second.title).not.toBe(first.title);
    expect(mockTonight(tonight({ category: "drink" })).title).toBe(DRINK_FIXTURES[0].title);
    // nothing on the counter or in the pantry: things to buy, so "almost there"
    expect(first.kind).toBe("almost_there");
  });
});
