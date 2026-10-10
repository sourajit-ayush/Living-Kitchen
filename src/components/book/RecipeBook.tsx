"use client";

import { CaretLeft, CaretRight, Plus, Star } from "@phosphor-icons/react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ALL, useBook, type BookEntry } from "@/store/useBook";
import { useBookPages, useBookView } from "@/store/useBookView";
import { RecipeView } from "@/components/recipe/RecipeView";
import { AccountNote } from "@/components/account/AccountNote";
import { Button, IconButton } from "@/components/ui/Button";
import { BookEntryEditor, useCollectionLabel } from "./BookEntryEditor";

function CollectionTabs() {
  const t = useTranslations("Book");
  const collections = useBook((s) => s.collections);
  const current = useBookView((s) => s.collection);
  const label = useCollectionLabel();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div role="radiogroup" aria-label={t("collection")} className="flex flex-wrap gap-1.5">
        {[ALL, ...collections].map((c) => (
          <label
            key={c}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-[14px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
              current === c
                ? "border-walnut-900 bg-walnut-900 text-cream-50"
                : "border-border bg-cream-50 text-ink hover:bg-cream-200"
            }`}
          >
            <input
              type="radio"
              name="book-collection"
              className="sr-only"
              checked={current === c}
              onChange={() => useBookView.getState().setCollection(c)}
            />
            {label(c)}
          </label>
        ))}
      </div>
      {adding ? (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            useBook.getState().addCollection(name);
            if (name.trim()) useBookView.getState().setCollection(name.trim().slice(0, 40));
            setName("");
            setAdding(false);
          }}
        >
          <label htmlFor="new-collection" className="sr-only">
            {t("newCollection")}
          </label>
          <input
            id="new-collection"
            autoFocus
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("newCollectionPlaceholder")}
            className="h-9 w-40 rounded-full border border-border bg-cream-50 px-3 text-[14px]"
          />
          <Button size="sm" type="submit" disabled={!name.trim()}>
            {t("addCollection")}
          </Button>
        </form>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          {t("newCollection")}
        </Button>
      )}
    </div>
  );
}

function BookCard({ entry, current }: { entry: BookEntry; current: boolean }) {
  const t = useTranslations("Book");
  const format = useFormatter();
  const label = useCollectionLabel();
  return (
    <li>
      <button
        type="button"
        data-book-entry={entry.key}
        aria-current={current ? "true" : undefined}
        onClick={() => useBookView.getState().open(entry.key)}
        onFocus={() => useBookView.getState().setPage(entry.key)}
        onMouseEnter={() => useBookView.getState().setPage(entry.key)}
        className={`flex h-full w-full flex-col gap-1.5 rounded-card border bg-cream-50 p-4 text-left transition-colors hover:bg-cream-100 ${
          current ? "border-saffron-400 shadow-[0_0_0_3px_rgba(244,178,62,0.3)]" : "border-border"
        }`}
      >
        {entry.collection !== ALL && (
          <span className="type-meta text-ink-muted">{label(entry.collection)}</span>
        )}
        <span className="font-display text-lg leading-snug font-semibold text-ink">
          {entry.recipe.title}
        </span>
        <span className="line-clamp-2 text-[14px] text-ink-muted">{entry.recipe.tagline}</span>
        <span className="mt-auto flex items-center justify-between pt-1 text-[12px] text-ink-muted">
          <span>
            {t("savedOn", { date: format.dateTime(entry.savedAt, { dateStyle: "medium" }) })}
          </span>
          {entry.rating && (
            <span className="flex items-center gap-0.5 text-walnut-700">
              <Star weight="fill" aria-hidden className="text-saffron-400" />
              <span className="tabular">{entry.rating}</span>
              <span className="sr-only">{t("stars", { count: entry.rating })}</span>
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/** Recipe Book (R2): the accessible grid; the 3D book on the counter turns to the same page. */
export function RecipeBook() {
  const t = useTranslations("Book");
  const pages = useBookPages();
  const pageKey = useBookView((s) => s.pageKey);
  const openKey = useBookView((s) => s.openKey);
  const opened = pages.find((e) => e.key === openKey) ?? null;
  const index = Math.max(
    0,
    pages.findIndex((e) => e.key === pageKey),
  );

  // Keep the book open at a real page as entries come and go.
  useEffect(() => {
    if (pages.length && !pages.some((e) => e.key === pageKey)) {
      useBookView.getState().setPage(pages[0].key);
    }
  }, [pages, pageKey]);
  // Leaving the page closes any open recipe.
  useEffect(() => () => useBookView.getState().open(null), []);

  const turn = (dir: -1 | 1) => {
    const next = pages[Math.min(pages.length - 1, Math.max(0, index + dir))];
    if (next) useBookView.getState().setPage(next.key);
  };

  if (opened) {
    return (
      <div className="flex flex-col gap-6">
        <RecipeView recipe={opened.recipe} onBack={() => useBookView.getState().open(null)} />
        <BookEntryEditor entry={opened} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <AccountNote />
      <CollectionTabs />
      {pages.length === 0 ? (
        <p className="rounded-chip border border-dashed border-walnut-500/40 px-4 py-6 text-center font-hand text-xl text-walnut-700">
          {t("empty")}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2" data-book-pager>
            <IconButton aria-label={t("prevPage")} onClick={() => turn(-1)} disabled={index === 0}>
              <CaretLeft weight="bold" aria-hidden />
            </IconButton>
            <p aria-live="polite" className="text-[14px] text-ink-muted tabular">
              {t("page", { index: index + 1, count: pages.length })}
            </p>
            <IconButton
              aria-label={t("nextPage")}
              onClick={() => turn(1)}
              disabled={index >= pages.length - 1}
            >
              <CaretRight weight="bold" aria-hidden />
            </IconButton>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pages.map((entry) => (
              <BookCard key={entry.key} entry={entry} current={entry.key === pages[index]?.key} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
