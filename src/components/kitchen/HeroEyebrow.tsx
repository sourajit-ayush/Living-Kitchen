"use client";

import { useTranslations } from "next-intl";
import { useDaypart } from "@/store/useDaypart";

/** "Golden hour, your counter" follows the kitchen's time of day (R9). */
export function HeroEyebrow() {
  const t = useTranslations("Home");
  const part = useDaypart((s) => s.part);
  const key = part === "morning" ? "eyebrowMorning" : part === "night" ? "eyebrowNight" : "eyebrow";
  return <p className="type-meta text-ink-muted uppercase">{t(key)}</p>;
}
