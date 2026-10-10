import { describe, expect, it } from "vitest";
import { INGREDIENTS_BY_ID } from "@/data/ingredients";
import { getSubstitutes, LOCAL_SUBSTITUTIONS, localSubstitutes } from "@/data/substitutions";

describe("substitutions", () => {
  it("every rule is keyed by a real dictionary id", () => {
    for (const id of Object.keys(LOCAL_SUBSTITUTIONS)) {
      expect(INGREDIENTS_BY_ID.has(id), id).toBe(true);
    }
  });

  it("has the buttermilk rule from the spec", () => {
    expect(localSubstitutes("buttermilk")[0]).toMatchObject({
      name: "Milk + lemon juice",
      note: expect.stringContaining("10 min"),
      source: "local",
    });
  });

  it("returns nothing for unknown ids", () => {
    expect(localSubstitutes(null)).toEqual([]);
    expect(localSubstitutes("dragonfruit")).toEqual([]);
  });

  it("puts AI substitutes first and de-duplicates by name", () => {
    const subs = getSubstitutes("paneer", [
      { name: "firm tofu", note: "AI note" },
      { name: "Eggs", note: "Scramble instead" },
    ]);
    expect(subs.map((s) => s.name)).toEqual(["firm tofu", "Eggs", "Boiled potato"]);
    expect(subs[0]).toMatchObject({ source: "ai", note: "AI note" });
  });
});
