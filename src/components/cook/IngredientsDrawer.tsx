"use client";

import { Check, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import { useMemo } from "react";
import { scaleRecipe } from "@/lib/scale";
import { useCookbook, type CookEntry } from "@/store/useCookbook";
import { IconButton } from "@/components/ui/Button";
import { useFormatAmount } from "@/components/recipe/IngredientList";

/**
 * The ingredients checklist as a pull-up drawer (F9), scaled to the servings and units chosen in
 * the recipe view. Ticks are remembered with the recipe on this device.
 */
export function IngredientsDrawer({
  entry,
  open,
  onOpenChange,
}: {
  entry: CookEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("CookMode");
  const formatAmount = useFormatAmount();
  const { recipe, servings, unitSystem, checked } = entry;
  const ingredients = useMemo(
    () => scaleRecipe(recipe, servings, unitSystem).ingredients,
    [recipe, servings, unitSystem],
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-walnut-900/40 data-[state=open]:animate-[fade-in_200ms_ease-out]" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[80dvh] w-full max-w-xl flex-col rounded-t-sheet bg-cream-50 shadow-warm focus:outline-none data-[state=open]:animate-[drawer-up_320ms_var(--ease-soft)]">
          <div aria-hidden className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-walnut-500/40" />
          <header className="flex items-start justify-between gap-4 border-b border-border px-6 pt-3 pb-4">
            <div>
              <Dialog.Title className="type-h2 text-ink">{t("ingredients")}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-muted">
                {t("ingredientsFor", { count: servings })}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton aria-label={t("closeIngredients")} className="-mr-2">
                <X aria-hidden />
              </IconButton>
            </Dialog.Close>
          </header>
          <ul className="flex flex-col divide-y divide-border overflow-y-auto px-6 pb-8">
            {ingredients.map((ing, i) => {
              const on = checked.includes(i);
              return (
                <li key={`${ing.name}-${i}`}>
                  <label className="flex cursor-pointer items-center gap-4 py-3 text-lg">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={on}
                      onChange={() => useCookbook.getState().toggleChecked(recipe.id, i)}
                    />
                    <span
                      aria-hidden
                      className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-walnut-500 text-cream-50 peer-checked:border-basil-600 peer-checked:bg-basil-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-saffron-400"
                    >
                      {on && <Check weight="bold" className="size-4" />}
                    </span>
                    <span className={`flex-1 ${on ? "text-ink-muted line-through" : "text-ink"}`}>
                      {ing.name}
                      {ing.prep ? <span className="text-ink-muted">, {ing.prep}</span> : null}
                    </span>
                    <span className="text-base text-ink-muted tabular">{formatAmount(ing)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
