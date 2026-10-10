"use client";

import { useState } from "react";
import { useKitchen } from "@/store/useKitchen";
import { BottomSheet, type SheetSnap } from "@/components/ui/BottomSheet";
import { IngredientDock } from "./IngredientDock";
import { ResultsArea } from "./ResultsArea";
import { SurprisePanel } from "./SurprisePanel";
import { TonightButton } from "./TonightButton";
import { useStage } from "./useStage";

/**
 * Floating UI over the scene (docs/02 §4).
 * Desktop: hero top-left (steps back once the counter has things on it), dock bottom-centre,
 * results panel sliding in from the right. Mobile: everything lives in the bottom sheet.
 */
export function KitchenLayout({ hero }: { hero: React.ReactNode }) {
  const phase = useKitchen((s) => s.phase);
  const hasIngredients = useKitchen((s) => s.ingredients.length > 0);
  // Coming back from Cook Mode remounts the kitchen with a recipe open: start fully open then.
  const [snap, setSnap] = useState<SheetSnap>(() =>
    phase === "results" || phase === "recipe" || phase === "error" ? "full" : "half",
  );

  // Open the sheet fully for results/recipes/errors; drop to half while cooking so the pot shows.
  const [lastPhase, setLastPhase] = useState(phase);
  if (phase !== lastPhase) {
    setLastPhase(phase);
    if (phase === "results" || phase === "recipe" || phase === "error") setSnap("full");
    else if (phase === "cooking") setSnap("half");
  }

  // Phones: the wheel spins in the canvas above the sheet, so lower a fully open sheet.
  const stage = useStage();
  const [lastStage, setLastStage] = useState(stage);
  if (stage !== lastStage) {
    setLastStage(stage);
    if (stage && snap === "full") setSnap("half");
  }

  const quietHero = hasIngredients || phase !== "idle";

  return (
    <BottomSheet snap={snap} onSnapChange={setSnap}>
      <div
        className={`flex flex-col gap-2 lg:pointer-events-none lg:fixed lg:top-24 lg:left-8 lg:z-0 lg:-m-10 lg:max-w-[36rem] lg:gap-4 lg:rounded-[48px] lg:bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--cream-50)_82%,transparent),transparent)] lg:p-10 lg:transition-opacity lg:duration-500 ${
          quietHero ? "lg:opacity-0" : "lg:opacity-100"
        }`}
      >
        {hero}
        <TonightButton />
      </div>
      <IngredientDock />
      {/* Desktop: beside the wheel instead of growing the dock over it (mobile: inside the dock). */}
      <SurprisePanel className="max-lg:hidden lg:fixed lg:top-24 lg:right-6 lg:z-10 lg:w-[22rem] lg:animate-[panel-in_420ms_var(--ease-soft)] lg:border-0 lg:p-6 lg:glass" />
      <ResultsArea />
    </BottomSheet>
  );
}
