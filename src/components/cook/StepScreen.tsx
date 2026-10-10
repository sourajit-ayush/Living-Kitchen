"use client";

import { useTranslations } from "next-intl";
import { Fragment, useMemo } from "react";
import type { RecipeStep } from "@/lib/ai/schema";
import { stepTimers } from "@/lib/timers";
import { timerId } from "@/store/useTimers";
import { TimerChip } from "./TimerChip";

/**
 * One Cook Mode step (F9, docs/02 §5 "step card"): a big saffron step number, the text at 28 px+
 * and the step's own duration words turned into tappable timer chips in place. A timer the model
 * gave without words in the text ("timer_minutes") gets a chip below.
 */
export function StepScreen({
  recipeId,
  step,
  total,
}: {
  recipeId: string;
  step: RecipeStep;
  total: number;
}) {
  const t = useTranslations("CookMode");
  const tr = useTranslations("Recipe");
  const timers = useMemo(() => stepTimers(step), [step]);

  const pieces: React.ReactNode[] = [];
  let at = 0;
  timers.forEach((timer, i) => {
    if (timer.start < 0) return;
    pieces.push(<Fragment key={`t${i}`}>{step.text.slice(at, timer.start)}</Fragment>);
    pieces.push(
      <TimerChip
        key={`c${i}`}
        id={timerId(recipeId, step.n, i)}
        recipeId={recipeId}
        stepN={step.n}
        label={timer.label}
        seconds={timer.seconds}
      />,
    );
    at = timer.end;
  });
  pieces.push(<Fragment key="rest">{step.text.slice(at)}</Fragment>);
  const extra = timers.map((timer, i) => ({ timer, i })).filter(({ timer }) => timer.start < 0);

  return (
    <div className="flex flex-col gap-6">
      <p
        aria-hidden
        className="font-display text-7xl leading-none font-semibold text-saffron-400 italic tabular"
      >
        {step.n}
      </p>
      <h2 className="sr-only">{t("stepOf", { n: step.n, total })}</h2>
      <p
        data-step-text
        className="max-w-[34ch] text-[28px] leading-[40px] font-medium text-cream-50 sm:text-[34px] sm:leading-[48px]"
      >
        {pieces}
      </p>
      {extra.length > 0 && (
        <p className="flex flex-wrap gap-2 text-[22px]">
          {extra.map(({ timer, i }) => (
            <TimerChip
              key={i}
              id={timerId(recipeId, step.n, i)}
              recipeId={recipeId}
              stepN={step.n}
              label={t("minutes", { count: Math.round(timer.seconds / 60) })}
              seconds={timer.seconds}
            />
          ))}
        </p>
      )}
      {step.tip && (
        <p className="max-w-[40ch] font-hand text-2xl leading-snug text-cream-50/85">
          <span className="font-semibold text-saffron-400">{tr("tip")}:</span> {step.tip}
        </p>
      )}
    </div>
  );
}
