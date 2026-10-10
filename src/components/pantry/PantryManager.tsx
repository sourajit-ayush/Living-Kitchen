"use client";

import { CalendarBlank, CalendarX, X } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { INGREDIENTS_BY_ID } from "@/data/ingredients";
import type { Locale } from "@/i18n/routing";
import { daysUntil, localDate, PANTRY_GROUPS } from "@/lib/pantry";
import { parseIngredients } from "@/lib/parseIngredients";
import { live } from "@/lib/sync/rows";
import { pantryEmoji, usePantry, type PantryItem } from "@/store/usePantry";
import { IngredientCombobox } from "@/components/kitchen/IngredientCombobox";
import { IconButton } from "@/components/ui/Button";
import { AccountNote } from "@/components/account/AccountNote";
import { UsePantryToggle } from "./UsePantryToggle";

export function useExpiryLabel() {
  const t = useTranslations("Pantry");
  return (date: string) => {
    const days = daysUntil(date);
    if (days < 0) return t("expired");
    if (days === 0) return t("today");
    if (days === 1) return t("tomorrow");
    return t("inDays", { count: days });
  };
}

function PantryRow({ item, locale }: { item: PantryItem; locale: Locale }) {
  const t = useTranslations("Pantry");
  const label = (item.id && INGREDIENTS_BY_ID.get(item.id)?.names[locale]) || item.name;
  const expiryLabel = useExpiryLabel();
  const days = item.expiresOn ? daysUntil(item.expiresOn) : null;
  const soon = days !== null && days <= 2;
  return (
    <li
      data-pantry-item={item.key}
      className={`flex items-center gap-3 rounded-control border px-3 py-2 ${
        soon ? "border-saffron-400 bg-saffron-400/10" : "border-border bg-cream-50"
      }`}
    >
      <span aria-hidden className="text-xl">
        {pantryEmoji(item)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{label}</span>
      {item.expiresOn && (
        <span
          className={`text-[13px] ${soon ? "font-semibold text-chilli-700" : "text-ink-muted"}`}
        >
          {expiryLabel(item.expiresOn)}
        </span>
      )}
      <label className="relative inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-walnut-700 hover:bg-cream-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink">
        <CalendarBlank
          weight={item.expiresOn ? "fill" : "regular"}
          aria-hidden
          className="size-5"
        />
        <span className="sr-only">{t("expiresOn", { name: label })}</span>
        <input
          type="date"
          min={localDate()}
          value={item.expiresOn ?? ""}
          onChange={(e) => usePantry.getState().setExpiry(item.key, e.target.value || null)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      {item.expiresOn && (
        <IconButton
          size="sm"
          aria-label={t("clearExpiry", { name: label })}
          onClick={() => usePantry.getState().setExpiry(item.key, null)}
        >
          <CalendarX aria-hidden className="size-4.5" />
        </IconButton>
      )}
      <IconButton
        size="sm"
        aria-label={t("remove", { name: label })}
        onClick={() => usePantry.getState().remove(item.key)}
      >
        <X weight="bold" aria-hidden />
      </IconButton>
    </li>
  );
}

/** My Pantry (R1, R4): staples grouped by category, with optional expiry dates. */
export function PantryManager() {
  const t = useTranslations("Pantry");
  const locale = useLocale() as Locale;
  const items = usePantry((s) => s.items);
  const visible = live(items);
  const [announcement, setAnnouncement] = useState("");

  const add = (parsed: ReturnType<typeof parseIngredients>) => {
    usePantry.getState().add(parsed);
    if (parsed.length) setAnnouncement(parsed.map((p) => p.name).join(", "));
  };

  return (
    <div className="flex flex-col gap-6">
      <AccountNote />
      <div className="rounded-card border border-border bg-cream-50 p-4">
        <UsePantryToggle />
      </div>
      <IngredientCombobox
        locale={locale}
        label={t("add")}
        placeholder={t("placeholder")}
        onAddText={(text) => add(parseIngredients(text))}
        onAddIngredient={(ing) => add([{ id: ing.id, name: ing.names.en }])}
      />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {visible.length === 0 ? (
        <p className="rounded-chip border border-dashed border-walnut-500/40 px-4 py-6 text-center font-hand text-xl text-walnut-700">
          {t("empty")}
        </p>
      ) : (
        PANTRY_GROUPS.map((group) => {
          const rows = visible
            .filter((i) => i.category === group)
            .sort((a, b) => a.name.localeCompare(b.name));
          if (!rows.length) return null;
          return (
            <section key={group} aria-labelledby={`pantry-${group}`} data-pantry-group={group}>
              <h2 id={`pantry-${group}`} className="mb-2 type-meta text-ink-muted">
                {t(`groups.${group}`)} · <span className="tabular">{rows.length}</span>
              </h2>
              <ul className="flex flex-col gap-1.5">
                {rows.map((item) => (
                  <PantryRow key={item.key} item={item} locale={locale} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
