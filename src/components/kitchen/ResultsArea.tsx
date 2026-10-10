"use client";

import { AnimatePresence, m } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { useEffect, useRef } from "react";
import { useKitchen } from "@/store/useKitchen";
import { RecipeView } from "@/components/recipe/RecipeView";
import { Button } from "@/components/ui/Button";
import { Shuffle } from "@phosphor-icons/react";
import { CookingStatus } from "./CookingStatus";
import { ErrorState } from "./ErrorState";
import { ResultsPanel } from "./ResultsPanel";

/** Right-hand panel on desktop (min(560px, 44vw)); stacks under the dock on mobile. */
export function ResultsArea() {
  const t = useTranslations("Results");
  const phase = useKitchen((s) => s.phase);
  // One recipe (a named dish, tonight's pick): its back button goes to the kitchen.
  const dishMode = useKitchen((s) => s.mode !== "ingredients");
  const tr = useTranslations("Recipe");
  const tt = useTranslations("Tonight");
  const tonight = useKitchen((s) => s.mode === "tonight");
  const selected = useKitchen((s) => s.results.find((r) => r.id === s.selectedId) ?? null);
  const panelRef = useRef<HTMLElement>(null);
  const locale = useLocale() as Locale;

  // Switching language with recipes on screen (or cooking) re-cooks them in the new language.
  useEffect(() => useKitchen.getState().syncLocale(locale), [locale]);

  // On narrow screens the panel sits below the dock; bring it into view when something happens.
  useEffect(() => {
    if (phase !== "idle" && window.matchMedia("(max-width: 1023px)").matches) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (phase === "recipe" || phase === "results") panelRef.current?.scrollTo({ top: 0 });
  }, [phase]);

  if (phase === "idle") return null;
  // While the pot bubbles and the recipes rise, desktop shows only a small status pill at the
  // bottom instead of the full panel, so the stove stays in view.
  const compact = phase === "cooking" || phase === "revealing";

  return (
    // The recipes are the page's main content (a named region), not a side note (complementary).
    <section
      ref={panelRef}
      aria-label={t("panel")}
      data-compact={compact || undefined}
      className={`scroll-mt-20 rounded-card border-t border-border pt-5 lg:fixed lg:z-10 lg:rounded-sheet lg:border-0 lg:glass ${
        compact
          ? "lg:bottom-6 lg:left-1/2 lg:w-[min(440px,calc(100vw-4rem))] lg:-translate-x-1/2 lg:animate-[fade-in_300ms_ease-out] lg:px-6 lg:py-4"
          : "lg:top-20 lg:right-6 lg:bottom-6 lg:w-[min(560px,44vw)] lg:animate-[panel-in_420ms_var(--ease-soft)] lg:overflow-y-auto lg:p-7"
      }`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          // cooking → revealing keeps the same status card (no remount flash)
          key={
            phase === "recipe"
              ? `recipe-${selected?.id}`
              : phase === "revealing"
                ? "cooking"
                : phase
          }
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
        >
          {(phase === "cooking" || phase === "revealing") && <CookingStatus />}
          {phase === "error" && <ErrorState />}
          {phase === "results" && <ResultsPanel />}
          {phase === "recipe" && selected && (
            <RecipeView
              recipe={selected}
              // A named dish has no list of ideas to go back to: back to the counter instead.
              onBack={() =>
                dishMode ? useKitchen.getState().startOver() : useKitchen.getState().backToResults()
              }
              backLabel={dishMode ? tr("backToKitchen") : undefined}
              topAction={
                tonight ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void useKitchen.getState().cookTonight(locale)}
                  >
                    <Shuffle aria-hidden />
                    {tt("again")}
                  </Button>
                ) : undefined
              }
            />
          )}
        </m.div>
      </AnimatePresence>
    </section>
  );
}
