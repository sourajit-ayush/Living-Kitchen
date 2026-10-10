"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { Locale } from "@/i18n/routing";
import { useKitchen } from "@/store/useKitchen";
import { Button } from "@/components/ui/Button";

/**
 * "Name a dish": type Chilli Chicken (or Masala Chai) and Nani writes that one recipe, with what
 * to buy and every step. Whatever is on the counter or in the pantry is marked as ready.
 */
export function DishForm({ busy }: { busy: boolean }) {
  const t = useTranslations("Dock");
  const locale = useLocale() as Locale;
  const category = useKitchen((s) => s.category);
  const [dish, setDish] = useState("");
  const [error, setError] = useState("");
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const ideas = t.raw(category === "drink" ? "dishIdeasDrink" : "dishIdeasFood") as string[];

  const submit = (name = dish) => {
    if (name.trim().length < 2) {
      setError(t("dishTooShort"));
      return;
    }
    setError("");
    void useKitchen.getState().cookDish(locale, name);
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={inputId} className="type-h3 text-ink">
        {t("dishLabel")}
      </label>
      <div className="flex gap-2 max-sm:flex-col">
        <input
          id={inputId}
          value={dish}
          onChange={(e) => {
            setDish(e.target.value);
            if (error) setError("");
          }}
          placeholder={t(category === "drink" ? "dishPlaceholderDrink" : "dishPlaceholderFood")}
          maxLength={80}
          autoComplete="off"
          enterKeyHint="go"
          aria-describedby={`${hintId}${error ? ` ${errorId}` : ""}`}
          aria-invalid={error ? true : undefined}
          className="h-12 w-full min-w-0 shrink-0 rounded-control border border-border bg-surface px-4 text-[16px] text-ink placeholder:text-ink-muted focus:border-walnut-700 focus:outline-2 focus:outline-offset-1 focus:outline-ink sm:flex-1"
        />
        <Button type="submit" variant="primary" size="md" className="h-12" disabled={busy}>
          <MagnifyingGlass weight="bold" aria-hidden className="size-4.5" />
          {t("dishSubmit")}
        </Button>
      </div>
      {error && (
        <p id={errorId} className="text-[13px] text-chilli-700">
          {error}
        </p>
      )}
      <p id={hintId} className="text-[13px] text-ink-muted">
        {t("dishHint")}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="type-meta text-ink-muted">{t("dishIdeas")}:</span>
        {ideas.map((idea) => (
          <button
            key={idea}
            type="button"
            disabled={busy}
            onClick={() => {
              setDish(idea);
              submit(idea);
            }}
            className="rounded-full border border-border bg-cream-50 px-2.5 py-1 text-[13px] text-ink transition-colors duration-150 hover:bg-cream-200 disabled:opacity-50"
          >
            {idea}
          </button>
        ))}
      </div>
    </form>
  );
}
