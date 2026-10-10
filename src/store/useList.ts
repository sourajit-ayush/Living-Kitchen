import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { normalize } from "@/lib/matchIngredient";
import { aisleFor, type Aisle } from "@/lib/pantry";
import { patchRow, purgeTombstones, tombstone, upsertRow, type SyncMeta } from "@/lib/sync/rows";

export type ListItem = SyncMeta & {
  name: string;
  qty?: string;
  aisle: Aisle;
  fromRecipe?: string;
  checked: boolean;
};

type ListState = {
  items: ListItem[];
  add: (item: { name: string; qty?: string; fromRecipe?: string }) => void;
  remove: (name: string) => void;
  has: (name: string) => boolean;
  toggle: (key: string) => void;
  clearChecked: () => void;
  replace: (items: ListItem[]) => void;
};

/** Shopping list (R8): missing items from any recipe, grouped by aisle, synced when signed in. */
export const useList = create<ListState>()(
  persist(
    (set, get) => ({
      items: [],
      add: ({ name, qty, fromRecipe }) => {
        const key = normalize(name);
        if (get().has(name)) return;
        set((s) => ({
          items: upsertRow<ListItem>(s.items, {
            key,
            name,
            qty,
            fromRecipe,
            aisle: aisleFor(name),
            checked: false,
            deletedAt: null,
          }),
        }));
      },
      remove: (name) => set((s) => ({ items: tombstone(s.items, normalize(name)) })),
      has: (name) => get().items.some((i) => i.key === normalize(name) && !i.deletedAt),
      toggle: (key) =>
        set((s) => {
          const item = s.items.find((i) => i.key === key);
          return item ? { items: patchRow(s.items, key, { checked: !item.checked }) } : s;
        }),
      clearChecked: () =>
        set((s) => {
          let items = s.items;
          for (const i of s.items) if (i.checked && !i.deletedAt) items = tombstone(items, i.key);
          return { items };
        }),
      replace: (items) => set({ items: purgeTombstones(items) }),
    }),
    {
      name: "lk-list",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // v1 (Phase 1) items had no aisle or write time.
      migrate: (persisted, version) => {
        const state = persisted as { items?: Partial<ListItem>[] };
        if (version < 2 && state?.items) {
          const now = Date.now();
          state.items = state.items.map((i) => ({
            ...i,
            aisle: aisleFor(i.name ?? ""),
            updatedAt: now,
            deletedAt: null,
          }));
        }
        return state as ListState;
      },
    },
  ),
);
