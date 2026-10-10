import { z } from "zod";
import {
  CATEGORIES,
  COOKWARE,
  CUISINES,
  DIETS,
  DIFFICULTIES,
  GENERATE_MODES,
  INGREDIENT_STATUSES,
  KINDS,
  LOCALES,
  MEALS,
  STEP_ACTIONS,
} from "./constants";

export * from "./constants";

/**
 * Zod mirror of reference/recipe.schema.json. Keep the two in sync:
 * tests/schema.test.ts checks required keys and enums against the JSON file.
 */

export const SubstituteSchema = z.strictObject({
  name: z.string().min(1),
  note: z.string(),
});

export const RecipeIngredientSchema = z.strictObject({
  name: z.string().min(1),
  ingredient_id: z.string().nullable().optional(),
  quantity: z.number().nonnegative().nullable(),
  unit: z.string(),
  prep: z.string().nullable().optional(),
  status: z.enum(INGREDIENT_STATUSES),
  substitutes: z.array(SubstituteSchema).max(3).optional(),
});

export const StepSchema = z.strictObject({
  n: z.number().int().min(1),
  text: z.string().min(1),
  action: z.enum(STEP_ACTIONS),
  timer_minutes: z.number().nonnegative().nullable().optional(),
  tip: z.string().nullable().optional(),
});

export const NutritionSchema = z.strictObject({
  calories: z.number().int().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  fibre_g: z.number().nonnegative(),
  tags: z.array(z.string()).optional(),
});

export const RecipeSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "id must be a kebab-case slug"),
  kind: z.enum(KINDS),
  title: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(140),
  cuisine: z.string(),
  diet: z.enum(DIETS),
  meal: z.enum(MEALS),
  difficulty: z.enum(DIFFICULTIES),
  prep_minutes: z.number().int().min(0).max(240),
  cook_minutes: z.number().int().min(0).max(480),
  servings: z.number().int().min(1).max(12),
  spice_level: z.number().int().min(0).max(5),
  cookware: z.array(z.enum(COOKWARE)),
  ingredients: z.array(RecipeIngredientSchema).min(1),
  steps: z.array(StepSchema).min(2),
  nutrition: NutritionSchema,
  uses_up: z.array(z.string()),
  missing_summary: z.string().nullable(),
  tips: z.array(z.string()).max(3),
  locale: z.enum(LOCALES),
  /** Food or a drink. Recipes saved before drinks existed have none: they are food. */
  category: z.enum(CATEGORIES).default("food"),
  /** Drinks: only when the user asked for alcohol (a spirit on the counter, or a named cocktail). */
  contains_alcohol: z.boolean().default(false),
});

/** What the model returns: exactly one recipe of each kind. */
export const RecipeSetSchema = z
  .strictObject({ recipes: z.array(RecipeSchema).length(3) })
  .superRefine(({ recipes }, ctx) => {
    for (const kind of KINDS) {
      if (recipes.filter((r) => r.kind === kind).length !== 1) {
        ctx.addIssue({
          code: "custom",
          message: `expected exactly one "${kind}" recipe`,
          path: ["recipes"],
        });
      }
    }
    if (new Set(recipes.map((r) => r.id)).size !== recipes.length) {
      ctx.addIssue({ code: "custom", message: "recipe ids must be unique", path: ["recipes"] });
    }
  });

/** "Name a dish": exactly one recipe for the dish the user asked for. */
export const DishRecipeSetSchema = z.strictObject({ recipes: z.array(RecipeSchema).length(1) });

export type Recipe = z.infer<typeof RecipeSchema>;
export type RecipeCategory = (typeof CATEGORIES)[number];
export type GenerateMode = (typeof GENERATE_MODES)[number];
export { isSingleRecipe } from "./constants";
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;
export type RecipeStep = z.infer<typeof StepSchema>;
export type RecipeKind = (typeof KINDS)[number];
export type Diet = (typeof DIETS)[number];
export type Meal = (typeof MEALS)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
export type Cookware = (typeof COOKWARE)[number];

/* ---------- API input (docs/04 §4) ---------- */

export type Cuisine = (typeof CUISINES)[number];

export const PrefsSchema = z.strictObject({
  diet: z.enum(["any", ...DIETS]),
  cuisine: z.enum(CUISINES),
  maxMinutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.null()]),
  spice: z.number().int().min(1).max(5),
  difficulty: z.enum(["any", ...DIFFICULTIES]),
  cookware: z.array(z.enum(COOKWARE)).max(COOKWARE.length),
  servings: z.number().int().min(1).max(8),
  meal: z.enum(MEALS),
});
export type Prefs = z.infer<typeof PrefsSchema>;

const shortText = z.string().trim().min(1).max(60);

export const GenerateRequestSchema = z
  .strictObject({
    ingredients: z
      .array(
        z.strictObject({
          name: shortText,
          qty: z.string().trim().max(30).optional(),
          expiring: z.boolean().optional(),
          /** already-cooked leftovers (rice, dal, rotis…) to turn into something new */
          leftover: z.boolean().optional(),
        }),
      )
      .max(40),
    pantry: z.array(shortText).max(40).default([]),
    prefs: PrefsSchema,
    locale: z.enum(LOCALES),
    exclude: z.array(z.string().max(80)).max(12).default([]),
    /** Surprise Me: the dish the wheel landed on, to be made as one of the three recipes. */
    wish: z.string().trim().min(1).max(80).optional(),
    /**
     * "ingredients": three ideas from the counter. "dish": the one recipe for `dish`. "tonight":
     * one dish Nani picks from the pantry and counter for `prefs.meal` (either may be empty).
     */
    mode: z.enum(GENERATE_MODES).default("ingredients"),
    /** Food or drinks (Drinks: non-alcoholic unless alcohol is on the counter or named). */
    category: z.enum(CATEGORIES).default("food"),
    /** The dish or drink the user named, e.g. "Chilli Chicken". */
    dish: z.string().trim().min(2).max(80).optional(),
  })
  .superRefine((req, ctx) => {
    if (req.mode === "ingredients" && req.ingredients.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "add at least one ingredient",
        path: ["ingredients"],
      });
    }
    if (req.mode === "dish" && !req.dish) {
      ctx.addIssue({ code: "custom", message: "name the dish", path: ["dish"] });
    }
  });
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
export type GenerateRequestInput = z.input<typeof GenerateRequestSchema>;

/** Human-readable Zod errors, used for the one retry and in logs. */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 20)
    .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

/* ---------- Fridge scan (F2) and Surprise Me (R3) ---------- */

export const MAX_SCAN_ITEMS = 30;

export const ScanResultSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        name: z.string().trim().min(1).max(60),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(MAX_SCAN_ITEMS),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

export const SURPRISE_IDEAS = 8;

export const SurpriseIdeasSchema = z
  .strictObject({
    ideas: z
      .array(
        z.strictObject({
          title: z.string().trim().min(1).max(60),
          emoji: z.string().trim().min(1).max(16),
          oneLiner: z.string().trim().min(1).max(140),
        }),
      )
      .length(SURPRISE_IDEAS),
  })
  // A degenerate answer (the same "idea" eight times) is invalid, so it gets the one retry. A
  // missing emoji is only decoration: tidyIdeas() gives that plate a 🍽️ instead.
  .superRefine(({ ideas }, ctx) => {
    const titles = new Set(ideas.map((i) => i.title.toLowerCase()));
    if (titles.size !== ideas.length) {
      ctx.addIssue({
        code: "custom",
        message: "all 8 titles must be different dishes",
        path: ["ideas"],
      });
    }
    // Garbled output (seen with Hindi on the lite model) repeats one "word": "तलहल तलहल तलहल…".
    ideas.forEach((idea, i) => {
      const counts = new Map<string, number>();
      for (const w of idea.title.toLowerCase().split(/\s+/))
        counts.set(w, (counts.get(w) ?? 0) + 1);
      if (Math.max(...counts.values()) >= 3) {
        ctx.addIssue({ code: "custom", message: "garbled title", path: ["ideas", i, "title"] });
      }
    });
  });
export type SurpriseIdea = z.infer<typeof SurpriseIdeasSchema>["ideas"][number];

export const SurpriseRequestSchema = z.strictObject({
  ingredients: z.array(shortText).min(1).max(40),
  prefs: PrefsSchema,
  locale: z.enum(LOCALES),
  category: z.enum(CATEGORIES).default("food"),
});
export type SurpriseRequest = z.infer<typeof SurpriseRequestSchema>;
