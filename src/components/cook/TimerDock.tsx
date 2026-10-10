"use client";

import { Check, Pause, Play, Plus, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useShallow } from "zustand/react/shallow";
import { formatClock } from "@/lib/timers";
import { remainingMs, useTimers, type CookTimer } from "@/store/useTimers";
import { useNow } from "./useNow";

/**
 * Every timer for this recipe, whichever step started it (F9: several at once, and they survive
 * moving between steps). Each shows its step, time left, pause/resume, +1 min and dismiss.
 */
export function TimerDock({
  recipeId,
  onGoToStep,
}: {
  recipeId: string;
  onGoToStep: (n: number) => void;
}) {
  const t = useTranslations("CookMode");
  const timers = useTimers(useShallow((s) => s.timers.filter((x) => x.recipeId === recipeId)));
  const now = useNow();
  if (timers.length === 0) return null;

  return (
    <section
      aria-label={t("timers")}
      className="flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1"
    >
      {[...timers]
        .sort((a, b) => remainingMs(a, now) - remainingMs(b, now))
        .map((timer) => (
          <DockTimer key={timer.id} timer={timer} now={now} onGoToStep={onGoToStep} />
        ))}
    </section>
  );
}

function DockTimer({
  timer,
  now,
  onGoToStep,
}: {
  timer: CookTimer;
  now: number;
  onGoToStep: (n: number) => void;
}) {
  const t = useTranslations("CookMode");
  const store = useTimers.getState();
  const time = formatClock(remainingMs(timer, now) / 1000);
  const done = timer.status === "done";
  const label = timer.label || t("minutes", { count: Math.round(timer.durationMs / 60000) });
  const iconButton =
    "flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-cream-50/15 focus-visible:outline-2 focus-visible:outline-saffron-400";

  return (
    <div
      data-dock-timer={timer.id}
      data-status={timer.status}
      className={`flex shrink-0 items-center gap-1 rounded-full border py-1 pr-1 pl-3 ${
        done
          ? "border-saffron-400 bg-saffron-400 text-walnut-900 motion-safe:animate-[pulse-soft_1.2s_ease-in-out_infinite]"
          : "border-cream-50/25 bg-walnut-900/70 text-cream-50"
      }`}
    >
      <button
        type="button"
        onClick={() => onGoToStep(timer.stepN)}
        className="flex flex-col items-start rounded-md px-1 text-left leading-tight"
      >
        <span className={`text-xs ${done ? "text-walnut-900" : "text-cream-50/75"}`}>
          {t("timerFromStep", { n: timer.stepN })} · {label}
        </span>
        <span className="font-display text-xl font-semibold tabular" aria-live="off">
          {done ? <Check weight="bold" aria-hidden className="inline size-5" /> : time}
        </span>
      </button>
      {!done && (
        <button
          type="button"
          className={iconButton}
          aria-label={
            timer.status === "running"
              ? t("timerPause", { label, time })
              : t("timerResume", { label, time })
          }
          onClick={() =>
            timer.status === "running" ? store.pause(timer.id) : store.resume(timer.id)
          }
        >
          {timer.status === "running" ? (
            <Pause weight="fill" aria-hidden />
          ) : (
            <Play weight="fill" aria-hidden />
          )}
        </button>
      )}
      <button
        type="button"
        className={iconButton}
        aria-label={t("timerAdd", { label })}
        onClick={() => store.extend(timer.id, 60_000)}
      >
        <Plus weight="bold" aria-hidden />
      </button>
      <button
        type="button"
        className={iconButton}
        aria-label={t("timerDismiss", { label })}
        onClick={() => store.dismiss(timer.id)}
      >
        <X weight="bold" aria-hidden />
      </button>
    </div>
  );
}
