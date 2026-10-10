import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitch } from "./LocaleSwitch";
import { DaypartMenu } from "./DaypartMenu";
import { SiteNav } from "./SiteNav";
import { SoundToggle } from "./SoundToggle";

export function SiteHeader() {
  const t = useTranslations("Header");
  return (
    <header
      data-site-header
      className="fixed inset-x-0 top-0 z-20 flex items-center justify-between border-b border-border/60 bg-[color-mix(in_srgb,var(--bg)_72%,transparent)] px-4 py-3 backdrop-blur-md sm:px-8"
    >
      {/* WCAG 2.4.1: the first Tab stop jumps past the header to the page's <main id="main">. */}
      <a
        href="#main"
        className="sr-only rounded-control bg-walnut-900 px-4 py-2 text-cream-50 focus:not-sr-only focus:absolute focus:top-2 focus:left-4 focus:z-50"
      >
        {t("skip")}
      </a>
      <Link
        href="/"
        className="font-display text-lg font-semibold whitespace-nowrap text-ink sm:text-xl"
      >
        {t("brand")}
      </Link>
      <div className="flex items-center gap-2">
        <SiteNav soundLabel={t("sound")} />
        {/* Phones: the sound switch lives in the menu, so the header stays one line. */}
        <div className="flex items-center gap-2 max-sm:hidden">
          <DaypartMenu />
          <SoundToggle label={t("sound")} />
        </div>
        <LocaleSwitch label={t("language")} />
      </div>
    </header>
  );
}
