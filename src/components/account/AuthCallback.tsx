"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { useAccount } from "@/store/useAccount";

/**
 * The magic link lands here with `?code=`: supabase-js exchanges it (PKCE) as it loads, the
 * account boots, the sync engine merges this device's guest data, and we go back to the kitchen.
 */
export function AuthCallback() {
  const t = useTranslations("Account");
  const router = useRouter();
  const status = useAccount((s) => s.status);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") || params.get("error_description")) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const sb = await getSupabase();
        // Wait for the code exchange that createClient started.
        const { data } = await sb.auth.getSession();
        await useAccount.getState().boot({ force: true });
        if (!cancelled && !data.session && useAccount.getState().status !== "signedIn") {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status === "signedIn") router.replace("/");
  }, [status, router]);

  if (failed) {
    return (
      <div role="alert" className="flex flex-col gap-3">
        <p className="text-ink">{t("callbackFailed")}</p>
        <Link href="/signin" className="font-medium text-walnut-900 underline underline-offset-2">
          {t("tryAgain")}
        </Link>
      </div>
    );
  }
  return (
    <p role="status" className="font-hand text-2xl text-walnut-700">
      {t("finishing")}
    </p>
  );
}
