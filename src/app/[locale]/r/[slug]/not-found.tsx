import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageShell } from "@/components/ui/PageShell";

/** An unknown or unshared recipe link. */
export default async function SharedRecipeNotFound() {
  const t = await getTranslations("Share");
  return (
    <PageShell title={t("notFoundTitle")} lede={t("notFoundBody")}>
      <Link
        href="/"
        className="inline-flex h-11 items-center self-start rounded-control bg-tomato-600 px-4 font-medium text-white shadow-pill hover:bg-chilli-700"
      >
        {t("toKitchen")}
      </Link>
    </PageShell>
  );
}
