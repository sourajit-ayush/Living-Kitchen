"use client";

import { Clock } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { INGREDIENTS_BY_ID } from "@/data/ingredients";
import type { Locale } from "@/i18n/routing";
import { expiringSoon, localDate } from "@/lib/pantry";
import { live } from "@/lib/sync/rows";
import { useKitchen } from "@/store/useKitchen";
import { usePantry } from "@/store/usePantry";
import { Button } from "@/components/ui/Button";
import { useExpiryLabel } from "./PantryManager";

const DISMISS_KEY = "lk-nudge-dismissed";

/**
 * Use-It-Up nudge (R4): "Your paneer expires tomorrow, here are 3 ideas." Puts the expiring pantry
 * items on the counter marked as expiring and cooks. "Not now" hides it for the rest of the day.
 */
export function UseItUpNudge() {
  const t = useTranslations("UseItUp");
  const locale = useLocale() as Locale;
  const items = usePantry((s) => s.items);
  const phase = useKitchen((s) => s.phase);
  const expiryLabel = useExpiryLabel();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === localDate());
    } catch {
      setDismissed(false);
    }
  }, []);

  const soon = expiringSoon(live(items));
  if (dismissed || phase !== "idle" || soon.length === 0) return null;
  const first = soon[0];
  const name = (first.id && INGREDIENTS_BY_ID.get(first.id)?.names[locale]) || first.name;

  return (
    <aside
      data-use-it-up
      className="flex flex-col gap-2 rounded-card border border-saffron-400 bg-saffron-400/15 px-4 py-3 sm:flex-row sm:items-center"
    >
      <p className="flex flex-1 items-start gap-2 text-[14px] text-walnut-900">
        <Clock weight="fill" aria-hidden className="mt-0.5 size-5 shrink-0 text-chilli-700" />
        {soon.length === 1
          ? t("nudge", { name, when: expiryLabel(first.expiresOn!) })
          : t("nudgeMany", { name, count: soon.length - 1 })}
      </p>
      <div className="flex shrink-0 gap-1">
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            const kitchen = useKitchen.getState();
            kitchen.addParsed(
              soon.map((i) => ({ id: i.id, name: i.name })),
              "pantry",
            );
            // Flag them, so generation prioritises them and the cards say "Uses up: …".
            const keys = new Set(soon.map((i) => i.key));
            for (const ing of useKitchen.getState().ingredients) {
              if (keys.has(ing.key) && !ing.expiring) kitchen.toggleExpiring(ing.key);
            }
            void kitchen.cook(locale);
          }}
        >
          {t("cookIt")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, localDate());
            } catch {
              /* private mode: hide for this visit only */
            }
            setDismissed(true);
          }}
        >
          {t("dismiss")}
        </Button>
      </div>
    </aside>
  );
}
