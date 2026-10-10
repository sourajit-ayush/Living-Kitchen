import { canonicalUnit, COUNT_UNITS, G_PER, ML_PER, type UnitSystem } from "@/data/units";
import type { Recipe, RecipeIngredient } from "@/lib/ai/schema";

export type Amount = { quantity: number | null; unit: string };

const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const roundAtLeast = (n: number, step: number) => Math.max(step, roundTo(n, step));

/** Kitchen-sensible rounding per unit (F8): ¼ tsp steps, whole cloves, g/ml to friendly numbers. */
export function roundAmount({ quantity, unit }: Amount, ingredientId?: string | null): Amount {
  if (quantity === null || quantity === 0) return { quantity, unit };
  const q = quantity;
  switch (unit) {
    case "tsp":
    case "tbsp":
    case "cup":
    case "katori":
      return { quantity: roundAtLeast(q, 0.25), unit };
    case "piece":
      // Eggs only come whole; onions and lemons can be halved.
      return {
        quantity: ingredientId === "egg" ? Math.max(1, Math.round(q)) : roundAtLeast(q, 0.5),
        unit,
      };
    case "clove":
    case "pinch":
      return { quantity: Math.max(1, Math.round(q)), unit };
    case "bunch":
      return { quantity: roundAtLeast(q, 0.5), unit };
    case "g":
    case "ml":
      if (q < 10) return { quantity: Math.max(1, Math.round(q)), unit };
      if (q < 100) return { quantity: roundTo(q, 5), unit };
      if (q < 1000) return { quantity: roundTo(q, 10), unit };
      return { quantity: roundTo(q, 50), unit };
    case "kg":
    case "l":
      return { quantity: roundAtLeast(q, 0.05), unit };
    case "oz":
    case "fl oz":
      return { quantity: roundAtLeast(q, 0.5), unit };
    case "lb":
      return { quantity: roundAtLeast(q, 0.25), unit };
    default:
      return { quantity: roundAtLeast(q, 0.25), unit };
  }
}

/** Promote/demote between sizes inside a system (3 tsp → 1 tbsp, 1200 g → 1.2 kg). */
function normalizeSize({ quantity: q, unit }: Amount): Amount {
  if (q === null) return { quantity: q, unit };
  if (unit === "tsp" && q >= 3) return { quantity: q / 3, unit: "tbsp" };
  if (unit === "g" && q >= 1000) return { quantity: q / 1000, unit: "kg" };
  if (unit === "ml" && q >= 1000) return { quantity: q / 1000, unit: "l" };
  if (unit === "kg" && q < 1) return { quantity: q * 1000, unit: "g" };
  if (unit === "l" && q < 1) return { quantity: q * 1000, unit: "ml" };
  if (unit === "oz" && q >= 16) return { quantity: q / 16, unit: "lb" };
  return { quantity: q, unit };
}

function fromMl(ml: number, system: UnitSystem): Amount {
  if (system === "metric") return normalizeSize({ quantity: ml, unit: "ml" });
  // Indian & US kitchens measure small amounts in spoons and larger ones in cups.
  if (ml < 15) return { quantity: ml / ML_PER.tsp, unit: "tsp" };
  if (ml < 60) return { quantity: ml / ML_PER.tbsp, unit: "tbsp" };
  return { quantity: ml / ML_PER.cup, unit: "cup" };
}

/** Convert an amount into the chosen unit system. Count units and spoons pass through. */
export function convertAmount(amount: Amount, system: UnitSystem): Amount {
  const unit = canonicalUnit(amount.unit);
  const q = amount.quantity;
  if (q === null || COUNT_UNITS.has(unit) || unit === "to-taste") return { quantity: q, unit };

  // Spoons are universal; only re-express them if they grow large.
  if (unit === "tsp" || unit === "tbsp") return normalizeSize({ quantity: q, unit });

  if (unit in ML_PER) {
    if (system === "indian" && unit === "katori") return { quantity: q, unit };
    return fromMl(q * ML_PER[unit], system);
  }
  if (unit in G_PER) {
    const g = q * G_PER[unit];
    if (system === "us") return normalizeSize({ quantity: g / G_PER.oz, unit: "oz" });
    return normalizeSize({ quantity: g, unit: "g" });
  }
  return { quantity: q, unit };
}

export function scaleIngredient(
  ing: RecipeIngredient,
  factor: number,
  system: UnitSystem = "metric",
): RecipeIngredient {
  const unit = canonicalUnit(ing.unit);
  const scaled: Amount = { quantity: ing.quantity === null ? null : ing.quantity * factor, unit };
  const converted = convertAmount(scaled, system);
  const { quantity, unit: finalUnit } = roundAmount(converted, ing.ingredient_id);
  return { ...ing, quantity, unit: finalUnit };
}

/**
 * Scale every ingredient to `servings` and express it in `system`. Nutrition stays per serving;
 * step text is left as written (timers don't scale linearly).
 */
export function scaleRecipe(
  recipe: Recipe,
  servings: number,
  system: UnitSystem = "metric",
): Recipe {
  const target = Math.min(12, Math.max(1, Math.round(servings)));
  const factor = target / recipe.servings;
  return {
    ...recipe,
    servings: target,
    ingredients: recipe.ingredients.map((ing) => scaleIngredient(ing, factor, system)),
  };
}

const FRACTIONS: [number, string][] = [
  [0.25, "¼"],
  [1 / 3, "⅓"],
  [0.5, "½"],
  [2 / 3, "⅔"],
  [0.75, "¾"],
];

/** 1.5 → "1½", 0.25 → "¼", 250 → "250", 1.2 → "1.2" */
export function formatQuantity(q: number): string {
  const whole = Math.floor(q);
  const frac = q - whole;
  if (frac < 0.02) return String(whole);
  if (frac > 0.98) return String(whole + 1);
  for (const [value, glyph] of FRACTIONS) {
    if (Math.abs(frac - value) < 0.02) return whole ? `${whole}${glyph}` : glyph;
  }
  return String(Math.round(q * 100) / 100);
}
