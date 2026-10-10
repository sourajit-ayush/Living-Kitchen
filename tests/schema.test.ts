import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIXTURES, personalize } from "@/lib/ai/mock";
import {
  GenerateRequestSchema,
  RecipeIngredientSchema,
  RecipeSchema,
  RecipeSetSchema,
  StepSchema,
} from "@/lib/ai/schema";

const reference = JSON.parse(readFileSync("reference/recipe.schema.json", "utf8"));

describe("Zod schema mirrors reference/recipe.schema.json", () => {
  it("has the same top-level keys and required keys", () => {
    expect(Object.keys(RecipeSchema.shape).sort()).toEqual(
      Object.keys(reference.properties).sort(),
    );
    for (const key of reference.required) {
      expect(RecipeSchema.shape[key as keyof typeof RecipeSchema.shape].isOptional(), key).toBe(
        false,
      );
    }
  });

  it("has the same ingredient and step keys", () => {
    const refIng = reference.properties.ingredients.items;
    const refStep = reference.properties.steps.items;
    expect(Object.keys(RecipeIngredientSchema.shape).sort()).toEqual(
      Object.keys(refIng.properties).sort(),
    );
    expect(Object.keys(StepSchema.shape).sort()).toEqual(Object.keys(refStep.properties).sort());
  });

  it("has the same enums", () => {
    const enumOf = (s: { options: readonly string[] }) => [...s.options].sort();
    expect(enumOf(RecipeSchema.shape.kind)).toEqual([...reference.properties.kind.enum].sort());
    expect(enumOf(RecipeSchema.shape.diet)).toEqual([...reference.properties.diet.enum].sort());
    expect(enumOf(RecipeSchema.shape.meal)).toEqual([...reference.properties.meal.enum].sort());
    expect(enumOf(RecipeSchema.shape.difficulty)).toEqual(
      [...reference.properties.difficulty.enum].sort(),
    );
    expect(enumOf(RecipeSchema.shape.cookware.element)).toEqual(
      [...reference.properties.cookware.items.enum].sort(),
    );
    expect(enumOf(StepSchema.shape.action)).toEqual(
      [...reference.properties.steps.items.properties.action.enum].sort(),
    );
  });
});

describe("fixtures", () => {
  it("are three valid recipes, one of each kind", () => {
    expect(RecipeSetSchema.safeParse({ recipes: FIXTURES }).success).toBe(true);
  });

  it("rejects extra properties and bad enums (AI output is untrusted)", () => {
    expect(RecipeSchema.safeParse({ ...FIXTURES[0], html: "<b>x</b>" }).success).toBe(false);
    expect(RecipeSchema.safeParse({ ...FIXTURES[0], diet: "carnivore" }).success).toBe(false);
    expect(RecipeSchema.safeParse({ ...FIXTURES[0], title: "x".repeat(81) }).success).toBe(false);
  });

  it("rejects a set with two recipes of the same kind", () => {
    const dupe = { recipes: [FIXTURES[0], { ...FIXTURES[0], id: "other" }, FIXTURES[2]] };
    expect(RecipeSetSchema.safeParse(dupe).success).toBe(false);
  });
});

describe("mock personalize", () => {
  const req = GenerateRequestSchema.parse({
    ingredients: [{ name: "spinach", expiring: true }, { name: "tomato" }, { name: "onion" }],
    prefs: {
      diet: "any",
      cuisine: "any",
      maxMinutes: null,
      spice: 3,
      difficulty: "any",
      cookware: [],
      servings: 2,
      meal: "dinner",
    },
    locale: "en",
  });

  it("marks ingredients the user lacks as missing and writes a summary", () => {
    const r = personalize(FIXTURES[0], req);
    expect(r.ingredients.find((i) => i.ingredient_id === "paneer")?.status).toBe("missing");
    expect(r.ingredients.find((i) => i.ingredient_id === "spinach")?.status).toBe("have");
    expect(r.missing_summary).toMatch(/^Add paneer and you can make/);
    expect(r.uses_up).toEqual(["Spinach"]);
    expect(RecipeSchema.safeParse(r).success).toBe(true);
  });
});

describe("GenerateRequestSchema", () => {
  const base = {
    ingredients: [{ name: "egg" }],
    prefs: {
      diet: "vegetarian",
      cuisine: "north-indian",
      maxMinutes: 30,
      spice: 3,
      difficulty: "easy",
      cookware: ["gas"],
      servings: 2,
      meal: "dinner",
    },
    locale: "hi",
  };

  it("accepts the documented shape and fills defaults", () => {
    const r = GenerateRequestSchema.parse(base);
    expect(r.pantry).toEqual([]);
    expect(r.exclude).toEqual([]);
  });

  it("caps ingredients at 40", () => {
    const many = {
      ...base,
      ingredients: Array.from({ length: 41 }, (_, i) => ({ name: `item ${i}` })),
    };
    expect(GenerateRequestSchema.safeParse(many).success).toBe(false);
  });

  it("rejects unknown keys and bad values", () => {
    expect(GenerateRequestSchema.safeParse({ ...base, admin: true }).success).toBe(false);
    expect(GenerateRequestSchema.safeParse({ ...base, locale: "fr" }).success).toBe(false);
    expect(GenerateRequestSchema.safeParse({ ...base, ingredients: [] }).success).toBe(false);
  });
});

describe("text hygiene", () => {
  it("trims stray whitespace from titles and taglines", () => {
    const r = RecipeSchema.parse({ ...FIXTURES[0], title: " गार्लिक पनीर ", tagline: "  Warm.  " });
    expect(r.title).toBe("गार्लिक पनीर");
    expect(r.tagline).toBe("Warm.");
  });
});
