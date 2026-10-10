"use client";

import { Camera, Check, Shuffle, SlidersHorizontal } from "@phosphor-icons/react";
import { AnimatePresence } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { Tabs } from "radix-ui";
import { useRef, useState } from "react";
import {
  DRINK_IDS,
  INGREDIENTS_BY_ID,
  LEFTOVER_IDS,
  SAUCE_IDS,
  STAPLE_IDS,
} from "@/data/ingredients";
import type { Locale } from "@/i18n/routing";
import { parseIngredients } from "@/lib/parseIngredients";
import { MAX_INGREDIENTS, useKitchen } from "@/store/useKitchen";
import { DEFAULT_PREFS, usePrefs } from "@/store/usePrefs";
import { useScene } from "@/store/useScene";
import { useSurprise } from "@/store/useSurprise";
import { Button } from "@/components/ui/Button";
import { CategorySwitch } from "./CategorySwitch";
import { CookButton } from "./CookButton";
import { DishForm } from "./DishForm";
import { IngredientChip, ingredientLabel } from "./IngredientChip";
import { IngredientCombobox } from "./IngredientCombobox";
import { PreferencesDrawer } from "./PreferencesDrawer";
import { ScanSheet } from "./ScanSheet";
import { SurprisePanel, useSpinSurprise } from "./SurprisePanel";
import { UseItUpNudge } from "@/components/pantry/UseItUpNudge";
import { UsePantryToggle } from "@/components/pantry/UsePantryToggle";
import { useStage } from "./useStage";
import { useVoiceInput } from "./VoiceInput";

export function IngredientDock() {
  const t = useTranslations("Dock");
  const locale = useLocale() as Locale;
  const ingredients = useKitchen((s) => s.ingredients);
  const phase = useKitchen((s) => s.phase);
  const { addParsed, addById, remove, toggleExpiring, clearIngredients, cook } =
    useKitchen.getState();
  const prefs = usePrefs((s) => s.prefs);
  const mealOverride = usePrefs((s) => s.mealOverride);
  const [announcement, setAnnouncement] = useState("");
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [quickSet, setQuickSet] = useState<"staples" | "sauces" | "leftovers">("staples");
  const tScan = useTranslations("Scan");
  const tSurprise = useTranslations("Surprise");
  const fileInput = useRef<HTMLInputElement>(null);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const surprise = useSurprise((s) => s.status);
  const stage = useStage();
  const busy = phase === "cooking" || phase === "revealing" || surprise !== "idle";
  const spinSurprise = useSpinSurprise();
  const category = useKitchen((s) => s.category);
  const drinks = category === "drink";
  const quickIds = drinks
    ? DRINK_IDS
    : quickSet === "staples"
      ? STAPLE_IDS
      : quickSet === "sauces"
        ? SAUCE_IDS
        : LEFTOVER_IDS;
  // "What I have" (three ideas from the counter) or "Name a dish" (one full recipe).
  const [tab, setTab] = useState<"have" | "dish">("have");

  const keys = new Set(ingredients.map((i) => i.key));
  const full = ingredients.length >= MAX_INGREDIENTS;
  const prefsSet =
    (Object.keys(DEFAULT_PREFS) as (keyof typeof DEFAULT_PREFS)[]).filter(
      (k) => k !== "meal" && JSON.stringify(prefs[k]) !== JSON.stringify(DEFAULT_PREFS[k]),
    ).length + (mealOverride ? 1 : 0);

  const announceAdded = (names: string[]) => {
    if (names.length) setAnnouncement(t("added", { items: names.join(", ") }));
  };
  const localName = (p: { id: string | null; name: string }) =>
    (p.id && INGREDIENTS_BY_ID.get(p.id)?.names[locale]) || p.name;

  const voice = useVoiceInput(locale, (text) => {
    const parsed = parseIngredients(text);
    useScene.getState().wantPhysics();
    addParsed(parsed, "voice");
    announceAdded(parsed.map(localName));
    return parsed.length;
  });

  // Phones: under the input. Desktop: beside the mic, so the dock stays short enough not to scroll.
  const scanButton = (className: string) => (
    <Button
      size="sm"
      variant="secondary"
      title={tScan("buttonLabel")}
      onClick={() => {
        useScene.getState().wantPhysics();
        fileInput.current?.click();
      }}
      disabled={full}
      className={`shrink-0 ${className}`}
    >
      <Camera weight="duotone" aria-hidden className="size-4.5 text-walnut-700" />
      {tScan("button")}
    </Button>
  );

  return (
    <section
      aria-labelledby="dock-title"
      data-panel={phase === "idle" ? "closed" : "open"}
      // Desktop: slides below the screen edge while a 3D moment plays (invisible = no focus, no AT).
      data-stage={stage ? "on" : "off"}
      className="flex flex-col gap-5 lg:fixed lg:bottom-5 lg:left-1/2 lg:z-10 lg:max-h-[min(70vh,620px)] lg:w-[min(680px,calc(100vw-4rem))] lg:-translate-x-1/2 lg:gap-3 lg:overflow-y-auto lg:rounded-card lg:px-6 lg:py-4 lg:glass lg:transition-[left,width,translate,opacity,visibility] lg:duration-500 lg:data-[panel=open]:left-[calc((100vw-min(560px,44vw)-1.5rem)/2)] lg:data-[panel=open]:w-[min(620px,calc(100vw-min(560px,44vw)-5rem))] lg:data-[stage=on]:invisible lg:data-[stage=on]:translate-y-[calc(100%+2rem)] lg:data-[stage=on]:opacity-0"
    >
      <h2 id="dock-title" className="sr-only">
        {t("label")}
      </h2>

      <Tabs.Root
        value={tab}
        onValueChange={(v) => setTab(v as "have" | "dish")}
        className="flex flex-col gap-5 lg:gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs.List
            aria-label={t("modeLabel")}
            className="flex rounded-full border border-border bg-cream-50 p-0.5"
          >
            {(["have", "dish"] as const).map((value) => (
              <Tabs.Trigger
                key={value}
                value={value}
                className="rounded-full px-3.5 py-1.5 text-sm text-ink transition-colors duration-150 hover:bg-cream-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink data-[state=active]:bg-walnut-900 data-[state=active]:text-cream-50"
              >
                {t(value === "have" ? "modeHave" : "modeDish")}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <CategorySwitch disabled={busy} />
        </div>

        <Tabs.Content
          value="dish"
          className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
        >
          <DishForm busy={busy} />
        </Tabs.Content>

        <Tabs.Content
          value="have"
          className="flex flex-col gap-5 rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink lg:gap-3"
        >
          <UseItUpNudge />

          <IngredientCombobox
            locale={locale}
            compact
            onAddText={(text) => {
              const parsed = parseIngredients(text);
              addParsed(parsed, "typed");
              announceAdded(parsed.map(localName));
            }}
            onAddIngredient={(ing) => {
              addById(ing.id);
              announceAdded([ing.names[locale]]);
            }}
            actions={
              <>
                {voice.button}
                {scanButton("h-12 max-lg:hidden")}
              </>
            }
            below={
              <>
                {voice.caption}
                <div className="mt-3 flex flex-wrap gap-2 lg:mt-0">
                  {scanButton("lg:hidden")}
                  {/* No capture attribute: phones offer both the camera and the photo library. */}
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/*"
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    data-scan-input
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = ""; // the same photo can be picked again
                      if (f) setScanFile(f);
                    }}
                  />
                </div>
              </>
            }
          />

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 id="quick-add-title" className="type-meta text-ink-muted">
                {drinks ? t("quickDrinks") : t("staples")}
              </h3>
              {/* Native radios: arrow keys and screen-reader semantics for free */}
              {!drinks && (
                <div
                  role="radiogroup"
                  aria-labelledby="quick-add-title"
                  className="flex rounded-full border border-border bg-cream-50 p-0.5"
                >
                  {(["staples", "sauces", "leftovers"] as const).map((set) => (
                    <label
                      key={set}
                      className={`cursor-pointer rounded-full px-3 py-1 text-[13px] transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                        quickSet === set
                          ? "bg-walnut-900 text-cream-50"
                          : "text-ink hover:bg-cream-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name="quick-add-set"
                        value={set}
                        checked={quickSet === set}
                        onChange={() => setQuickSet(set)}
                        className="sr-only"
                      />
                      {t(
                        set === "staples"
                          ? "quickStaples"
                          : set === "sauces"
                            ? "quickSauces"
                            : "quickLeftovers",
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {!drinks && quickSet === "leftovers" && (
              <p className="-mt-1 mb-2 text-[13px] text-ink-muted">{t("leftoversHint")}</p>
            )}
            <ul
              className="flex flex-wrap gap-1.5 lg:-mx-1 lg:[scrollbar-width:thin] lg:flex-nowrap lg:overflow-x-auto lg:px-1 lg:pb-1"
              aria-labelledby="quick-add-title"
            >
              {quickIds.map((id) => {
                const ing = INGREDIENTS_BY_ID.get(id)!;
                const added = keys.has(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      aria-pressed={added}
                      aria-label={t("addStaple", { name: ing.names[locale] })}
                      onClick={() => {
                        if (added) remove(id);
                        else {
                          addById(id, "staple");
                          announceAdded([ing.names[locale]]);
                        }
                      }}
                      disabled={!added && full}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] whitespace-nowrap transition-colors duration-150 ${
                        added
                          ? "border-basil-600 bg-basil-600 text-white"
                          : "border-border bg-cream-50 text-ink hover:bg-cream-200"
                      }`}
                    >
                      {added ? (
                        <Check weight="bold" aria-hidden />
                      ) : (
                        <span aria-hidden>{ing.emoji}</span>
                      )}
                      {ing.names[locale]}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="type-meta text-ink-muted">
                {t("onCounter")} ·{" "}
                <span className="tabular">{t("count", { count: ingredients.length })}</span>
              </h3>
              {ingredients.length > 0 && (
                <button
                  type="button"
                  onClick={clearIngredients}
                  className="text-[13px] text-ink-muted underline-offset-2 hover:underline"
                >
                  {t("clear")}
                </button>
              )}
            </div>
            {ingredients.length === 0 ? (
              <p className="rounded-chip border border-dashed border-walnut-500/40 px-4 py-5 text-center font-hand text-xl text-walnut-700">
                {t("empty")}
              </p>
            ) : (
              <ul
                className="flex flex-wrap gap-2 lg:max-h-[6.75rem] lg:overflow-y-auto lg:p-0.5"
                aria-label={t("onCounter")}
              >
                <AnimatePresence initial={false}>
                  {ingredients.map((ing) => (
                    <IngredientChip
                      key={ing.key}
                      ingredient={ing}
                      locale={locale}
                      onRemove={() => {
                        remove(ing.key);
                        setAnnouncement(t("removed", { name: ingredientLabel(ing, locale) }));
                      }}
                      onToggleExpiring={() => toggleExpiring(ing.key)}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            )}
            {full && <p className="mt-2 text-[13px] text-chilli-700">{t("full")}</p>}
          </div>

          <UsePantryToggle compact />

          <SurprisePanel className="lg:hidden" />
        </Tabs.Content>

        {/* Mobile: the full-width Cook pill sits on top (thumb reach), Preferences below it. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 max-lg:flex-col-reverse max-lg:items-stretch">
          <Button
            variant="secondary"
            onClick={() => setPrefsOpen(true)}
            aria-haspopup="dialog"
            className="max-lg:self-start"
          >
            <SlidersHorizontal weight="duotone" aria-hidden className="size-5 text-walnut-700" />
            {t("preferences")}
            {prefsSet > 0 && (
              <span className="rounded-full bg-saffron-400 px-2 text-xs font-semibold text-walnut-900">
                {t("preferencesSet", { count: prefsSet })}
              </span>
            )}
          </Button>
          {tab === "have" && (
            <Button
              variant="secondary"
              onClick={spinSurprise}
              disabled={ingredients.length === 0 || busy}
              title={ingredients.length === 0 ? tSurprise("buttonHint") : undefined}
              className="max-lg:self-start"
            >
              <Shuffle weight="duotone" aria-hidden className="size-5 text-walnut-700" />
              {tSurprise("button")}
            </Button>
          )}
          {tab === "have" && (
            <CookButton
              category={category}
              cooking={phase === "cooking" || phase === "revealing"}
              disabled={ingredients.length === 0 || (surprise !== "idle" && surprise !== "error")}
              onClick={() => void cook(locale)}
            />
          )}
        </div>
      </Tabs.Root>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <PreferencesDrawer open={prefsOpen} onOpenChange={setPrefsOpen} />
      <ScanSheet
        file={scanFile}
        locale={locale}
        onClose={() => setScanFile(null)}
        onRetake={() => fileInput.current?.click()}
        onAdd={(items) => {
          // Close the sheet first; the rain starts in the next task, so closing the dialog and
          // creating the physics bodies don't share one long main-thread task on slow phones.
          setScanFile(null);
          setTimeout(() => {
            addParsed(
              items.map(({ id, name }) => ({ id, name })),
              "scan",
            );
            announceAdded(items.map(localName));
          }, 60);
        }}
      />
    </section>
  );
}
