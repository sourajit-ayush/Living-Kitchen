"use client";

import { Clock, Jar, X } from "@phosphor-icons/react";
import { m } from "framer-motion";
import { useTranslations } from "next-intl";
import { forwardRef } from "react";
import { INGREDIENTS_BY_ID, isLeftover } from "@/data/ingredients";
import type { Locale } from "@/i18n/routing";
import type { KitchenIngredient } from "@/store/useKitchen";
import { useScene } from "@/store/useScene";
import { usePantry } from "@/store/usePantry";

export function ingredientLabel(ing: KitchenIngredient, locale: Locale) {
  return (ing.id && INGREDIENTS_BY_ID.get(ing.id)?.names[locale]) || ing.name;
}

/** Ingredient chip (docs/02 §5): emoji, name, optional qty, expiring toggle, remove. */
export const IngredientChip = forwardRef<
  HTMLLIElement,
  {
    ingredient: KitchenIngredient;
    locale: Locale;
    onRemove: () => void;
    onToggleExpiring: () => void;
  }
>(function IngredientChip({ ingredient, locale, onRemove, onToggleExpiring }, ref) {
  const t = useTranslations("Dock");
  const tp = useTranslations("Pantry");
  const inPantry = usePantry((s) => s.items.some((i) => i.key === ingredient.key && !i.deletedAt));
  const label = ingredientLabel(ingredient, locale);
  // Two-way highlight with the 3D object (docs/03 §8): chip hover/focus ↔ object hover.
  const highlighted = useScene((s) => s.highlighted === ingredient.key);
  const highlight = (on: boolean) => {
    const scene = useScene.getState();
    if (on) scene.setHighlighted(ingredient.key);
    else if (scene.highlighted === ingredient.key) scene.setHighlighted(null);
  };

  return (
    <m.li
      ref={ref}
      initial={{ opacity: 0, y: -14, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.18 } }}
      className={`flex items-center gap-1.5 rounded-chip border bg-cream-100 py-1 pr-1 pl-2.5 text-ink shadow-pill transition-[outline-color] data-[highlighted]:outline-2 data-[highlighted]:outline-offset-2 data-[highlighted]:outline-saffron-400 ${
        ingredient.expiring
          ? "border-saffron-400 shadow-[0_0_0_3px_rgba(244,178,62,0.35)]"
          : "border-border"
      }`}
      data-ingredient={ingredient.key}
      data-highlighted={highlighted || undefined}
      onMouseEnter={() => highlight(true)}
      onMouseLeave={() => highlight(false)}
      onFocus={() => highlight(true)}
      onBlur={() => highlight(false)}
    >
      <span aria-hidden className="text-lg leading-none">
        {ingredient.emoji}
      </span>
      <span className="text-[15px] font-medium">{label}</span>
      {isLeftover(ingredient.id) && (
        <span className="rounded-full bg-turmeric-100 px-1.5 text-[11px] font-medium text-walnut-900">
          {t("leftoverTag")}
        </span>
      )}
      {ingredient.qty && (
        <span className="text-[13px] text-ink-muted tabular">{ingredient.qty}</span>
      )}
      {!ingredient.id && <span className="sr-only">{`(${t("unknown")})`}</span>}
      <button
        type="button"
        aria-pressed={!!ingredient.expiring}
        aria-label={t("markExpiring", { name: label })}
        title={t("expiring")}
        onClick={onToggleExpiring}
        className={`ml-0.5 inline-flex size-7 items-center justify-center rounded-full transition-colors hover:bg-cream-200 ${
          ingredient.expiring ? "text-walnut-900" : "text-walnut-500"
        }`}
      >
        <Clock weight={ingredient.expiring ? "fill" : "regular"} aria-hidden />
      </button>
      {/* R1 quick edit: keep this one in the pantry */}
      <button
        type="button"
        aria-pressed={inPantry}
        aria-label={tp("save", { name: label })}
        title={inPantry ? tp("saved", { name: label }) : tp("save", { name: label })}
        onClick={() =>
          inPantry
            ? usePantry.getState().remove(ingredient.key)
            : usePantry.getState().add([{ id: ingredient.id, name: ingredient.name }])
        }
        className={`inline-flex size-7 items-center justify-center rounded-full transition-colors hover:bg-cream-200 ${
          inPantry ? "text-basil-600" : "text-walnut-500"
        }`}
      >
        <Jar weight={inPantry ? "fill" : "regular"} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={t("remove", { name: label })}
        onClick={onRemove}
        className="inline-flex size-7 items-center justify-center rounded-full text-walnut-700 transition-colors hover:bg-cream-200"
      >
        <X weight="bold" aria-hidden />
      </button>
    </m.li>
  );
});
