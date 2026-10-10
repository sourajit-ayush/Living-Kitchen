"use client";

import { Timer } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import type { RecipeStep } from "@/lib/ai/schema";

/** Step cards (docs/02 §5). Timer chips are display-only until Cook Mode (Phase 4). */
export function StepList({ steps }: { steps: RecipeStep[] }) {
  const t = useTranslations("Recipe");
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((step) => (
        <li key={step.n} className="flex gap-4">
          {/* Number on a saffron disc: saffron text on cream would fail contrast. */}
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-saffron-400 font-display text-xl font-semibold text-walnut-900 italic"
          >
            {step.n}
          </span>
          <div className="flex flex-col gap-2 pt-1.5">
            <p className="type-body text-ink">
              <span className="sr-only">{t("step", { n: step.n })}: </span>
              {step.text}
            </p>
            {step.timer_minutes ? (
              <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-border bg-cream-50 px-2.5 py-1 text-[13px] font-medium text-walnut-700 tabular">
                <Timer aria-hidden className="size-4" />
                {t("timer", { count: step.timer_minutes })}
              </span>
            ) : null}
            {step.tip && (
              <p className="font-hand text-xl leading-snug text-walnut-700">
                <span className="font-semibold">{t("tip")}:</span> {step.tip}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
