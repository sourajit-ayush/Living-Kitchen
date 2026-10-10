"use client";

import {
  BookOpenText,
  CloudCheck,
  CloudSlash,
  CloudArrowUp,
  CookingPot,
  GearSix,
  List as ListIcon,
  ShoppingBagOpen,
  SignIn,
  SignOut,
  Jar,
  X,
} from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { accountsEnabled } from "@/lib/supabase/client";
import { live } from "@/lib/sync/rows";
import { useAccount } from "@/store/useAccount";
import { useList } from "@/store/useList";
import { IconButton } from "./Button";
import { DaypartMenu } from "./DaypartMenu";
import { SoundToggle } from "./SoundToggle";

const LINKS = [
  { href: "/", key: "kitchen", Icon: CookingPot },
  { href: "/pantry", key: "pantry", Icon: Jar },
  { href: "/book", key: "book", Icon: BookOpenText },
  { href: "/list", key: "list", Icon: ShoppingBagOpen },
] as const;

function useToBuy() {
  return useList((s) => live(s.items).filter((i) => !i.checked).length);
}

function NavLinks({
  onNavigate,
  vertical = false,
}: {
  onNavigate?: () => void;
  vertical?: boolean;
}) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const toBuy = useToBuy();
  return (
    <ul className={vertical ? "flex flex-col gap-1" : "flex items-center gap-1"}>
      {LINKS.map(({ href, key, Icon }) => {
        const current = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <li key={key}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={current ? "page" : undefined}
              className={`flex items-center gap-2 rounded-full px-3 py-2 text-[15px] transition-colors duration-150 ${
                current ? "bg-walnut-900 text-cream-50" : "text-ink hover:bg-cream-200"
              } ${vertical ? "text-lg" : ""}`}
            >
              <Icon weight="duotone" aria-hidden className="size-5" />
              {t(key)}
              {key === "list" && toBuy > 0 && (
                <span
                  className={`rounded-full px-1.5 text-xs font-semibold tabular ${
                    current ? "bg-saffron-400 text-walnut-900" : "bg-tomato-600 text-white"
                  }`}
                >
                  {toBuy}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Settings (language, units, quality, your data): an icon in the bar, a row in the phone menu. */
function SettingsLink({
  onNavigate,
  vertical = false,
}: {
  onNavigate?: () => void;
  vertical?: boolean;
}) {
  const t = useTranslations("Nav");
  const current = usePathname().startsWith("/settings");
  return (
    <Link
      href="/settings"
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      aria-label={vertical ? undefined : t("settings")}
      title={vertical ? undefined : t("settings")}
      className={`flex items-center gap-2 rounded-full text-[15px] transition-colors duration-150 ${
        current ? "bg-walnut-900 text-cream-50" : "text-ink hover:bg-cream-200"
      } ${vertical ? "px-3 py-2 text-lg" : "size-10 justify-center"}`}
    >
      <GearSix weight="duotone" aria-hidden className="size-5" />
      {vertical && t("settings")}
    </Link>
  );
}

/** Signed in: a sync badge and sign out. Guest: a "Sign in" link (only when accounts exist). */
function AccountControl({ onNavigate, wide = false }: { onNavigate?: () => void; wide?: boolean }) {
  const t = useTranslations("Account");
  const { status, email, sync } = useAccount();
  if (!accountsEnabled || status === "unknown") return null;
  if (status !== "signedIn") {
    return (
      <Link
        href="/signin"
        onClick={onNavigate}
        className="flex items-center gap-2 rounded-full bg-walnut-900 px-3.5 py-2 text-[15px] text-cream-50 hover:bg-walnut-700"
      >
        <SignIn weight="bold" aria-hidden className="size-4.5" />
        {t("signIn")}
      </Link>
    );
  }
  const SyncIcon =
    sync === "offline" || sync === "error"
      ? CloudSlash
      : sync === "syncing"
        ? CloudArrowUp
        : CloudCheck;
  const syncLabel =
    sync === "offline"
      ? t("offline")
      : sync === "error"
        ? t("syncError")
        : sync === "syncing"
          ? t("syncing")
          : t("synced");
  return (
    <div className={`flex items-center gap-1 ${wide ? "flex-col items-start gap-3" : ""}`}>
      <span
        role="status"
        title={`${t("signedInAs", { email: email ?? "" })} · ${syncLabel}`}
        data-sync={sync ?? "idle"}
        className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[13px] text-ink-muted"
      >
        <SyncIcon weight="duotone" aria-hidden className="size-5 text-basil-600" />
        <span className={wide ? "" : "sr-only"}>
          {wide ? `${t("signedInAs", { email: email ?? "" })} · ` : ""}
          {syncLabel}
        </span>
      </span>
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          void useAccount.getState().signOut();
        }}
        className="flex items-center gap-2 rounded-full px-3 py-2 text-[15px] text-ink hover:bg-cream-200"
      >
        <SignOut aria-hidden className="size-4.5" />
        {t("signOut")}
      </button>
    </div>
  );
}

/** Site navigation (Phase 6): inline on desktop, a menu sheet on phones. */
export function SiteNav({ soundLabel }: { soundLabel: string }) {
  const t = useTranslations("Nav");
  const [open, setOpen] = useState(false);
  return (
    <>
      <nav aria-label={t("label")} className="max-lg:hidden">
        <NavLinks />
      </nav>
      <div className="flex items-center gap-1 max-lg:hidden">
        <SettingsLink />
        <AccountControl />
      </div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <IconButton aria-label={t("menu")} className="glass lg:hidden">
            <ListIcon weight="bold" aria-hidden className="size-5" />
          </IconButton>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-walnut-900/40 data-[state=open]:animate-[fade-in_200ms_ease-out]" />
          <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(20rem,85vw)] flex-col gap-6 bg-cream-50 p-5 shadow-warm focus:outline-none data-[state=open]:animate-[panel-in_320ms_var(--ease-soft)]">
            <div className="flex items-center justify-between">
              <Dialog.Title className="type-h2 text-ink">{t("menu")}</Dialog.Title>
              <Dialog.Close asChild>
                <IconButton aria-label={t("closeMenu")}>
                  <X aria-hidden />
                </IconButton>
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">{t("label")}</Dialog.Description>
            <nav aria-label={t("label")}>
              <NavLinks vertical onNavigate={() => setOpen(false)} />
              <SettingsLink vertical onNavigate={() => setOpen(false)} />
            </nav>
            <div className="flex items-center gap-3 sm:hidden">
              <DaypartMenu />
              <SoundToggle label={soundLabel} />
            </div>
            <div className="mt-auto border-t border-border pt-4">
              <AccountControl wide onNavigate={() => setOpen(false)} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
