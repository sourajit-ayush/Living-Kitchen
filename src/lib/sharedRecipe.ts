import "server-only";
import { cache } from "react";
import { RecipeSchema, type Recipe } from "@/lib/ai/schema";
import { supabasePublic } from "@/lib/supabase/admin";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SharedRecipe = { recipe: Recipe; sharedAt: string | null };

/**
 * A publicly shared recipe (/r/[slug]), read with the public key: RLS only returns rows that
 * were shared. The stored JSON is validated again before it is shown (golden rule 4).
 */
export const getSharedRecipe = cache(async (slug: string): Promise<SharedRecipe | null> => {
  if (!SLUG.test(slug) || slug.length > 140) return null;
  const db = supabasePublic();
  if (!db) return null;
  const { data, error } = await db
    .from("recipes")
    .select("data, shared_at, created_at")
    .eq("slug", slug)
    .eq("is_public", true)
    .maybeSingle();
  if (error || !data) return null;
  const parsed = RecipeSchema.safeParse(data.data);
  if (!parsed.success) return null;
  return { recipe: parsed.data, sharedAt: data.shared_at ?? data.created_at };
});

/** schema.org Recipe (rich results in search). */
export function recipeJsonLd(recipe: Recipe, url: string, image: string | null) {
  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    description: recipe.tagline,
    url,
    ...(image ? { image: [image] } : {}),
    recipeCuisine: recipe.cuisine,
    recipeYield: `${recipe.servings}`,
    prepTime: `PT${recipe.prep_minutes}M`,
    cookTime: `PT${recipe.cook_minutes}M`,
    totalTime: `PT${recipe.prep_minutes + recipe.cook_minutes}M`,
    recipeIngredient: recipe.ingredients.map((i) =>
      [i.quantity ?? "", i.unit === "to-taste" ? "" : i.unit, i.name].filter(Boolean).join(" "),
    ),
    recipeInstructions: recipe.steps.map((s) => ({ "@type": "HowToStep", text: s.text })),
    nutrition: { "@type": "NutritionInformation", calories: `${recipe.nutrition.calories} kcal` },
    inLanguage: recipe.locale,
  };
}

/** JSON for a <script> tag: "<" escaped so recipe text can't close the tag. */
export function safeJson(value: unknown): string {
  // "<" becomes the JSON escape (backslash)u003c, so no recipe text can close the tag.
  return JSON.stringify(value).replace(/</g, String.fromCharCode(92) + "u003c");
}
