"use client";

import { Clock, Fire, Users } from "@phosphor-icons/react";
import { m } from "framer-motion";
import { useTranslations } from "next-intl";
import type { Recipe } from "@/lib/ai/schema";

const BADGE: Record<Recipe["kind"], string> = {
  best_match: "bg-basil-600 text-white",
  almost_there: "border border-dashed border-walnut-700 bg-turmeric-100 text-walnut-900",
  wildcard: "bg-walnut-900 text-cream-50",
};

/** Results card (docs/02 §5). Rises in blurred and sharpens, fanning out slightly. */
export function RecipeCard({
  recipe,
  index,
  onOpen,
}: {
  recipe: Recipe;
  index: number;
  onOpen: () => void;
}) {
  const t = useTranslations("Results");
  const tr = useTranslations("Recipe");
  const missing = recipe.ingredients.filter((i) => i.status === "missing").length;
  const tilt = [-1.5, 0, 1.5][index] ?? 0;

  return (
    <m.li
      initial={{ opacity: 0, y: 40, filter: "blur(12px)", rotate: 0 }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)", rotate: tilt }}
      transition={{ type: "spring", stiffness: 200, damping: 24, delay: index * 0.12 }}
      whileHover={{ rotate: 0, y: -4 }}
    >
      <article className="relative flex flex-col gap-3 rounded-card p-5 glass">
        <span
          className={`self-start rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE[recipe.kind]}`}
        >
          {recipe.kind === "almost_there"
            ? t("kinds.almost_there", { count: missing })
            : t(`kinds.${recipe.kind}`)}
        </span>
        <h3 className="font-display text-2xl leading-tight font-semibold text-ink">
          {/* The whole card is clickable via this stretched button. */}
          <button
            type="button"
            onClick={onOpen}
            className="text-left after:absolute after:inset-0 after:rounded-card after:content-['']"
          >
            {recipe.title}
          </button>
        </h3>
        <p className="text-[15px] leading-relaxed text-ink-muted">{recipe.tagline}</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 type-meta text-ink-muted">
          <li className="inline-flex items-center gap-1.5">
            <Clock aria-hidden className="size-4" />
            <span className="tabular">
              {t("minutes", { count: recipe.prep_minutes + recipe.cook_minutes })}
            </span>
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Fire aria-hidden className="size-4" />
            {tr(`difficulties.${recipe.difficulty}`)}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Users aria-hidden className="size-4" />
            {t("servings", { count: recipe.servings })}
          </li>
        </ul>
        {recipe.missing_summary && (
          <p className="rounded-chip bg-turmeric-100 px-3 py-2 text-sm text-walnut-900">
            {recipe.missing_summary}
          </p>
        )}
        {recipe.uses_up.length > 0 && (
          <p className="text-sm font-medium text-basil-600">
            {t("usesUp", { items: recipe.uses_up.join(", ") })}
          </p>
        )}
      </article>
    </m.li>
  );
}
