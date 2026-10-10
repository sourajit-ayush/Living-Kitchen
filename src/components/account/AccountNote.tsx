"use client";

import { CloudCheck, DeviceMobile } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { accountsEnabled } from "@/lib/supabase/client";
import { useAccount } from "@/store/useAccount";

/** Where this page's data lives: on this device (with a sign-in link) or synced to the account. */
export function AccountNote() {
  const t = useTranslations("Account");
  const status = useAccount((s) => s.status);
  const email = useAccount((s) => s.email);
  if (status === "unknown") return null;
  if (status === "signedIn") {
    return (
      <p className="flex items-center gap-2 text-[13px] text-ink-muted">
        <CloudCheck weight="duotone" aria-hidden className="size-5 text-basil-600" />
        {t("signedInAs", { email: email ?? "" })}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-x-2 rounded-control bg-cream-200/70 px-3 py-2 text-[13px] text-ink">
      <DeviceMobile weight="duotone" aria-hidden className="size-5 shrink-0 text-walnut-700" />
      <span className="min-w-0 flex-1">{accountsEnabled ? t("deviceOnly") : t("unavailable")}</span>
      {accountsEnabled && (
        <Link href="/signin" className="font-medium text-walnut-900 underline underline-offset-2">
          {t("signIn")}
        </Link>
      )}
    </p>
  );
}
