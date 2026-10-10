import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Recipe } from "@/lib/ai/schema";
import {
  fingerprint,
  patchRow,
  purgeTombstones,
  tombstone,
  upsertRow,
  type SyncMeta,
} from "@/lib/sync/rows";

export type BookEntry = SyncMeta & {
  recipe: Recipe;
  collection: string;
  rating: number | null;
  notes: string;
  /** "Made it!" photo in Supabase Storage (accounts only) */
  photoPath: string | null;
  savedAt: number;
  /** The account's `recipes.id` once pushed */
  remoteRecipeId?: string;
};

export const DEFAULT_COLLECTIONS = ["Weeknight", "Guests"] as const;
export const ALL = "All";

/**
 * A recipe's identity in the book: its slug plus a fingerprint of the content, so the same
 * recipe saved on two devices is one entry, while two different "masala-omelette"s stay two.
 */
export const bookKey = (recipe: Recipe) => `${recipe.id}-${fingerprint(JSON.stringify(recipe))}`;

type BookState = {
  entries: BookEntry[];
  /** Custom collections, including empty ones */
  collections: string[];
  save: (recipe: Recipe, collection?: string) => void;
  unsave: (key: string) => void;
  update: (
    key: string,
    patch: Partial<Pick<BookEntry, "collection" | "rating" | "notes" | "photoPath">>,
  ) => void;
  addCollection: (name: string) => void;
  /** Sync writes the merged rows back (and remembers the account's recipe ids). */
  replace: (entries: BookEntry[]) => void;
};

/** Recipe Book (R2): saved recipes with collections, notes and ratings. */
export const useBook = create<BookState>()(
  persist(
    (set) => ({
      entries: [],
      collections: [...DEFAULT_COLLECTIONS],
      save: (recipe, collection = ALL) =>
        set((s) => {
          const key = bookKey(recipe);
          const existing = s.entries.find((e) => e.key === key);
          if (existing && !existing.deletedAt) return s;
          return {
            entries: upsertRow<BookEntry>(s.entries, {
              key,
              recipe,
              collection,
              rating: existing?.rating ?? null,
              notes: existing?.notes ?? "",
              photoPath: existing?.photoPath ?? null,
              savedAt: Date.now(),
              remoteRecipeId: existing?.remoteRecipeId,
              deletedAt: null,
            }),
          };
        }),
      unsave: (key) => set((s) => ({ entries: tombstone(s.entries, key) })),
      update: (key, patch) => set((s) => ({ entries: patchRow<BookEntry>(s.entries, key, patch) })),
      addCollection: (name) =>
        set((s) => {
          const clean = name.trim().slice(0, 40);
          if (!clean || clean === ALL || s.collections.includes(clean)) return s;
          return { collections: [...s.collections, clean] };
        }),
      replace: (entries) =>
        set((s) => {
          const kept = purgeTombstones(entries);
          // Collections that arrived from another device join the list.
          const names = new Set(s.collections);
          for (const e of kept) if (!e.deletedAt && e.collection !== ALL) names.add(e.collection);
          return { entries: kept, collections: [...names] };
        }),
    }),
    {
      name: "lk-book",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
