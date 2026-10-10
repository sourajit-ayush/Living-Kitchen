"use client";

import { Coffee, CookingPot } from "@phosphor-icons/react";
import type { RecipeCategory } from "@/lib/ai/schema";
import { useTranslations } from "next-intl";

/**
 * The primary "Cook" pill (docs/02 §5). Tomato-500 with white text only passes contrast as
 * large text, so the label is 24px Fraunces.
 */
export function CookButton({
  cooking,
  disabled,
  onClick,
  category = "food",
}: {
  cooking: boolean;
  disabled: boolean;
  onClick: () => void;
  /** Drinks: "Mix" with a cup instead of "Cook" with a pot */
  category?: RecipeCategory;
}) {
  const t = useTranslations("Dock");
  const drink = category === "drink";
  const Icon = drink ? Coffee : CookingPot;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || cooking}
      aria-busy={cooking}
      className="group inline-flex h-14 items-center justify-center gap-3 rounded-full bg-tomato-500 pr-7 pl-5 font-display text-2xl font-semibold text-white shadow-warm transition-[background-color,transform] duration-150 hover:bg-tomato-600 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 max-lg:w-full"
    >
      <span className="relative inline-flex">
        <Icon weight="duotone" className="size-7" aria-hidden />
        {/* idle steam wisp over the pot */}
        <span
          aria-hidden
          className="absolute -top-2 left-1/2 h-3 w-1 -translate-x-1/2 rounded-full bg-white/70 motion-safe:animate-[wisp_2.4s_ease-in-out_infinite]"
        />
      </span>
      {/* Both labels share one grid cell, so the pill keeps the width of the longer one and
          the row around it never reflows when cooking starts or ends (no layout shift). */}
      <span className="grid">
        <span
          aria-hidden={!cooking}
          className={`inline-flex items-center gap-2 [grid-area:1/1] ${cooking ? "" : "invisible"}`}
        >
          {t(drink ? "mixing" : "cooking")}
          <span aria-hidden className="inline-flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-1.5 rounded-full bg-white motion-safe:animate-[bubble_0.9s_ease-in-out_infinite]"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
        </span>
        <span aria-hidden={cooking} className={`[grid-area:1/1] ${cooking ? "invisible" : ""}`}>
          {t(drink ? "mix" : "cook")}
        </span>
      </span>
    </button>
  );
}
