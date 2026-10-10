import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Providers } from "@/components/Providers";
import { SceneRoot } from "@/components/scene/SceneRoot";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { routing } from "@/i18n/routing";
import { fontVariables } from "@/lib/fonts";
import { siteUrl } from "@/lib/share";
import "@/styles/globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  // Absolute URLs for Open Graph images and canonical links (NEXT_PUBLIC_SITE_URL).
  return { metadataBase: new URL(siteUrl()), title: t("title"), description: t("description") };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={fontVariables}>
      <body>
        <NextIntlClientProvider>
          <Providers>
            {/* The kitchen lives in the layout, so it stays alive (one WebGL context) between the
                kitchen and Cook Mode, where it moves to the stove and blurs into the background. */}
            <div className="relative isolate min-h-dvh">
              <SceneRoot />
              <SiteHeader />
              {children}
            </div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
