"use client";

import { Heart } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Recipe } from "@/lib/ai/schema";
import { bookKey, useBook } from "@/store/useBook";

const LEAVES = ["🌿", "🍃", "🌱", "🌿", "🍃", "🌿", "🌱", "🍃"];

/** Heart toggle (R2) with a small burst of herbs when a recipe is saved. */
export function SaveRecipeButton({ recipe }: { recipe: Recipe }) {
  const t = useTranslations("Book");
  const key = bookKey(recipe);
  const saved = useBook((s) => s.entries.some((e) => e.key === key && !e.deletedAt));
  const [burst, setBurst] = useState(0);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-pressed={saved}
        aria-label={saved ? t("unsave") : t("save")}
        title={saved ? t("saved") : t("save")}
        data-save-recipe={saved ? "saved" : "not-saved"}
        onClick={() => {
          if (saved) useBook.getState().unsave(key);
          else {
            useBook.getState().save(recipe);
            setBurst((b) => b + 1);
          }
        }}
        className={`inline-flex size-12 items-center justify-center rounded-full border transition-[background-color,transform] duration-150 active:scale-90 ${
          saved
            ? "border-tomato-600 bg-tomato-600 text-white"
            : "border-border bg-cream-50 text-tomato-600 hover:bg-cream-200"
        }`}
      >
        <Heart weight={saved ? "fill" : "bold"} aria-hidden className="size-6" />
      </button>
      {burst > 0 && (
        // Herb confetti: pure CSS, skipped entirely with reduced motion.
        <span
          key={burst}
          aria-hidden
          className="pointer-events-none absolute inset-0 motion-reduce:hidden"
        >
          {LEAVES.map((leaf, i) => (
            <span
              key={i}
              className="absolute top-1/2 left-1/2 animate-[herb-burst_700ms_ease-out_forwards] text-base"
              style={
                {
                  "--a": `${(i / LEAVES.length) * 360 + 10}deg`,
                  "--d": `${34 + (i % 3) * 8}px`,
                } as React.CSSProperties
              }
            >
              {leaf}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
