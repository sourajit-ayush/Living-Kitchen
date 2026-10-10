"use client";

import { ArrowsLeftRight } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Popover } from "radix-ui";
import type { Substitute } from "@/data/substitutions";
import { IconButton } from "@/components/ui/Button";

/** F7: swap icon → list of substitutes (recipe-specific from the AI, then offline kitchen rules). */
export function SubstituteMenu({
  name,
  substitutes,
  onPick,
}: {
  name: string;
  substitutes: Substitute[];
  onPick: (sub: Substitute) => void;
}) {
  const t = useTranslations("Recipe");
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <IconButton size="sm" aria-label={t("swap", { name })} className="text-walnut-700">
          <ArrowsLeftRight weight="duotone" aria-hidden className="size-[18px]" />
        </IconButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={16}
          className="z-50 w-72 rounded-card border border-border bg-cream-50 p-2 shadow-warm"
        >
          <p className="px-2 pt-1 pb-2 type-meta text-ink-muted">{t("substitutesFor", { name })}</p>
          {substitutes.length === 0 ? (
            <p className="px-2 pb-2 text-sm text-ink-muted">{t("noSubstitutes")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {substitutes.map((sub) => (
                <li key={sub.name}>
                  <Popover.Close asChild>
                    <button
                      type="button"
                      onClick={() => onPick(sub)}
                      className="flex w-full flex-col items-start gap-0.5 rounded-[14px] px-3 py-2 text-left hover:bg-cream-200"
                    >
                      <span className="font-medium text-ink">{sub.name}</span>
                      <span className="text-[13px] leading-snug text-ink-muted">{sub.note}</span>
                      <span className="text-[11px] tracking-wide text-walnut-700 uppercase">
                        {sub.source === "local" ? t("fromKitchen") : t("fromRecipe")}
                      </span>
                    </button>
                  </Popover.Close>
                </li>
              ))}
            </ul>
          )}
          <Popover.Arrow className="fill-cream-50" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
