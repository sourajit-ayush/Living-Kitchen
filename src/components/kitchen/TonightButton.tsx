"use client";

import { ForkKnife } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/routing";
import type { Meal } from "@/lib/ai/schema";
import { useKitchen } from "@/store/useKitchen";
import { usePantry } from "@/store/usePantry";
import { mealForHour, usePrefs } from "@/store/usePrefs";
import { useScene } from "@/store/useScene";
import { live } from "@/lib/sync/rows";
import { Button } from "@/components/ui/Button";

/**
 * "What's for dinner?" (one tap, no typing): Nani picks one dish from the pantry and whatever is
 * on the counter, for this time of day, and opens it. Asking again suggests something else.
 * Lives under the hero; on desktop it steps back with the hero once the counter is in use.
 */
export function TonightButton() {
  const t = useTranslations("Tonight");
  const locale = useLocale() as Locale;
  const phase = useKitchen((s) => s.phase);
  const quiet = useKitchen((s) => s.ingredients.length > 0 || s.phase !== "idle");
  const drinks = useKitchen((s) => s.category === "drink");
  const mealOverride = usePrefs((s) => s.mealOverride);
  const pantryCount = usePantry((s) => live(s.items).length);
  // The meal follows the clock, which the server can't know: label it after mount.
  const [hourMeal, setHourMeal] = useState<Meal | null>(null);
  useEffect(() => setHourMeal(mealForHour(new Date().getHours())), []);
  const meal = mealOverride ?? hourMeal;
  const busy = phase === "cooking" || phase === "revealing";

  return (
    <div
      data-tonight
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 transition-opacity duration-300 lg:pointer-events-auto lg:flex-col lg:items-start ${
        meal ? "opacity-100" : "opacity-0"
      } ${quiet ? "lg:invisible" : ""}`}
    >
      <Button
        variant="secondary"
        disabled={busy || !meal}
        onClick={() => {
          useScene.getState().wantPhysics();
          void useKitchen.getState().cookTonight(locale);
        }}
      >
        <ForkKnife weight="duotone" aria-hidden className="size-5 text-walnut-700" />
        {drinks ? t("buttonDrink") : t("button", { meal: meal ?? "dinner" })}
      </Button>
      <p className="text-[13px] text-ink-muted lg:max-w-[19rem]">
        {pantryCount > 0 ? t("hint", { count: pantryCount }) : t("hintEmpty")}
      </p>
    </div>
  );
}
