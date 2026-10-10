import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { SharedRecipeView } from "@/components/recipe/SharedRecipeView";
import { PageShell } from "@/components/ui/PageShell";
import { shareCardUrl, sharePath, siteUrl } from "@/lib/share";
import { getSharedRecipe, recipeJsonLd, safeJson } from "@/lib/sharedRecipe";

// Shared recipes never change (a new version is a new slug): cache the page for an hour.
export const revalidate = 3600;

type Params = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const shared = await getSharedRecipe(slug);
  const t = await getTranslations({ locale, namespace: "Share" });
  if (!shared) return { title: t("notFoundTitle"), robots: { index: false } };
  const { recipe } = shared;
  const url = `${siteUrl()}${sharePath(locale, slug)}`;
  const image = shareCardUrl(slug);
  const title = `${recipe.title} · The Living Kitchen`;
  return {
    title,
    description: recipe.tagline,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: recipe.title,
      description: recipe.tagline,
      siteName: "The Living Kitchen",
      locale: `${recipe.locale}_IN`,
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: recipe.title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: recipe.title,
      description: recipe.tagline,
      ...(image ? { images: [image] } : {}),
    },
  };
}

/** A shared recipe (R5): public, indexable, with a link preview card and Recipe rich data. */
export default async function SharedRecipePage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const shared = await getSharedRecipe(slug);
  const t = await getTranslations({ locale, namespace: "Share" });
  if (!shared) notFound();
  const format = await getFormatter({ locale });
  const url = `${siteUrl()}${sharePath(locale, slug)}`;
  return (
    <PageShell
      title={t("pageTitle")}
      lede={
        shared.sharedAt
          ? `${t("pageLede")} ${t("sharedOn", { date: format.dateTime(new Date(shared.sharedAt), { dateStyle: "medium" }) })}`
          : t("pageLede")
      }
      wide
    >
      <script
        type="application/ld+json"
        // Escaped JSON (safeJson), not HTML: recipe text can't break out of the tag.
        dangerouslySetInnerHTML={{
          __html: safeJson(recipeJsonLd(shared.recipe, url, shareCardUrl(slug))),
        }}
      />
      <SharedRecipeView recipe={shared.recipe} />
    </PageShell>
  );
}
