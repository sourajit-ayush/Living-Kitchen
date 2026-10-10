import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { use } from "react";
import { CookMode } from "@/components/cook/CookMode";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "CookMode" });
  return { title: t("title") };
}

/**
 * Cook Mode (F9). The recipe comes from this device (useCookbook), so the page is a client shell;
 * the kitchen scene behind it lives in the layout and turns into the blurred background.
 */
export default function CookPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = use(params);
  setRequestLocale(locale);
  return <CookMode id={decodeURIComponent(id)} />;
}
