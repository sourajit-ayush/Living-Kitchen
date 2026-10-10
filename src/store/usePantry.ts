import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { INGREDIENTS_BY_ID, type IngredientCategory } from "@/data/ingredients";
import { normalize } from "@/lib/matchIngredient";
import type { ParsedIngredient } from "@/lib/parseIngredients";
import { patchRow, purgeTombstones, tombstone, upsertRow, type SyncMeta } from "@/lib/sync/rows";

export type PantryItem = SyncMeta & {
  id: string | null;
  name: string;
  category: IngredientCategory;
  expiresOn: string | null;
};

type PantryState = {
  items: PantryItem[];
  /** "Use my pantry" (R1): staples go on the 3D shelf and into every generation. */
  useInCooking: boolean;
  add: (items: ParsedIngredient[]) => void;
  remove: (key: string) => void;
  setExpiry: (key: string, expiresOn: string | null) => void;
  setUseInCooking: (on: boolean) => void;
  /** Sync writes the merged rows back. */
  replace: (items: PantryItem[]) => void;
};

export const pantryKey = (item: { id: string | null; name: string }) =>
  item.id ?? normalize(item.name);

export const pantryEmoji = (item: { id: string | null }) =>
  (item.id && INGREDIENTS_BY_ID.get(item.id)?.emoji) || "🫙";

/** My Pantry (R1, R4): on this device for guests, synced with the account when signed in. */
export const usePantry = create<PantryState>()(
  persist(
    (set) => ({
      items: [],
      useInCooking: false,
      add: (parsed) =>
        set((s) => {
          let items = s.items;
          for (const p of parsed) {
            const key = pantryKey(p);
            const existing = items.find((i) => i.key === key);
            if (existing && !existing.deletedAt) continue;
            const dict = p.id ? INGREDIENTS_BY_ID.get(p.id) : undefined;
            items = upsertRow<PantryItem>(items, {
              key,
              id: p.id,
              name: dict?.names.en ?? p.name,
              category: dict?.category ?? "other",
              expiresOn: null,
              deletedAt: null,
            });
          }
          return { items };
        }),
      remove: (key) => set((s) => ({ items: tombstone(s.items, key) })),
      setExpiry: (key, expiresOn) => set((s) => ({ items: patchRow(s.items, key, { expiresOn }) })),
      setUseInCooking: (useInCooking) => set({ useInCooking }),
      replace: (items) => set({ items: purgeTombstones(items) }),
    }),
    {
      name: "lk-pantry",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
