"use client";

import { Warning } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import type { Locale } from "@/i18n/routing";
import { useKitchen } from "@/store/useKitchen";
import { Button } from "@/components/ui/Button";

/** "Oops, the pot boiled over" with a retry (docs/02 §8). */
export function ErrorState() {
  const t = useTranslations("Error");
  const locale = useLocale() as Locale;
  const error = useKitchen((s) => s.error);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => headingRef.current?.focus(), []);

  const code = error?.code;
  // Each error code has its own line in the Error namespace; anything unknown gets the generic one.
  const message =
    code === "rate_limited" ? t("rateLimited") : code && t.has(code) ? t(code) : t("body");

  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-10 text-center">
      <Warning weight="duotone" className="size-14 text-chilli-700" aria-hidden />
      <h2 ref={headingRef} tabIndex={-1} className="type-h2 text-ink">
        {t("title")}
      </h2>
      <p className="max-w-[44ch] text-ink-muted">{message}</p>
      <div className="flex gap-3">
        <Button variant="ghost" onClick={() => useKitchen.getState().startOver()}>
          {t("back")}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            // Try the same request again: the named dish, tonight's pick, or the counter.
            const { mode, dish, cook, cookDish, cookTonight } = useKitchen.getState();
            void (mode === "dish" && dish
              ? cookDish(locale, dish)
              : mode === "tonight"
                ? cookTonight(locale)
                : cook(locale));
          }}
        >
          {t("retry")}
        </Button>
      </div>
      {code && <p className="text-xs text-ink-muted tabular">{t("code", { code })}</p>}
    </div>
  );
}
