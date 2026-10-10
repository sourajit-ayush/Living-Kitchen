"use client";

import { Check, ShoppingBagOpen } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { getSubstitutes, type Substitute } from "@/data/substitutions";
import type { RecipeIngredient } from "@/lib/ai/schema";
import { normalize } from "@/lib/matchIngredient";
import { formatQuantity } from "@/lib/scale";
import { useList } from "@/store/useList";
import { SubstituteMenu } from "./SubstituteMenu";

export function useFormatAmount() {
  const tu = useTranslations("Units");
  const t = useTranslations("Recipe");
  return (ing: Pick<RecipeIngredient, "quantity" | "unit">) => {
    if (ing.quantity === null || ing.unit === "to-taste") return t("toTaste");
    const unit = tu.has(ing.unit) ? tu(ing.unit, { count: ing.quantity }) : ing.unit;
    return `${formatQuantity(ing.quantity)} ${unit}`.trim();
  };
}

/** Ingredient rows (docs/02 §5): hand-drawn check circle, quantity, name, status, swap. */
export function IngredientList({
  ingredients,
  recipeTitle,
  swaps,
  onSwap,
  checked,
  onToggleChecked,
}: {
  ingredients: RecipeIngredient[];
  recipeTitle: string;
  swaps: Record<number, Substitute>;
  onSwap: (index: number, sub: Substitute | null) => void;
  checked: Set<number>;
  onToggleChecked: (index: number) => void;
}) {
  const t = useTranslations("Recipe");
  const formatAmount = useFormatAmount();
  const listItems = useList((s) => s.items);
  const addToList = useList((s) => s.add);
  const onList = (name: string) => listItems.some((i) => i.key === normalize(name) && !i.deletedAt);

  return (
    <ul className="flex flex-col divide-y divide-border">
      {ingredients.map((ing, i) => {
        const swap = swaps[i];
        const displayName = swap?.name ?? ing.name;
        const amount = formatAmount(ing);
        const isChecked = checked.has(i);
        return (
          <li
            key={`${ing.name}-${i}`}
            className="flex flex-col gap-1 py-2.5"
            data-status={ing.status}
          >
            <div className="flex items-center gap-3">
              <label className="relative inline-flex size-6 shrink-0 cursor-pointer items-center justify-center">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggleChecked(i)}
                  aria-label={t("gotIt", { name: displayName })}
                  className="peer absolute inset-0 cursor-pointer opacity-0"
                />
                {/* hand-drawn circle */}
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  className="size-6 text-walnut-500 peer-focus-visible:text-walnut-900"
                >
                  <path
                    d="M12 2.6c5.4-.2 9.6 4 9.3 9.5-.3 5.2-4.4 9.4-9.6 9.2C6.4 21 2.5 17 2.8 11.8 3 6.7 6.9 2.8 12 2.6Z"
                    fill={isChecked ? "var(--basil-600)" : "none"}
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                </svg>
                {isChecked && (
                  <Check weight="bold" aria-hidden className="absolute size-3.5 text-white" />
                )}
              </label>

              <span className="w-24 shrink-0 text-[15px] text-ink-muted tabular">{amount}</span>

              <span
                className={`min-w-0 flex-1 ${isChecked ? "text-ink-muted line-through" : "text-ink"}`}
              >
                <span className="font-medium">{displayName}</span>
                {ing.prep && <span className="text-[14px] text-ink-muted">, {ing.prep}</span>}
              </span>

              {ing.status === "missing" && (
                <span className="shrink-0 rounded-full border border-dashed border-walnut-700 bg-turmeric-100 px-2 py-0.5 text-xs font-semibold text-walnut-900">
                  {t("need")}
                </span>
              )}
              {ing.status === "optional" && (
                <span className="shrink-0 text-xs text-ink-muted">{t("optional")}</span>
              )}

              {ing.status !== "basic" && (
                <SubstituteMenu
                  name={ing.name}
                  substitutes={getSubstitutes(ing.ingredient_id, ing.substitutes)}
                  onPick={(sub) => onSwap(i, sub)}
                />
              )}
            </div>

            {ing.status === "missing" && !swap && (
              <div className="pl-9">
                {onList(ing.name) ? (
                  <span className="inline-flex items-center gap-1 text-[13px] font-medium text-basil-600">
                    <Check weight="bold" aria-hidden />
                    {t("onList")}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      addToList({ name: ing.name, qty: amount, fromRecipe: recipeTitle })
                    }
                    aria-label={t("addToListLabel", { name: ing.name })}
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-walnut-700 underline-offset-2 hover:underline"
                  >
                    <ShoppingBagOpen aria-hidden />
                    {t("addToList")}
                  </button>
                )}
              </div>
            )}

            {swap && (
              <p
                className="ml-9 rounded-chip bg-turmeric-100 px-3 py-2 text-[13px] text-walnut-900"
                aria-live="polite"
              >
                {t("using", { sub: swap.name, name: ing.name })} {swap.note}{" "}
                <button
                  type="button"
                  onClick={() => onSwap(i, null)}
                  className="font-semibold underline underline-offset-2"
                >
                  {t("undo")}
                </button>
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
