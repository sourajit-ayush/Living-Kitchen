"use client";

import { ArrowLeft, Check, CookingPot, ShoppingBagOpen } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Substitute } from "@/data/substitutions";
import type { Recipe } from "@/lib/ai/schema";
import { normalize } from "@/lib/matchIngredient";
import { scaleRecipe } from "@/lib/scale";
import { useRouter } from "@/i18n/navigation";
import { useCookbook } from "@/store/useCookbook";
import { useList } from "@/store/useList";
import { usePrefs } from "@/store/usePrefs";
import { Button } from "@/components/ui/Button";
import { SaveRecipeButton } from "@/components/book/SaveRecipeButton";
import { ShareButton } from "./ShareButton";
import { IngredientList, useFormatAmount } from "./IngredientList";
import { NutritionPlate } from "./NutritionPlate";
import { ServingScaler } from "./ServingScaler";
import { StepList } from "./StepList";

/** Full recipe (F5–F8, F10). */
export function RecipeView({
  recipe,
  onBack,
  backLabel,
  topAction,
}: {
  recipe: Recipe;
  onBack: () => void;
  /** Defaults to "Back to ideas" */
  backLabel?: string;
  /** Beside the back button, e.g. "Something else" on Nani's pick */
  topAction?: ReactNode;
}) {
  const t = useTranslations("Recipe");
  const tc = useTranslations("CookMode");
  const router = useRouter();
  const unitSystem = usePrefs((s) => s.unitSystem);
  const setUnitSystem = usePrefs((s) => s.setUnitSystem);
  const [servings, setServings] = useState(() => usePrefs.getState().prefs.servings);
  const [swaps, setSwaps] = useState<Record<number, Substitute>>({});
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const titleRef = useRef<HTMLHeadingElement>(null);
  const listItems = useList((s) => s.items);
  const addToList = useList((s) => s.add);
  const formatAmount = useFormatAmount();

  useEffect(() => titleRef.current?.focus(), [recipe.id]);

  const scaled = useMemo(
    () => scaleRecipe(recipe, servings, unitSystem),
    [recipe, servings, unitSystem],
  );
  const missing = scaled.ingredients
    .map((ing, i) => ({ ing, i }))
    .filter(({ ing, i }) => ing.status === "missing" && !swaps[i]);
  const allMissingOnList = missing.every(({ ing }) =>
    listItems.some((l) => l.key === normalize(ing.name) && !l.deletedAt),
  );

  return (
    <article className="flex flex-col gap-6" aria-labelledby="recipe-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft aria-hidden />
          {backLabel ?? t("back")}
        </Button>
        {topAction}
      </div>

      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h2 id="recipe-title" ref={titleRef} tabIndex={-1} className="type-h1 text-ink">
            {recipe.title}
          </h2>
          <div className="flex shrink-0 gap-2">
            <ShareButton recipe={recipe} />
            <SaveRecipeButton recipe={recipe} />
          </div>
        </div>
        <p className="type-body text-ink-muted">{recipe.tagline}</p>
        {(recipe.category === "drink" || recipe.contains_alcohol) && (
          <ul className="flex flex-wrap gap-2" data-recipe-badges>
            {recipe.category === "drink" && (
              <li className="rounded-full bg-cream-200 px-3 py-1 text-[13px] text-walnut-900">
                {t("drink")}
              </li>
            )}
            {recipe.contains_alcohol && (
              <li className="rounded-full bg-chilli-700 px-3 py-1 text-[13px] font-medium text-white">
                {t("alcohol")}
              </li>
            )}
          </ul>
        )}
        <dl className="mt-1 grid grid-cols-3 gap-3 rounded-card border border-border p-3 text-center sm:grid-cols-5">
          {[
            [t("prep"), `${recipe.prep_minutes}′`],
            [t("cook"), `${recipe.cook_minutes}′`],
            [t("total"), `${recipe.prep_minutes + recipe.cook_minutes}′`],
            [t("difficulty"), t(`difficulties.${recipe.difficulty}`)],
            [
              recipe.cuisine,
              <>
                <span aria-hidden>{"🌶️".repeat(recipe.spice_level) || "–"}</span>
                <span className="sr-only">{t("spice", { value: recipe.spice_level })}</span>
              </>,
            ],
          ].map(([label, value], i) => (
            <div key={i} className="flex flex-col">
              <dt className="type-meta text-ink-muted">{label}</dt>
              <dd className="font-display text-lg font-semibold text-ink tabular">{value}</dd>
            </div>
          ))}
        </dl>
        {recipe.missing_summary && (
          <p className="rounded-chip bg-turmeric-100 px-3 py-2 text-walnut-900">
            {recipe.missing_summary}
          </p>
        )}
      </header>

      <Button
        variant="primary"
        size="lg"
        className="self-start"
        onClick={() => {
          // Cook Mode reads the recipe from this device, at the servings and units chosen here.
          useCookbook.getState().open(recipe, servings, unitSystem);
          router.push(`/cook/${encodeURIComponent(recipe.id)}`);
        }}
      >
        <CookingPot weight="duotone" aria-hidden className="size-6" />
        {tc("start")}
      </Button>

      <ServingScaler
        servings={servings}
        onServings={setServings}
        unitSystem={unitSystem}
        onUnitSystem={setUnitSystem}
      />

      <section aria-labelledby="ingredients-title" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="ingredients-title" className="type-h2 text-ink">
            {t("ingredients")}
          </h3>
          {missing.length > 0 &&
            (allMissingOnList ? (
              <span className="inline-flex items-center gap-1 text-[13px] font-medium text-basil-600">
                <Check weight="bold" aria-hidden />
                {t("allMissingAdded")}
              </span>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  missing.forEach(({ ing }) =>
                    addToList({ name: ing.name, qty: formatAmount(ing), fromRecipe: recipe.title }),
                  )
                }
              >
                <ShoppingBagOpen aria-hidden />
                {t("addAllMissing")}
              </Button>
            ))}
        </div>
        <IngredientList
          ingredients={scaled.ingredients}
          recipeTitle={recipe.title}
          swaps={swaps}
          onSwap={(i, sub) =>
            setSwaps((prev) => {
              const next = { ...prev };
              if (sub) next[i] = sub;
              else delete next[i];
              return next;
            })
          }
          checked={checked}
          onToggleChecked={(i) =>
            setChecked((prev) => {
              const next = new Set(prev);
              if (next.has(i)) next.delete(i);
              else next.add(i);
              return next;
            })
          }
        />
      </section>

      <section aria-labelledby="method-title" className="flex flex-col gap-4">
        <h3 id="method-title" className="type-h2 text-ink">
          {t("method")}
        </h3>
        <StepList steps={recipe.steps} />
      </section>

      <section aria-labelledby="nutrition-title" className="flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          <h3 id="nutrition-title" className="type-h2 text-ink">
            {t("nutrition")}
          </h3>
          <span className="rounded-full bg-cream-200 px-2 py-0.5 text-xs font-medium text-walnut-900">
            {t("estimated")}
          </span>
        </div>
        <NutritionPlate nutrition={recipe.nutrition} />
      </section>

      {recipe.tips.length > 0 && (
        <section aria-labelledby="tips-title" className="rounded-card bg-turmeric-100 p-5">
          <h3 id="tips-title" className="font-hand text-2xl font-semibold text-walnut-900">
            {t("tips")}
          </h3>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-walnut-900">
            {recipe.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
