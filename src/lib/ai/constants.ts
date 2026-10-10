/** Enum values shared by the Zod schema and the UI. Zod-free so client bundles stay small. */

// prettier-ignore
export const KINDS = ["best_match", "almost_there", "wildcard"] as const;
export const DIETS = ["vegetarian", "eggetarian", "vegan", "jain", "non-veg"] as const;
export const MEALS = ["breakfast", "lunch", "snack", "dinner", "dessert"] as const;
export const DIFFICULTIES = ["easy", "medium", "chef"] as const;
export const COOKWARE = [
  "gas",
  "pressure-cooker",
  "microwave",
  "oven",
  "air-fryer",
  "tawa",
  "kadai",
  "no-cook",
] as const;
export const INGREDIENT_STATUSES = ["have", "missing", "optional", "basic"] as const;
export const STEP_ACTIONS = [
  "chop",
  "stir",
  "fry",
  "boil",
  "bake",
  "mix",
  "rest",
  "grind",
  "plate",
  "other",
] as const;
export const LOCALES = ["en", "hi", "bn"] as const;
/** What is being made: food (the pot) or drinks (the glass). */
export const CATEGORIES = ["food", "drink"] as const;
/**
 * From what's on the counter (three ideas), one named dish ("How do I make Chilli Chicken?"), or
 * "What's for dinner?": one dish Nani picks from the pantry and counter for this time of day.
 */
export const GENERATE_MODES = ["ingredients", "dish", "tonight"] as const;
/**
 * Modes answered with exactly one recipe, opened straight away ("Name a dish", "What's for
 * dinner?"). Here, not in schema.ts, so client code can use it without pulling in Zod (24 kB).
 */
export const isSingleRecipe = (mode: (typeof GENERATE_MODES)[number]) => mode !== "ingredients";

export const CUISINES = [
  "any",
  "north-indian",
  "south-indian",
  "bengali",
  "gujarati",
  "indo-chinese",
  "italian",
  "mexican",
  "thai",
  "continental",
  "middle-eastern",
] as const;
