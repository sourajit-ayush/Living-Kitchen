"use client";

import { BowlSteam, Coffee } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import type { RecipeCategory } from "@/lib/ai/schema";
import { useKitchen } from "@/store/useKitchen";

const OPTIONS = [
  { value: "food", Icon: BowlSteam },
  { value: "drink", Icon: Coffee },
] as const satisfies readonly { value: RecipeCategory; Icon: unknown }[];

/**
 * Food or drinks: what Nani makes (and whether the pot or the glass gets used). Native radios, so
 * arrow keys and screen-reader semantics come for free. Locked while something is cooking.
 */
export function CategorySwitch({ disabled = false }: { disabled?: boolean }) {
  const t = useTranslations("Dock");
  const category = useKitchen((s) => s.category);
  return (
    <div
      role="radiogroup"
      aria-label={t("category")}
      aria-disabled={disabled || undefined}
      className="flex rounded-full border border-border bg-cream-50 p-0.5"
    >
      {OPTIONS.map(({ value, Icon }) => {
        const checked = category === value;
        return (
          <label
            key={value}
            className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-[13px] transition-colors duration-150 has-[:disabled]:cursor-not-allowed has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
              checked ? "bg-walnut-900 text-cream-50" : "text-ink hover:bg-cream-200"
            }`}
          >
            <input
              type="radio"
              name="kitchen-category"
              value={value}
              checked={checked}
              disabled={disabled}
              onChange={() => useKitchen.getState().setCategory(value)}
              className="sr-only"
            />
            <Icon weight="duotone" aria-hidden className="size-4" />
            {t(value === "food" ? "food" : "drinks")}
          </label>
        );
      })}
    </div>
  );
}
