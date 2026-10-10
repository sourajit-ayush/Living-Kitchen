"use client";

import { Minus, Plus } from "@phosphor-icons/react";
import { IconButton } from "./Button";

/** Number stepper with a live value; used for servings. Labelled by an element the caller renders. */
export function Stepper({
  labelledBy,
  value,
  min,
  max,
  onChange,
  decreaseLabel,
  increaseLabel,
}: {
  labelledBy: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
}) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex items-center gap-1">
      <IconButton
        size="sm"
        aria-label={decreaseLabel}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="border border-border bg-surface"
      >
        <Minus weight="bold" aria-hidden />
      </IconButton>
      <output aria-live="polite" className="w-8 text-center text-lg font-semibold text-ink tabular">
        {value}
      </output>
      <IconButton
        size="sm"
        aria-label={increaseLabel}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="border border-border bg-surface"
      >
        <Plus weight="bold" aria-hidden />
      </IconButton>
    </div>
  );
}
