"use client";

import { Check, Pause, Play } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { primeAudio } from "@/lib/sound";
import { formatClock } from "@/lib/timers";
import { remainingMs, useTimers } from "@/store/useTimers";
import { useNow } from "./useNow";

/** Progress ring around the chip icon (docs/02 §5 "timer chip"). */
function Ring({ fraction }: { fraction: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 24 24" className="absolute inset-0 size-full -rotate-90" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2.5"
      />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fraction)}
      />
    </svg>
  );
}

/**
 * An inline timer chip in a Cook Mode step: the step's own words ("3 minutes") as a pill. Tap to
 * start; tap again to pause or resume; a finished timer pulses until tapped away.
 */
export function TimerChip({
  id,
  recipeId,
  stepN,
  label,
  seconds,
}: {
  id: string;
  recipeId: string;
  stepN: number;
  label: string;
  seconds: number;
}) {
  const t = useTranslations("CookMode");
  const timer = useTimers((s) => s.timers.find((x) => x.id === id));
  const now = useNow();
  const left = timer ? remainingMs(timer, now) : seconds * 1000;
  const time = formatClock(left / 1000);
  const fraction = timer ? left / timer.durationMs : 1;
  const status = timer?.status ?? "idle";

  const onClick = () => {
    const store = useTimers.getState();
    if (status === "idle") {
      primeAudio(); // inside the tap, so the alarm may ring later
      store.start({ id, recipeId, stepN, label, durationMs: seconds * 1000 });
    } else if (status === "running") store.pause(id);
    else if (status === "paused") store.resume(id);
    else store.dismiss(id);
  };

  const aria =
    status === "idle"
      ? t("timerStart", { label })
      : status === "running"
        ? t("timerPause", { label, time })
        : status === "paused"
          ? t("timerResume", { label, time })
          : t("timerDismiss", { label });

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      data-timer={id}
      data-status={status}
      className={`mx-0.5 inline-flex translate-y-[-0.08em] items-center gap-2 rounded-full border px-3 py-0.5 align-middle font-medium tabular transition-colors duration-150 ${
        status === "done"
          ? "border-saffron-400 bg-saffron-400 text-walnut-900 motion-safe:animate-[pulse-soft_1.2s_ease-in-out_infinite]"
          : status === "idle"
            ? "border-saffron-400/70 bg-saffron-400/15 text-cream-50 hover:bg-saffron-400/30"
            : "border-saffron-400 bg-walnut-900/60 text-saffron-400"
      }`}
    >
      <span className="relative inline-flex size-6 items-center justify-center">
        {status !== "idle" && status !== "done" && <Ring fraction={fraction} />}
        {status === "idle" ? (
          <Play weight="fill" className="size-3.5" aria-hidden />
        ) : status === "running" ? (
          <Pause weight="fill" className="size-3" aria-hidden />
        ) : status === "paused" ? (
          <Play weight="fill" className="size-3" aria-hidden />
        ) : (
          <Check weight="bold" className="size-4" aria-hidden />
        )}
      </span>
      <span>{status === "idle" ? label : time}</span>
    </button>
  );
}
