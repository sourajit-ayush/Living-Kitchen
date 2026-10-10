import { RecipeSchema } from "@/lib/ai/schema";
import type { Aisle } from "@/lib/pantry";
import type { BookEntry } from "@/store/useBook";
import type { ListItem } from "@/store/useList";
import type { PantryItem } from "@/store/usePantry";

/** Row shapes in Postgres (supabase/migrations) and their mapping to the device's rows. */

const iso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);
const ms = (s: string | null | undefined) => (s ? Date.parse(s) : null);

export type PantryRow = {
  user_id: string;
  key: string;
  ingredient_id: string | null;
  name: string;
  category: string;
  expires_on: string | null;
  updated_at: string;
  deleted_at: string | null;
};

export const pantryToRow = (p: PantryItem, userId: string): PantryRow => ({
  user_id: userId,
  key: p.key,
  ingredient_id: p.id,
  name: p.name,
  category: p.category,
  expires_on: p.expiresOn,
  updated_at: iso(p.updatedAt)!,
  deleted_at: iso(p.deletedAt),
});

export const rowToPantry = (r: PantryRow): PantryItem => ({
  key: r.key,
  id: r.ingredient_id,
  name: r.name,
  category: r.category as PantryItem["category"],
  expiresOn: r.expires_on,
  updatedAt: ms(r.updated_at)!,
  deletedAt: ms(r.deleted_at),
});

export type ListRow = {
  user_id: string;
  key: string;
  name: string;
  qty: string | null;
  aisle: string;
  checked: boolean;
  from_recipe: string | null;
  updated_at: string;
  deleted_at: string | null;
};

export const listToRow = (i: ListItem, userId: string): ListRow => ({
  user_id: userId,
  key: i.key,
  name: i.name,
  qty: i.qty ?? null,
  aisle: i.aisle,
  checked: i.checked,
  from_recipe: i.fromRecipe ?? null,
  updated_at: iso(i.updatedAt)!,
  deleted_at: iso(i.deletedAt),
});

export const rowToList = (r: ListRow): ListItem => ({
  key: r.key,
  name: r.name,
  ...(r.qty ? { qty: r.qty } : {}),
  aisle: r.aisle as Aisle,
  checked: r.checked,
  ...(r.from_recipe ? { fromRecipe: r.from_recipe } : {}),
  updatedAt: ms(r.updated_at)!,
  deletedAt: ms(r.deleted_at),
});

export type SavedRow = {
  user_id: string;
  key: string;
  recipe_id: string;
  collection: string;
  rating: number | null;
  notes: string | null;
  made_photo_path: string | null;
  saved_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SavedRowWithRecipe = SavedRow & { recipes: { id: string; data: unknown } | null };

export const bookToRow = (e: BookEntry, userId: string, recipeId: string): SavedRow => ({
  user_id: userId,
  key: e.key,
  recipe_id: recipeId,
  collection: e.collection,
  rating: e.rating,
  notes: e.notes || null,
  made_photo_path: e.photoPath,
  saved_at: iso(e.savedAt)!,
  updated_at: iso(e.updatedAt)!,
  deleted_at: iso(e.deletedAt),
});

/** Recipe JSON from the database is still untrusted (golden rule 4): invalid rows are skipped. */
export function rowToBook(r: SavedRowWithRecipe): BookEntry | null {
  const recipe = RecipeSchema.safeParse(r.recipes?.data);
  if (!recipe.success) return null;
  return {
    key: r.key,
    recipe: recipe.data,
    collection: r.collection,
    rating: r.rating,
    notes: r.notes ?? "",
    photoPath: r.made_photo_path,
    savedAt: ms(r.saved_at)!,
    remoteRecipeId: r.recipe_id,
    updatedAt: ms(r.updated_at)!,
    deletedAt: ms(r.deleted_at),
  };
}

/** A recipe's public URL slug (Phase 7 shares it): the book key plus a slice of the owner id. */
export const recipeSlug = (key: string, userId: string) =>
  `${key}-${userId.replace(/[^a-z0-9]/gi, "").slice(0, 8)}`.toLowerCase();
