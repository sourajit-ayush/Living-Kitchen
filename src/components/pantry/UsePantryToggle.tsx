"use client";

import { Jar } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { live } from "@/lib/sync/rows";
import { usePantry } from "@/store/usePantry";

/** "Use my pantry" (R1): a real switch, so it reads as on/off to screen readers. */
export function UsePantryToggle({
  className = "",
  compact = false,
}: {
  className?: string;
  /** One line (the dock): the count moves into the label, the hint is for screen readers. */
  compact?: boolean;
}) {
  const t = useTranslations("Pantry");
  const id = useId();
  const on = usePantry((s) => s.useInCooking);
  const count = usePantry((s) => live(s.items).length);
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Jar
        weight="duotone"
        aria-hidden
        className={`shrink-0 text-walnut-700 ${compact ? "size-5" : "size-6"}`}
      />
      <div className="min-w-0 flex-1">
        <label
          htmlFor={id}
          className={`block font-medium text-ink ${compact ? "text-[14px]" : "text-[15px]"}`}
        >
          {t("useInCooking")}
          {compact && <span className="font-normal text-ink-muted tabular"> · {count}</span>}
        </label>
        <p id={`${id}-hint`} className={compact ? "sr-only" : "text-[13px] text-ink-muted"}>
          {t("useInCookingHint", { count })}
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={`${id}-hint`}
        data-use-pantry={on ? "on" : "off"}
        onClick={() => usePantry.getState().setUseInCooking(!on)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${
          on ? "bg-basil-600" : "bg-walnut-500/50"
        }`}
      >
        <span
          aria-hidden
          className={`absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform duration-200 ${
            on ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}
