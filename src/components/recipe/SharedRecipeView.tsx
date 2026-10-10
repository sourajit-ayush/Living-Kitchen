"use client";

import { useTranslations } from "next-intl";
import type { Recipe } from "@/lib/ai/schema";
import { useRouter } from "@/i18n/navigation";
import { RecipeView } from "./RecipeView";

/** A shared recipe (/r/[slug]): the full recipe view; "back" opens the kitchen. */
export function SharedRecipeView({ recipe }: { recipe: Recipe }) {
  const t = useTranslations("Share");
  const router = useRouter();
  return <RecipeView recipe={recipe} onBack={() => router.push("/")} backLabel={t("toKitchen")} />;
}
