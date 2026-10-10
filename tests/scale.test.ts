import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ai/mock";
import type { RecipeIngredient } from "@/lib/ai/schema";
import {
  convertAmount,
  formatQuantity,
  roundAmount,
  scaleIngredient,
  scaleRecipe,
} from "@/lib/scale";

const ing = (over: Partial<RecipeIngredient>): RecipeIngredient => ({
  name: "Thing",
  quantity: 1,
  unit: "piece",
  status: "have",
  ...over,
});

describe("roundAmount", () => {
  it("rounds spoons to ¼ steps with a ¼ minimum", () => {
    expect(roundAmount({ quantity: 0.6, unit: "tsp" })).toEqual({ quantity: 0.5, unit: "tsp" });
    expect(roundAmount({ quantity: 0.1, unit: "tsp" })).toEqual({ quantity: 0.25, unit: "tsp" });
  });

  it("keeps eggs whole and at least one", () => {
    expect(roundAmount({ quantity: 1.4, unit: "piece" }, "egg").quantity).toBe(1);
    expect(roundAmount({ quantity: 0.3, unit: "piece" }, "egg").quantity).toBe(1);
    expect(roundAmount({ quantity: 2.5, unit: "piece" }, "egg").quantity).toBe(3);
  });

  it("lets other pieces be halved", () => {
    expect(roundAmount({ quantity: 0.75, unit: "piece" }, "onion").quantity).toBe(1);
    expect(roundAmount({ quantity: 0.6, unit: "piece" }, "lemon").quantity).toBe(0.5);
  });

  it("rounds grams to friendly numbers", () => {
    expect(roundAmount({ quantity: 7.4, unit: "g" }).quantity).toBe(7);
    expect(roundAmount({ quantity: 62, unit: "g" }).quantity).toBe(60);
    expect(roundAmount({ quantity: 333, unit: "g" }).quantity).toBe(330);
    expect(roundAmount({ quantity: 1234, unit: "ml" }).quantity).toBe(1250);
  });

  it("leaves 'to taste' alone", () => {
    expect(roundAmount({ quantity: null, unit: "to-taste" })).toEqual({
      quantity: null,
      unit: "to-taste",
    });
  });
});

describe("convertAmount", () => {
  it("metric: cups and katori become ml", () => {
    expect(convertAmount({ quantity: 1, unit: "cup" }, "metric")).toEqual({
      quantity: 240,
      unit: "ml",
    });
    expect(convertAmount({ quantity: 2, unit: "katori" }, "metric")).toEqual({
      quantity: 300,
      unit: "ml",
    });
  });

  it("indian: ml becomes cups or spoons, katori stays", () => {
    expect(convertAmount({ quantity: 480, unit: "ml" }, "indian")).toEqual({
      quantity: 2,
      unit: "cup",
    });
    expect(convertAmount({ quantity: 30, unit: "ml" }, "indian")).toEqual({
      quantity: 2,
      unit: "tbsp",
    });
    expect(convertAmount({ quantity: 1, unit: "katori" }, "indian")).toEqual({
      quantity: 1,
      unit: "katori",
    });
  });

  it("us: grams become ounces / pounds", () => {
    expect(convertAmount({ quantity: 283.5, unit: "g" }, "us")).toEqual({
      quantity: 10,
      unit: "oz",
    });
    expect(convertAmount({ quantity: 1, unit: "kg" }, "us").unit).toBe("lb");
  });

  it("normalizes model spelling variants", () => {
    expect(convertAmount({ quantity: 2, unit: "Grams" }, "metric")).toEqual({
      quantity: 2,
      unit: "g",
    });
    expect(convertAmount({ quantity: 6, unit: "teaspoons" }, "metric")).toEqual({
      quantity: 2,
      unit: "tbsp",
    });
  });

  it("never converts count units", () => {
    expect(convertAmount({ quantity: 3, unit: "clove" }, "us")).toEqual({
      quantity: 3,
      unit: "clove",
    });
  });
});

describe("scaleIngredient", () => {
  it("scales and rounds together", () => {
    expect(scaleIngredient(ing({ quantity: 0.5, unit: "tsp" }), 1.5)).toMatchObject({
      quantity: 0.75,
      unit: "tsp",
    });
    expect(
      scaleIngredient(ing({ quantity: 3, unit: "piece", ingredient_id: "egg" }), 0.5).quantity,
    ).toBe(2);
  });

  it("promotes large spoon amounts", () => {
    expect(scaleIngredient(ing({ quantity: 1, unit: "tsp" }), 4)).toMatchObject({
      quantity: 1.25,
      unit: "tbsp",
    });
  });

  it("keeps null quantities", () => {
    expect(scaleIngredient(ing({ quantity: null, unit: "to-taste" }), 3).quantity).toBeNull();
  });
});

describe("scaleRecipe", () => {
  const bhurji = FIXTURES[0];

  it("is the identity at the original servings (apart from unit normalization)", () => {
    const same = scaleRecipe(bhurji, bhurji.servings, "metric");
    expect(same.ingredients.map((i) => i.quantity)).toEqual(
      bhurji.ingredients.map((i) => i.quantity),
    );
  });

  it("doubles quantities for twice the servings", () => {
    const doubled = scaleRecipe(bhurji, 4);
    const paneer = doubled.ingredients.find((i) => i.ingredient_id === "paneer")!;
    expect(doubled.servings).toBe(4);
    expect(paneer.quantity).toBe(400);
  });

  it("clamps servings to 1..12", () => {
    expect(scaleRecipe(bhurji, 50).servings).toBe(12);
    expect(scaleRecipe(bhurji, 0).servings).toBe(1);
  });

  it("does not mutate the input", () => {
    const before = JSON.stringify(bhurji);
    scaleRecipe(bhurji, 7, "us");
    expect(JSON.stringify(bhurji)).toBe(before);
  });
});

describe("formatQuantity", () => {
  it.each([
    [1, "1"],
    [0.25, "¼"],
    [0.5, "½"],
    [1.5, "1½"],
    [2.75, "2¾"],
    [1 / 3, "⅓"],
    [250, "250"],
    [1.2, "1.2"],
    [0.999, "1"],
  ])("%s → %s", (q, out) => {
    expect(formatQuantity(q)).toBe(out);
  });
});
