"use client";

import { useTranslations } from "next-intl";
import type { Recipe } from "@/lib/ai/schema";

const R = 42;
const C = 2 * Math.PI * R;

/** F10: 2D donut fallback for the 3D nutrition plate. Segments are share of calories by macro. */
export function NutritionPlate({ nutrition }: { nutrition: Recipe["nutrition"] }) {
  const t = useTranslations("Recipe");
  const macros = [
    {
      key: "protein",
      grams: nutrition.protein_g,
      kcal: nutrition.protein_g * 4,
      color: "var(--basil-600)",
    },
    {
      key: "carbs",
      grams: nutrition.carbs_g,
      kcal: nutrition.carbs_g * 4,
      color: "var(--saffron-400)",
    },
    { key: "fat", grams: nutrition.fat_g, kcal: nutrition.fat_g * 9, color: "var(--tomato-500)" },
  ] as const;
  const total = macros.reduce((s, m) => s + m.kcal, 0) || 1;

  let offset = 0;
  const segments = macros.map((m) => {
    const len = (m.kcal / total) * C;
    const seg = { ...m, len, offset };
    offset += len;
    return seg;
  });

  return (
    <figure className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={t("nutritionSummary", {
          calories: nutrition.calories,
          protein: nutrition.protein_g,
          carbs: nutrition.carbs_g,
          fat: nutrition.fat_g,
          fibre: nutrition.fibre_g,
        })}
        className="size-36 shrink-0 -rotate-90"
      >
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--cream-200)" strokeWidth="12" />
        {segments.map((s) => (
          <circle
            key={s.key}
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth="12"
            strokeDasharray={`${Math.max(0, s.len - 1.5)} ${C}`}
            strokeDashoffset={-s.offset}
            className="motion-safe:animate-[donut-in_900ms_var(--ease-soft)_both]"
          />
        ))}
        <g className="rotate-90" style={{ transformOrigin: "50px 50px" }}>
          <text
            x="50"
            y="49"
            textAnchor="middle"
            className="fill-walnut-900 font-display text-[20px] font-semibold"
          >
            {nutrition.calories}
          </text>
          <text x="50" y="62" textAnchor="middle" className="fill-walnut-700 text-[8px]">
            {t("kcal")}
          </text>
        </g>
      </svg>
      <figcaption className="flex flex-1 flex-col gap-2">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[15px]">
          {macros.map((m) => (
            <div key={m.key} className="flex items-center gap-2">
              <span aria-hidden className="size-3 rounded-full" style={{ background: m.color }} />
              <dt className="text-ink-muted">{t(m.key)}</dt>
              <dd className="ml-auto font-medium text-ink tabular">
                {t("grams", { value: m.grams })}
              </dd>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span aria-hidden className="size-3 rounded-full border border-walnut-500" />
            <dt className="text-ink-muted">{t("fibre")}</dt>
            <dd className="ml-auto font-medium text-ink tabular">
              {t("grams", { value: nutrition.fibre_g })}
            </dd>
          </div>
        </dl>
        {nutrition.tags && nutrition.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {nutrition.tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-cream-200 px-2.5 py-0.5 text-xs font-medium text-walnut-900"
              >
                {tag}
              </li>
            ))}
          </ul>
        )}
      </figcaption>
    </figure>
  );
}
