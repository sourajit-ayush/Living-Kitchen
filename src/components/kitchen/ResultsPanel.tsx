"use client";

import { ArrowCounterClockwise, ArrowsClockwise } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import type { Locale } from "@/i18n/routing";
import { useKitchen } from "@/store/useKitchen";
import { Button } from "@/components/ui/Button";
import { RecipeCard } from "./RecipeCard";

export function ResultsPanel() {
  const t = useTranslations("Results");
  const locale = useLocale() as Locale;
  const results = useKitchen((s) => s.results);
  const drinks = useKitchen((s) => s.requestCategory === "drink");
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the results so keyboard and screen-reader users land on them.
  useEffect(() => headingRef.current?.focus({ preventScroll: false }), []);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 ref={headingRef} tabIndex={-1} className="type-h2 text-ink">
          {t(drinks ? "titleDrink" : "title")}
        </h2>
        <p className="mt-1 text-ink-muted">{t("subtitle")}</p>
      </header>
      <ol className="flex flex-col gap-4">
        {results.map((recipe, i) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            index={i}
            onOpen={() => useKitchen.getState().select(recipe.id)}
          />
        ))}
      </ol>
      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="ghost" onClick={() => useKitchen.getState().startOver()}>
          <ArrowCounterClockwise aria-hidden />
          {t("startOver")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void useKitchen.getState().cook(locale, { regenerate: true })}
        >
          <ArrowsClockwise aria-hidden />
          {t("regenerate")}
        </Button>
      </div>
    </div>
  );
}
