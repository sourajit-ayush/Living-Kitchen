import { matchIngredient } from "@/lib/matchIngredient";
import { GenerateError, type GenerateEvent } from "./events";
import bhurji from "./fixtures/palak-paneer-bhurji.json";
import dhaba from "./fixtures/dhaba-palak-paneer.json";
import quesadilla from "./fixtures/palak-paneer-quesadilla.json";
import { RecipeSchema, type GenerateRequest, type Recipe } from "./schema";

import chilliChicken from "./fixtures/chilli-chicken.json";
import masalaChai from "./fixtures/masala-chai.json";
import mangoLassi from "./fixtures/mango-lassi.json";
import virginMojito from "./fixtures/virgin-mojito.json";

/** Validated once at import so a broken fixture fails loudly. */
export const FIXTURES: Recipe[] = [bhurji, dhaba, quesadilla].map((f) => RecipeSchema.parse(f));
/** Drinks: one of each kind (best match, almost there, wildcard). */
export const DRINK_FIXTURES: Recipe[] = [masalaChai, mangoLassi, virginMojito].map((f) =>
  RecipeSchema.parse(f),
);
const DISH_FIXTURE: Recipe = RecipeSchema.parse(chilliChicken);

const titleCase = (s: string) =>
  s
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "dish";

/**
 * "Name a dish" in mock mode: a drink fixture whose title matches (or Masala Chai for drinks),
 * otherwise the Chilli Chicken recipe under the name that was asked for.
 */
export function mockDish(req: GenerateRequest): Recipe {
  const asked = (req.dish ?? "").trim();
  const words = asked.toLowerCase();
  const drink = DRINK_FIXTURES.find((d) =>
    d.title
      .toLowerCase()
      .split(" ")
      .some((w) => w.length > 3 && words.includes(w)),
  );
  const base = drink ?? (req.category === "drink" ? DRINK_FIXTURES[0] : DISH_FIXTURE);
  const named =
    base === DISH_FIXTURE && words && words !== base.title.toLowerCase()
      ? { ...base, title: titleCase(asked), id: slug(asked) }
      : base;
  const recipe = personalize(named, req);
  const missing = recipe.ingredients.some((i) => i.status === "missing");
  return { ...recipe, kind: missing ? "almost_there" : "best_match" };
}

/** "What's for dinner?" in mock mode: the first fixture not suggested yet (exclude), personalised. */
export function mockTonight(req: GenerateRequest): Recipe {
  const pool = req.category === "drink" ? DRINK_FIXTURES : FIXTURES;
  const seen = new Set(req.exclude.map((t) => t.toLowerCase()));
  const base = pool.find((r) => !seen.has(r.title.toLowerCase())) ?? pool[0];
  const recipe = personalize(base, req);
  const missing = recipe.ingredients.some((i) => i.status === "missing");
  return { ...recipe, kind: missing ? "almost_there" : "best_match" };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason);
    });
  });

/**
 * Re-tag fixture ingredients against what the user actually typed, so the
 * have/missing UI behaves realistically in mock mode.
 */
export function personalize(recipe: Recipe, req: GenerateRequest): Recipe {
  const have = new Set(
    [...req.ingredients.map((i) => i.name), ...req.pantry].map(
      (n) => matchIngredient(n)?.id ?? n.toLowerCase(),
    ),
  );
  const expiring = new Set(
    req.ingredients
      .filter((i) => i.expiring || i.leftover)
      .map((i) => matchIngredient(i.name)?.id ?? i.name.toLowerCase()),
  );

  const ingredients = recipe.ingredients.map((ing) => {
    if (ing.status === "basic" || ing.status === "optional") return ing;
    const owned = have.has(ing.ingredient_id ?? ing.name.toLowerCase());
    return { ...ing, status: owned ? ("have" as const) : ("missing" as const) };
  });
  const missing = ingredients
    .filter((i) => i.status === "missing")
    .map((i) => i.name.toLowerCase());
  const missing_summary = missing.length
    ? `Add ${missing.join(" and ")} and you can make ${recipe.title}.`
    : null;
  const uses_up = recipe.ingredients
    .filter((i) => expiring.has(i.ingredient_id ?? i.name.toLowerCase()))
    .map((i) => i.name);

  return { ...recipe, ingredients, missing_summary, uses_up };
}

/** Fixture stream with realistic pacing (~2.5 s) so the pot animation has something to react to. */
export async function* mockGenerate(
  req: GenerateRequest,
  signal?: AbortSignal,
): AsyncGenerator<GenerateEvent> {
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await sleep(250, signal);
    yield { type: "progress", value: (i / steps) * 0.9 };
    // Deterministic error path for UI work and e2e: add an ingredient called "boil over".
    if (
      i === 4 &&
      (req.ingredients.some((ing) => ing.name.toLowerCase() === "boil over") ||
        req.dish?.toLowerCase() === "boil over")
    ) {
      throw new GenerateError("upstream", "Mock boil-over triggered.");
    }
  }
  if (req.mode !== "ingredients") {
    await sleep(180, signal);
    yield {
      type: "recipe",
      index: 0,
      recipe: req.mode === "dish" ? mockDish(req) : mockTonight(req),
    };
    return;
  }
  for (const [index, recipe] of (req.category === "drink" ? DRINK_FIXTURES : FIXTURES).entries()) {
    await sleep(180, signal);
    yield { type: "recipe", index, recipe: personalize(recipe, req) };
  }
}
