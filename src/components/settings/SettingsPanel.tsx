"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { initialTier, readEnvironment, type QualitySetting } from "@/components/scene/quality";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { UNIT_SYSTEMS, type UnitSystem } from "@/data/units";
import { DIETS } from "@/lib/ai/constants";
import type { Prefs } from "@/lib/ai/schema";
import { useAccount } from "@/store/useAccount";
import { usePrefs } from "@/store/usePrefs";
import { useQualitySetting, useScene } from "@/store/useScene";
import { useSound } from "@/store/useSound";
import { PrivacySection } from "./PrivacySection";

const QUALITIES: QualitySetting[] = ["auto", "high", "medium", "low", "off"];
const LANGUAGE_NAMES: Record<(typeof routing.locales)[number], string> = {
  en: "English",
  hi: "हिन्दी",
  bn: "বাংলা",
};

/** Settings (docs/01 §6 "/settings"): language, units, diet, 3D quality, sound, and your data. */
export function SettingsPanel() {
  const t = useTranslations("Settings");
  const tp = useTranslations("Prefs");
  const tr = useTranslations("Recipe");
  const locale = useLocale() as (typeof routing.locales)[number];
  const router = useRouter();
  const pathname = usePathname();
  const diet = usePrefs((s) => s.prefs.diet);
  const unitSystem = usePrefs((s) => s.unitSystem);
  const quality = useQualitySetting((s) => s.setting);
  const sound = useSound((s) => s.enabled);
  const status = useAccount((s) => s.status);
  const [qualityReady, setQualityReady] = useState(false);

  useEffect(() => {
    // The scene reads the quality setting lazily; make sure it's loaded before showing it.
    void Promise.resolve(useQualitySetting.persist.rehydrate()).then(() => setQualityReady(true));
  }, []);

  const chooseQuality = async (setting: QualitySetting) => {
    useQualitySetting.getState().setSetting(setting);
    // Apply now: the kitchen behind this page switches without a reload.
    useScene.getState().setTier(initialTier(setting, await readEnvironment(setting)));
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <ChoiceGroup
          legend={t("language")}
          hint={t("languageHint")}
          options={routing.locales.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))}
          value={locale}
          onChange={(v) => router.replace(pathname, { locale: v as typeof locale })}
        />
        <ChoiceGroup
          legend={t("units")}
          options={UNIT_SYSTEMS.map((u) => ({ value: u, label: tr(`unitSystems.${u}`) }))}
          value={unitSystem}
          onChange={(v) => usePrefs.getState().setUnitSystem(v as UnitSystem)}
        />
        <ChoiceGroup
          legend={t("diet")}
          hint={t("dietHint")}
          options={(["any", ...DIETS] as const).map((d) => ({
            value: d,
            label: tp(`diets.${d}`),
          }))}
          value={diet}
          onChange={(v) => usePrefs.getState().setPref("diet", v as Prefs["diet"])}
        />
        {qualityReady && (
          <ChoiceGroup
            legend={t("quality")}
            hint={t("qualityHint")}
            options={QUALITIES.map((q) => ({ value: q, label: t(`qualities.${q}`) }))}
            value={quality}
            onChange={(v) => void chooseQuality(v as QualitySetting)}
          />
        )}
        <ChoiceGroup
          legend={t("sound")}
          options={[
            { value: "on", label: t("on") },
            { value: "off", label: t("off") },
          ]}
          value={sound ? "on" : "off"}
          onChange={(v) => {
            if ((v === "on") !== useSound.getState().enabled) useSound.getState().toggle();
          }}
        />
      </div>
      <PrivacySection signedIn={status === "signedIn"} />
    </div>
  );
}
