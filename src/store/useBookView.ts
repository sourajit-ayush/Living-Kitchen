import { useMemo } from "react";
import { create } from "zustand";
import { live } from "@/lib/sync/rows";
import { ALL, useBook, type BookEntry } from "./useBook";

/**
 * What the recipe book page is showing, shared with the 3D flip book on the counter: the open
 * collection, the page (recipe) it is turned to, and the recipe opened in full.
 */
export const useBookView = create<{
  collection: string;
  /** Key of the entry the book is open at */
  pageKey: string | null;
  /** Key of the entry opened in full (recipe view) */
  openKey: string | null;
  setCollection: (c: string) => void;
  setPage: (key: string | null) => void;
  open: (key: string | null) => void;
}>()((set) => ({
  collection: "All",
  pageKey: null,
  openKey: null,
  setCollection: (collection) => set({ collection }),
  setPage: (pageKey) => set({ pageKey }),
  open: (openKey) => set(openKey ? { openKey, pageKey: openKey } : { openKey: null }),
}));

/** The entries shown for the open collection, newest first (the 3D book pages through the same list). */
export function useBookPages(): BookEntry[] {
  const entries = useBook((s) => s.entries);
  const collection = useBookView((s) => s.collection);
  return useMemo(
    () =>
      live(entries)
        .filter((e) => collection === ALL || e.collection === collection)
        .sort((a, b) => b.savedAt - a.savedAt),
    [entries, collection],
  );
}
