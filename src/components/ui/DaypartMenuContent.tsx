"use client";

import { Check, Moon, Sun, SunHorizon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { DropdownMenu } from "radix-ui";
import type { DaypartSetting } from "@/lib/daypart";
import { useDaypart } from "@/store/useDaypart";

export const ICONS = { morning: Sun, golden: SunHorizon, night: Moon } as const;
export const DAYPART_BUTTON =
  "relative flex size-10 items-center justify-center rounded-full text-ink glass transition-colors duration-150 hover:bg-cream-200";
const OPTIONS: DaypartSetting[] = ["auto", "morning", "golden", "night"];

/** The Day/Night menu itself (loaded by DaypartMenu on first use, already open). */
export default function DaypartMenuContent() {
  const t = useTranslations("Daypart");
  const setting = useDaypart((s) => s.setting);
  const part = useDaypart((s) => s.part);
  const Icon = ICONS[part];
  const label = t("button", { part: t(part), mode: setting === "auto" ? "auto" : "manual" });

  return (
    <DropdownMenu.Root defaultOpen>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          data-daypart={part}
          className={DAYPART_BUTTON}
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
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-56 rounded-card bg-cream-50 p-1.5 text-ink shadow-warm data-[state=open]:animate-[fade-in_150ms_ease-out]"
        >
          <DropdownMenu.Label className="px-3 pt-1.5 pb-1 type-meta text-ink-muted">
            {t("label")}
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={setting}
            onValueChange={(v) => useDaypart.getState().setSetting(v as DaypartSetting)}
          >
            {OPTIONS.map((o) => {
              const OptionIcon = o === "auto" ? ICONS[part] : ICONS[o];
              return (
                <DropdownMenu.RadioItem
                  key={o}
                  value={o}
                  className="flex cursor-pointer items-center gap-3 rounded-control px-3 py-2 text-[15px] outline-none data-[highlighted]:bg-cream-200"
                >
                  <OptionIcon aria-hidden className="size-5 text-walnut-700" weight="duotone" />
                  <span className="flex-1">
                    {t(o)}
                    {o === "auto" && (
                      <span className="block text-[12px] text-ink-muted">{t("autoHint")}</span>
                    )}
                  </span>
                  <DropdownMenu.ItemIndicator>
                    <Check weight="bold" aria-hidden className="size-4 text-basil-600" />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              );
            })}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
