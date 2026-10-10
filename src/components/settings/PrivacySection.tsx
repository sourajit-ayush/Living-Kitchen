"use client";

import { DownloadSimple, Trash } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { AlertDialog } from "radix-ui";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  buildExport,
  exportFileName,
  keysToClear,
  readLocalData,
  type AccountExport,
} from "@/lib/privacy";
import { authHeaders, getSupabase, sessionStorageKey } from "@/lib/supabase/client";
import { useAccount } from "@/store/useAccount";

/** What the account holds, read as the user (row-level security shows only their own rows). */
async function readAccount(): Promise<AccountExport> {
  const sb = await getSupabase();
  const { data: auth } = await sb.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");
  const all = async (table: string, column = "user_id") => {
    const { data, error } = await sb.from(table).select("*").eq(column, uid);
    if (error) throw error;
    return data ?? [];
  };
  const [profile, pantry, savedRecipes, shoppingList, myRecipes, photos] = await Promise.all([
    all("profiles", "id"),
    all("pantry_items"),
    all("saved_recipes"),
    all("shopping_list"),
    all("recipes", "author_id"),
    sb.storage.from("made-photos").list(uid, { limit: 1000 }),
  ]);
  return {
    email: auth.user?.email ?? null,
    profile: profile[0] ?? null,
    pantry,
    savedRecipes,
    shoppingList,
    myRecipes,
    photos: (photos.data ?? []).map((f) => `made-photos/${uid}/${f.name}`),
  };
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Settings → "Your data": what is kept where, a JSON download, and delete everything. */
export function PrivacySection({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("Settings");
  const locale = useLocale();
  const email = useAccount((s) => s.email);
  const headingId = useId();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [open, setOpen] = useState(false);

  // Back from a deletion (the page reloads so no store can write old data back).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("deleted") !== "1") return;
    setStatus(t("deleted"));
    url.searchParams.delete("deleted");
    window.history.replaceState(null, "", url);
  }, [t]);

  const exportData = async () => {
    setBusy("export");
    setStatus("");
    try {
      const account = signedIn ? await readAccount() : null;
      download(exportFileName(), buildExport(readLocalData(localStorage), account));
      setStatus(t("exported"));
    } catch {
      setStatus(t("exportFailed"));
    } finally {
      setBusy(null);
    }
  };

  const deleteAll = async () => {
    setBusy("delete");
    setStatus("");
    try {
      if (signedIn) {
        const res = await fetch("/api/account", { method: "DELETE", headers: await authHeaders() });
        if (!res.ok) throw new Error(String(res.status));
      }
      for (const k of keysToClear(localStorage, sessionStorageKey())) localStorage.removeItem(k);
      for (const k of keysToClear(sessionStorage, null)) sessionStorage.removeItem(k);
      // A full reload: the in-memory stores start empty and can't write old data back.
      window.location.assign(`/${locale}/settings?deleted=1`);
    } catch {
      setBusy(null);
      setOpen(false);
      setStatus(t("deleteFailed"));
    }
  };

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 border-t border-border pt-6"
    >
      <h2 id={headingId} className="type-h2 text-ink">
        {t("privacy")}
      </h2>
      <p className="text-ink-muted">
        {signedIn ? t("privacySignedIn", { email: email ?? "" }) : t("privacyGuest")}
      </p>
      <p className="text-ink-muted">{t("privacyPhotos")}</p>
      <p className="text-ink-muted">{t("privacyAi")}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => void exportData()} disabled={busy !== null}>
          <DownloadSimple aria-hidden className="size-5" />
          {busy === "export" ? t("exporting") : t("export")}
        </Button>
        <AlertDialog.Root open={open} onOpenChange={(o) => busy !== "delete" && setOpen(o)}>
          <AlertDialog.Trigger asChild>
            <Button variant="primary" disabled={busy !== null}>
              <Trash aria-hidden className="size-5" />
              {t("delete")}
            </Button>
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-40 bg-walnut-900/40 data-[state=open]:animate-[fade-in_200ms_ease-out]" />
            <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-sheet bg-cream-50 p-6 shadow-warm focus:outline-none">
              <AlertDialog.Title className="type-h2 text-ink">{t("deleteTitle")}</AlertDialog.Title>
              <AlertDialog.Description className="text-ink-muted">
                {signedIn ? t("deleteAccount", { email: email ?? "" }) : t("deleteGuest")}
              </AlertDialog.Description>
              <div className="flex flex-wrap justify-end gap-3">
                <AlertDialog.Cancel asChild>
                  <Button variant="secondary" disabled={busy === "delete"}>
                    {t("cancel")}
                  </Button>
                </AlertDialog.Cancel>
                <Button
                  variant="primary"
                  onClick={() => void deleteAll()}
                  disabled={busy === "delete"}
                >
                  {busy === "delete" ? t("deleting") : t("deleteConfirm")}
                </Button>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </div>
      <p role="status" className="min-h-[1.5em] text-sm text-ink">
        {status}
      </p>
    </section>
  );
}
