"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LABELS: Record<(typeof routing.locales)[number], string> = {
  en: "EN",
  hi: "हि",
  bn: "বা",
};

export function LocaleSwitch({ label }: { label: string }) {
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="flex rounded-full p-1 glass">
      {routing.locales.map((l) => {
        const active = l === locale;
        return (
          <Link
            key={l}
            href={pathname}
            locale={l}
            hrefLang={l}
            aria-current={active ? "true" : undefined}
            className={`rounded-full px-3 py-1.5 type-meta transition-colors duration-150 ${
              active ? "bg-walnut-900 text-cream-50" : "text-ink hover:bg-cream-200"
            }`}
          >
            {/* On other pages "हि" / "বা" is the only Devanagari / Bengali text: system fonts render
                it, so a 100+ KB web font isn't downloaded just for this label. */}
            <span
              lang={l}
              className={l !== "en" && locale !== l ? "font-[system-ui,sans-serif]" : undefined}
            >
              {LABELS[l]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
