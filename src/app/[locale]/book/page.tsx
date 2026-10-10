import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RecipeBook } from "@/components/book/RecipeBook";
import { PageShell } from "@/components/ui/PageShell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Book" });
  return { title: t("title") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Book" });
  return (
    <PageShell title={t("title")} lede={t("lede")} wide>
      <RecipeBook />
    </PageShell>
  );
}
