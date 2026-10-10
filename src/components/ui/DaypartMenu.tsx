"use client";

import { Moon, Sun, SunHorizon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useDaypart } from "@/store/useDaypart";

const ICONS = { morning: Sun, golden: SunHorizon, night: Moon } as const;
const BUTTON =
  "relative flex size-10 items-center justify-center rounded-full text-ink glass transition-colors duration-150 hover:bg-cream-200";

// The dropdown (Radix menu + its positioning code) loads on first use, not with every page.
const DaypartMenuContent = dynamic(() => import("./DaypartMenuContent"), {
  ssr: false,
  loading: () => <TriggerShell busy />,
});

function TriggerShell({ busy = false, onOpen }: { busy?: boolean; onOpen?: () => void }) {
  const t = useTranslations("Daypart");
  const setting = useDaypart((s) => s.setting);
  const part = useDaypart((s) => s.part);
  const Icon = ICONS[part];
  const label = t("button", { part: t(part), mode: setting === "auto" ? "auto" : "manual" });
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-haspopup="menu"
      aria-expanded={false}
      aria-busy={busy || undefined}
      data-daypart={part}
      onClick={onOpen}
      className={BUTTON}
    >
      <Icon aria-hidden className="size-5" weight={part === "night" ? "fill" : "duotone"} />
      {setting === "auto" && (
        <span
          aria-hidden
          className="absolute -right-0.5 -bottom-0.5 rounded-full bg-walnut-900 px-1 text-[9px] leading-[14px] font-semibold text-cream-50"
        >
          A
        </span>
      )}
    </button>
  );
}

/**
 * Day/Night kitchen switch (R9): follow the clock (default) or pick a part of day. The button
 * shows what the kitchen looks like now; the menu loads (and opens) on the first press.
 */
export function DaypartMenu() {
  const [loaded, setLoaded] = useState(false);
  return loaded ? <DaypartMenuContent /> : <TriggerShell onOpen={() => setLoaded(true)} />;
}
