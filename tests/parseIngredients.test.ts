import { describe, expect, it } from "vitest";
import { INGREDIENTS } from "@/data/ingredients";
import { matchIngredient, searchIngredients } from "@/lib/matchIngredient";
import { parseIngredients } from "@/lib/parseIngredients";
import { INGREDIENT_MODELS } from "@/data/ingredientModels";

const ids = (text: string) => parseIngredients(text).map((p) => p.id);

describe("dictionary", () => {
  it("has ~150 unique ingredients with names in both languages", () => {
    expect(INGREDIENTS.length).toBeGreaterThanOrEqual(150);
    expect(new Set(INGREDIENTS.map((i) => i.id)).size).toBe(INGREDIENTS.length);
    for (const i of INGREDIENTS) {
      expect(i.names.en).toBeTruthy();
      expect(i.names.hi).toMatch(/[ऀ-ॿ]/);
    }
  });

  it("marks exactly the ingredients that have a real 3D model (Kenney Food Kit, 43)", () => {
    const modelled = INGREDIENTS.filter((i) => i.model).map((i) => i.id);
    expect(modelled.sort()).toEqual(Object.keys(INGREDIENT_MODELS).sort());
    expect(modelled.length).toBeGreaterThanOrEqual(40);
  });
});

describe("matchIngredient", () => {
  it.each([
    ["Tomatoes", "tomato"],
    ["potatoes", "potato"],
    ["curd", "curd"],
    ["dahi", "curd"],
    ["yogurt", "curd"],
    ["capsicum", "capsicum"],
    ["bell pepper", "capsicum"],
    ["palak", "spinach"],
    ["पनीर", "paneer"],
    ["प्याज", "onion"], // without nukta
    ["अंडे", "egg"],
    ["eggs", "egg"],
    ["chillies", "green-chilli"],
    ["panir", "paneer"], // typo
    ["spinch", "spinach"], // typo
    ["corriander", "coriander"], // typo
  ])("%s → %s", (input, id) => {
    expect(matchIngredient(input)?.id).toBe(id);
  });

  it("does not fuzzy-match very short words", () => {
    expect(matchIngredient("xyz")).toBeNull();
    expect(matchIngredient("gx")).toBeNull();
  });

  it("returns null for unknown items", () => {
    expect(matchIngredient("dragonfruit jam")).toBeNull();
  });
});

describe("parseIngredients", () => {
  it("splits English sentences on commas and 'and'", () => {
    expect(ids("I have eggs, spinach and cheese")).toEqual(["egg", "spinach", "cheese"]);
  });

  it("handles Hinglish with 'aur'", () => {
    expect(ids("mere paas aloo, pyaz aur dahi hai")).toEqual(["potato", "onion", "curd"]);
  });

  it("handles Hindi script with 'और'", () => {
    expect(ids("पालक और पनीर")).toEqual(["spinach", "paneer"]);
  });

  it("parses quantities in front and behind", () => {
    expect(parseIngredients("3 eggs, 200g paneer, 1 bunch palak, milk 500 ml")).toEqual([
      { id: "egg", name: "Egg", qty: "3" },
      { id: "paneer", name: "Paneer", qty: "200g" },
      { id: "spinach", name: "Spinach", qty: "1 bunch" },
      { id: "milk", name: "Milk", qty: "500 ml" },
    ]);
  });

  it("accepts unknown items and keeps their text", () => {
    expect(parseIngredients("dragonfruit")).toEqual([{ id: null, name: "Dragonfruit" }]);
  });

  it("merges duplicates, last quantity wins", () => {
    expect(parseIngredients("tomato, 2 tomatoes, tamatar")).toEqual([
      { id: "tomato", name: "Tomato", qty: "2" },
    ]);
  });

  it("strips fillers and ignores empty fragments", () => {
    expect(ids("some fresh coriander,, and a few chillies.")).toEqual([
      "coriander",
      "green-chilli",
    ]);
  });

  it("returns nothing for blank input", () => {
    expect(parseIngredients("  , ,  ")).toEqual([]);
  });
});

describe("searchIngredients", () => {
  it("ranks prefix matches first", () => {
    expect(searchIngredients("pan")[0].id).toBe("paneer");
  });

  it("finds Hindi aliases", () => {
    expect(searchIngredients("dah").map((i) => i.id)).toContain("curd");
  });

  it("finds by word prefix inside multi-word names", () => {
    expect(searchIngredients("pepper").map((i) => i.id)).toEqual(
      expect.arrayContaining(["capsicum", "black-pepper"]),
    );
  });

  it("tolerates typos", () => {
    expect(searchIngredients("tomatoe").map((i) => i.id)).toContain("tomato");
  });

  it("respects the limit", () => {
    expect(searchIngredients("a", 5)).toHaveLength(5);
  });
});

describe("sauces & condiments", () => {
  it.each([
    ["green chilli sauce", "green-chilli-sauce"],
    ["soya sauce", "soy-sauce"],
    ["ketchup", "ketchup"],
    ["tomato sauce", "ketchup"],
    ["schezwan chutney", "schezwan-sauce"],
    ["chilli sauce", "red-chilli-sauce"],
    ["sriracha", "hot-sauce"],
    ["hot sauce", "hot-sauce"],
    ["pizza sauce", "pasta-sauce"],
    ["kasundi", "mustard-sauce"],
    ["imli chutney", "tamarind-chutney"],
    ["bbq", "bbq-sauce"],
  ])("%s → %s", (input, id) => {
    expect(matchIngredient(input)?.id).toBe(id);
  });

  it("doesn't steal plain ingredients", () => {
    expect(matchIngredient("green chilli")?.id).toBe("green-chilli");
    expect(matchIngredient("chilli")?.id).toBe("green-chilli");
    expect(matchIngredient("mustard")?.id).toBe("mustard-seeds");
    expect(matchIngredient("soya")?.id).toBe("soya-chunks");
  });

  it("all sauces share the sauce category", () => {
    for (const id of ["ketchup", "soy-sauce", "schezwan-sauce", "vinegar", "green-chutney"]) {
      expect(INGREDIENTS.find((i) => i.id === id)?.category).toBe("sauce");
    }
  });

  it("parses a typed list of sauces", () => {
    expect(ids("green chilli sauce, soya sauce, ketchup and schezwan sauce")).toEqual([
      "green-chilli-sauce",
      "soy-sauce",
      "ketchup",
      "schezwan-sauce",
    ]);
  });

  it("keeps multi-word names containing 'and' together", () => {
    expect(ids("hot and sweet sauce, eggs and bread")).toEqual([
      "tomato-chilli-sauce",
      "egg",
      "bread",
    ]);
    expect(ids("2 tbsp hot & sweet")).toEqual(["tomato-chilli-sauce"]);
  });

  it("suggests every sauce for 'sauce' and 'chilli s'", () => {
    const sauce = searchIngredients("sauce", 20).map((i) => i.id);
    expect(sauce).toEqual(
      expect.arrayContaining(["soy-sauce", "green-chilli-sauce", "schezwan-sauce", "hot-sauce"]),
    );
    expect(searchIngredients("green chilli s").map((i) => i.id)[0]).toBe("green-chilli-sauce");
  });
});

describe("soft splitting", () => {
  it("only keeps an 'and' phrase whole on an exact match, never a typo match", () => {
    expect(ids("salt and pepper")).toEqual(["salt", "black-pepper"]);
    expect(ids("chana and rice")).toEqual(["chickpeas", "rice"]);
  });
});
