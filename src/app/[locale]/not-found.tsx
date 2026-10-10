import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageShell } from "@/components/ui/PageShell";

/** 404 inside the site's layout: right language, header and a way back to the kitchen. */
export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <PageShell title={t("title")} lede={t("body")}>
      <Link
        href="/"
        className="inline-flex h-11 items-center self-start rounded-control bg-tomato-600 px-4 font-medium text-white shadow-pill hover:bg-chilli-700"
      >
        {t("toKitchen")}
      </Link>
    </PageShell>
  );
}
