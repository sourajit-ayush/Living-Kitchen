"use client";

import { EnvelopeSimple, PaperPlaneTilt } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { accountsEnabled } from "@/lib/supabase/client";
import { useAccount } from "@/store/useAccount";
import { Button } from "@/components/ui/Button";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Magic-link sign-in (Phase 6). The link comes back to /auth/callback on this device. */
export function SignInForm() {
  const t = useTranslations("Account");
  const locale = useLocale();
  const router = useRouter();
  const status = useAccount((s) => s.status);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  // Already signed in (or just finished): nothing to do here.
  useEffect(() => {
    if (status === "signedIn") router.replace("/");
  }, [status, router]);

  if (!accountsEnabled) {
    return <p className="rounded-control bg-cream-200/70 px-4 py-3 text-ink">{t("unavailable")}</p>;
  }
  if (status === "signedIn") return null;
  if (state === "sent") {
    return (
      <div
        role="status"
        className="flex flex-col gap-3 rounded-card border border-border bg-cream-50 p-5"
      >
        <PaperPlaneTilt weight="duotone" aria-hidden className="size-10 text-basil-600" />
        <h2 className="type-h2 text-ink">{t("sent")}</h2>
        <p className="text-ink">{t("sentDetail", { email })}</p>
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setState("idle")}>
          {t("again")}
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const value = email.trim();
        if (!EMAIL.test(value)) {
          setState("error");
          setError(t("invalid"));
          return;
        }
        setState("sending");
        const redirectTo = `${window.location.origin}/${locale}/auth/callback`;
        const result = await useAccount.getState().sendMagicLink(value, redirectTo);
        if (result.ok) setState("sent");
        else {
          setState("error");
          setError(t("failed", { reason: result.error ?? "" }));
        }
      }}
    >
      <label htmlFor="signin-email" className="type-h3 text-ink">
        {t("email")}
      </label>
      <div className="flex gap-2 max-sm:flex-col">
        <input
          id="signin-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={state === "error" || undefined}
          aria-describedby={state === "error" ? "signin-error" : "signin-note"}
          className="h-12 min-w-0 flex-1 rounded-control border border-border bg-cream-50 px-4 text-base text-ink"
        />
        <Button type="submit" variant="primary" className="h-12" disabled={state === "sending"}>
          <EnvelopeSimple weight="bold" aria-hidden />
          {state === "sending" ? t("sending") : t("send")}
        </Button>
      </div>
      {state === "error" && (
        <p id="signin-error" role="alert" className="text-[14px] text-chilli-700">
          {error}
        </p>
      )}
      <p id="signin-note" className="text-[14px] text-ink-muted">
        {t("guestNote")}
      </p>
    </form>
  );
}
