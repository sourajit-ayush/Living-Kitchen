"use client";

import { Pepper, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import { useId } from "react";
import { COOKWARE, CUISINES, DIETS, DIFFICULTIES, MEALS } from "@/lib/ai/constants";
import type { Prefs } from "@/lib/ai/schema";
import { mealForHour, usePrefs } from "@/store/usePrefs";
import { Button, IconButton } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { Stepper } from "@/components/ui/Stepper";

const TIMES = ["any", "15", "30", "45", "60"] as const;

/** F4 filters & preferences, persisted to localStorage via usePrefs. */
export function PreferencesDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Prefs");
  const prefs = usePrefs((s) => s.prefs);
  const mealOverride = usePrefs((s) => s.mealOverride);
  const { setPref, reset } = usePrefs.getState();
  const spiceId = useId();
  const servingsId = useId();
  const meal = mealOverride ?? mealForHour(new Date().getHours());

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-walnut-900/30 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_200ms_ease-out]" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col rounded-l-sheet bg-cream-50 shadow-warm focus:outline-none data-[state=open]:animate-[sheet-in_320ms_var(--ease-soft)] max-sm:inset-x-0 max-sm:top-auto max-sm:max-h-[88dvh] max-sm:max-w-none max-sm:rounded-t-sheet max-sm:rounded-bl-none">
          <header className="flex items-start justify-between gap-4 border-b border-border px-6 pt-6 pb-4">
            <div>
              <Dialog.Title className="type-h2 text-ink">{t("title")}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-muted">
                {t("description")}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton aria-label={t("close")}>
                <X weight="bold" aria-hidden />
              </IconButton>
            </Dialog.Close>
          </header>

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
            <ChoiceGroup
              legend={t("diet")}
              options={(["any", ...DIETS] as const).map((d) => ({
                value: d,
                label: t(`diets.${d}`),
              }))}
              value={prefs.diet}
              onChange={(v) => setPref("diet", v as Prefs["diet"])}
            />

            <div className="flex flex-col gap-2">
              <label htmlFor="pref-cuisine" className="type-meta text-ink">
                {t("cuisine")}
              </label>
              <select
                id="pref-cuisine"
                value={prefs.cuisine}
                onChange={(e) => setPref("cuisine", e.target.value as Prefs["cuisine"])}
                className="h-11 rounded-control border border-border bg-surface px-3 text-ink"
              >
                {CUISINES.map((c) => (
                  <option key={c} value={c}>
                    {t(`cuisines.${c}`)}
                  </option>
                ))}
              </select>
            </div>

            <ChoiceGroup
              legend={t("time")}
              options={TIMES.map((v) => ({ value: v, label: t(`times.${v}`) }))}
              value={
                prefs.maxMinutes === null
                  ? "any"
                  : (String(prefs.maxMinutes) as (typeof TIMES)[number])
              }
              onChange={(v) =>
                setPref("maxMinutes", v === "any" ? null : (Number(v) as 15 | 30 | 45 | 60))
              }
            />

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <label htmlFor={spiceId} className="type-meta text-ink">
                  {t("spice")}
                </label>
                <span aria-hidden className="flex gap-0.5 text-tomato-600">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Pepper
                      key={i}
                      weight={i < prefs.spice ? "fill" : "regular"}
                      className={i < prefs.spice ? "" : "opacity-30"}
                    />
                  ))}
                </span>
              </div>
              <input
                id={spiceId}
                type="range"
                min={1}
                max={5}
                step={1}
                value={prefs.spice}
                aria-valuetext={t("spiceValue", { value: prefs.spice })}
                onChange={(e) => setPref("spice", Number(e.target.value))}
                className="accent-tomato-600"
              />
            </div>

            <ChoiceGroup
              legend={t("difficulty")}
              options={(["any", ...DIFFICULTIES] as const).map((d) => ({
                value: d,
                label: t(`difficulties.${d}`),
              }))}
              value={prefs.difficulty}
              onChange={(v) => setPref("difficulty", v as Prefs["difficulty"])}
            />

            <ChoiceGroup
              multiple
              legend={t("cookware")}
              hint={t("cookwareHint")}
              options={COOKWARE.map((c) => ({ value: c, label: t(`cookwares.${c}`) }))}
              value={prefs.cookware}
              onChange={(v) => setPref("cookware", v as Prefs["cookware"])}
            />

            <div className="flex items-center justify-between gap-4">
              <span id={`${servingsId}-label`} className="type-meta text-ink">
                {t("servings")}
              </span>
              <Stepper
                labelledBy={`${servingsId}-label`}
                value={prefs.servings}
                min={1}
                max={8}
                onChange={(v) => setPref("servings", v)}
                decreaseLabel={t("decrease")}
                increaseLabel={t("increase")}
              />
            </div>

            <ChoiceGroup
              legend={t("meal")}
              hint={mealOverride ? undefined : t("mealAuto")}
              options={MEALS.map((m) => ({ value: m, label: t(`meals.${m}`) }))}
              value={meal}
              onChange={(v) => setPref("meal", v as Prefs["meal"])}
            />
          </div>

          <footer className="flex justify-between gap-3 border-t border-border px-6 py-4">
            <Button variant="ghost" onClick={reset}>
              {t("reset")}
            </Button>
            <Dialog.Close asChild>
              <Button variant="primary">{t("done")}</Button>
            </Dialog.Close>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
