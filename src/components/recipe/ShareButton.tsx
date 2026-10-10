"use client";

import { ShareNetwork } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Recipe } from "@/lib/ai/schema";

// The card painter and dialog load only when someone actually shares.
const ShareDialog = dynamic(() => import("./ShareDialog").then((m) => m.ShareDialog), {
  ssr: false,
});

/** Share (R5): opens the share dialog (link, WhatsApp, pictures for feed and stories). */
export function ShareButton({ recipe }: { recipe: Recipe }) {
  const t = useTranslations("Share");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={t("button")}
        title={t("button")}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="inline-flex size-12 items-center justify-center rounded-full border border-border bg-cream-50 text-walnut-700 transition-colors duration-150 hover:bg-cream-200"
      >
        <ShareNetwork weight="bold" aria-hidden className="size-6" />
      </button>
      {open && <ShareDialog recipe={recipe} onClose={() => setOpen(false)} />}
    </>
  );
}
