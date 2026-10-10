"use client";

import { Coffee, CookingPot } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useKitchen } from "@/store/useKitchen";
import { Button } from "@/components/ui/Button";

/** 2D stand-in for the bubbling pot (Phase 3 drives the 3D pot from the same `progress`). */
export function CookingStatus() {
  const t = useTranslations("Cooking");
  const progress = useKitchen((s) => s.progress);
  const line = useKitchen((s) => s.loadingLine);
  const plating = useKitchen((s) => s.phase === "revealing");
  const drink = useKitchen((s) => s.category === "drink");
  const pct = Math.round(progress * 100);

  return (
    // Mobile: a centred card in the sheet. Desktop: a compact pill (the 3D pot is the show).
    <div className="flex flex-col items-center gap-5 py-10 text-center lg:grid lg:grid-cols-[auto_1fr_auto] lg:items-center lg:gap-x-4 lg:gap-y-2 lg:py-0 lg:text-left">
      <div className="relative lg:row-span-2">
        {drink ? (
          <Coffee weight="duotone" className="size-20 text-walnut-700 lg:size-10" aria-hidden />
        ) : (
          <CookingPot weight="duotone" className="size-20 text-walnut-700 lg:size-10" aria-hidden />
        )}
        <span
          aria-hidden
          className="absolute -top-3 left-1/2 flex -translate-x-1/2 gap-1.5 lg:hidden"
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-5 w-1.5 rounded-full bg-walnut-500/40 motion-safe:animate-[wisp_1.8s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
          ))}
        </span>
      </div>
      <div className="lg:min-w-0">
        <h2 className="type-h2 text-ink lg:sr-only">{t(drink ? "titleDrink" : "title")}</h2>
        <p
          aria-live="polite"
          className="min-h-[1.6em] font-hand text-2xl text-walnut-700 lg:truncate lg:text-xl"
        >
          {plating
            ? t(drink ? "pouring" : "plating")
            : (line ?? t(drink ? "fallbackLineDrink" : "fallbackLine"))}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label={t("progress")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-cream-200 lg:col-start-2 lg:row-start-2 lg:max-w-none"
      >
        <div
          className="h-full rounded-full bg-saffron-400 transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
      {/* Hidden, not removed, while plating: keeps the panel height steady (no layout jank). */}
      <div
        className={`lg:col-start-3 lg:row-span-2 lg:row-start-1 ${plating ? "invisible" : ""}`}
        aria-hidden={plating || undefined}
      >
        <Button variant="ghost" size="sm" onClick={() => useKitchen.getState().cancel()}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
