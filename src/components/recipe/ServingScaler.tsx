"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { UNIT_SYSTEMS, type UnitSystem } from "@/data/units";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { Stepper } from "@/components/ui/Stepper";

/** F8: servings stepper (1–12) and unit-system toggle. */
export function ServingScaler({
  servings,
  onServings,
  unitSystem,
  onUnitSystem,
}: {
  servings: number;
  onServings: (n: number) => void;
  unitSystem: UnitSystem;
  onUnitSystem: (s: UnitSystem) => void;
}) {
  const t = useTranslations("Recipe");
  const id = useId();
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 rounded-card bg-cream-100 p-4">
      <div className="flex flex-col gap-2">
        <span id={id} className="type-meta text-ink">
          {t("servings")}
        </span>
        <Stepper
          labelledBy={id}
          value={servings}
          min={1}
          max={12}
          onChange={onServings}
          decreaseLabel={t("decrease")}
          increaseLabel={t("increase")}
        />
      </div>
      <ChoiceGroup
        legend={t("units")}
        options={UNIT_SYSTEMS.map((s) => ({ value: s, label: t(`unitSystems.${s}`) }))}
        value={unitSystem}
        onChange={(v) => onUnitSystem(v as UnitSystem)}
      />
    </div>
  );
}
