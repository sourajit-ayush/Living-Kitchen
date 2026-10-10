import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { HeroEyebrow } from "@/components/kitchen/HeroEyebrow";
import { KitchenLayout } from "@/components/kitchen/KitchenLayout";

export default function KitchenPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Home");

  return (
    <main id="main" tabIndex={-1} className="min-h-dvh outline-none">
      <KitchenLayout
        hero={
          <>
            <HeroEyebrow />
            <h1 className="max-w-[12ch] type-hero text-ink max-lg:text-[34px]">{t("headline")}</h1>
            <p className="max-w-[48ch] type-body text-ink-muted max-lg:hidden">{t("lede")}</p>
          </>
        }
      />
    </main>
  );
}
