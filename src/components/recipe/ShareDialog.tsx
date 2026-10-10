"use client";

import {
  Check,
  CopySimple,
  DownloadSimple,
  ShareNetwork,
  WhatsappLogo,
  X,
} from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Recipe } from "@/lib/ai/schema";
import { whatsappUrl } from "@/lib/share";
import {
  canvasToBlob,
  loadCardFonts,
  paintCard,
  type CardFormat,
  type CardWords,
} from "@/lib/shareCard";
import { Button, IconButton } from "@/components/ui/Button";
import { authHeaders } from "@/lib/supabase/client";

type LinkState =
  { status: "making" } | { status: "ready"; url: string } | { status: "none"; reason: string };

/**
 * Share a recipe (R5): makes its public link (/r/[slug], with the preview card WhatsApp and
 * others show), then offers the phone's share sheet, WhatsApp, copy link, and the feed (4:5) and
 * story (9:16) pictures. Without a link the pictures and text can still be shared.
 */
export function ShareDialog({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const t = useTranslations("Share");
  const tr = useTranslations("Recipe");
  const locale = useLocale();
  const [link, setLink] = useState<LinkState>({ status: "making" });
  const [preview, setPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const cards = useRef(new Map<CardFormat, Blob>());

  const words: CardWords = useMemo(
    () => ({
      minutes: (n) => t("cardMinutes", { count: n }),
      serves: (n) => t("cardServes", { count: n }),
      more: (n) => t("cardMore", { count: n }),
      footer: t("cardFooter"),
      host: typeof window === "undefined" ? "" : window.location.host,
      difficulty: tr(`difficulties.${recipe.difficulty}`),
    }),
    [t, tr, recipe.difficulty],
  );

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    void (async () => {
      const photo = await loadCardFonts(recipe, words);
      const render = async (format: CardFormat) => {
        const canvas = document.createElement("canvas");
        paintCard(canvas, recipe, format, words, photo);
        const blob = await canvasToBlob(canvas, format === "og" ? 0.82 : 0.9);
        cards.current.set(format, blob);
        return blob;
      };
      const feed = await render("feed");
      if (cancelled) return;
      url = URL.createObjectURL(feed);
      setPreview(url);
      const og = await render("og");
      void render("story");
      // The public link: the recipe plus its preview card, stored by the server.
      try {
        const body = new FormData();
        body.append("recipe", JSON.stringify(recipe));
        body.append("card", og, "card.jpg");
        const res = await fetch("/api/share", {
          method: "POST",
          body,
          headers: await authHeaders(),
        });
        const json = (await res.json().catch(() => null)) as {
          slug?: string;
          error?: { code: string };
        } | null;
        if (cancelled) return;
        if (res.ok && json?.slug) {
          setLink({ status: "ready", url: `${window.location.origin}/${locale}/r/${json.slug}` });
        } else {
          setLink({
            status: "none",
            reason: json?.error?.code === "config" ? t("noLink") : t("failed"),
          });
        }
      } catch {
        if (!cancelled) setLink({ status: "none", reason: t("failed") });
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [recipe, words, locale, t]);

  const shareUrl = link.status === "ready" ? link.url : undefined;
  const text = t("text", { title: recipe.title });

  const download = (format: CardFormat) => {
    const blob = cards.current.get(format);
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${recipe.id}-${format}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const nativeShare = async () => {
    const feed = cards.current.get("feed");
    const files = feed ? [new File([feed], `${recipe.id}.jpg`, { type: "image/jpeg" })] : [];
    const data: ShareData = { title: recipe.title, text, ...(shareUrl ? { url: shareUrl } : {}) };
    try {
      if (files.length && navigator.canShare?.({ ...data, files })) {
        await navigator.share({ ...data, files });
      } else {
        await navigator.share(data);
      }
    } catch {
      /* closed the share sheet */
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-walnut-900/40 data-[state=open]:animate-[fade-in_200ms_ease-out]" />
        <Dialog.Content
          data-share-status={link.status}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-sheet bg-cream-50 p-6 shadow-warm focus:outline-none data-[state=open]:animate-[drawer-up_320ms_var(--ease-soft)] sm:bottom-6 sm:rounded-card"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="type-h2 text-ink">{t("title")}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-muted">
                {recipe.title}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton aria-label={t("close")} className="-mr-2">
                <X aria-hidden />
              </IconButton>
            </Dialog.Close>
          </div>

          <div className="overflow-hidden rounded-card border border-border bg-cream-200">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local blob: preview
              <img
                src={preview}
                alt={t("previewAlt", { title: recipe.title })}
                className="mx-auto max-h-[42dvh] w-auto"
              />
            ) : (
              <div className="aspect-[4/5] max-h-[42dvh] animate-pulse motion-reduce:animate-none" />
            )}
          </div>

          <div aria-live="polite" className="min-h-6 text-[14px]">
            {link.status === "making" && <p className="text-ink-muted">{t("preparing")}</p>}
            {link.status === "none" && <p className="text-ink-muted">{link.reason}</p>}
            {link.status === "ready" && (
              <label className="flex flex-col gap-1">
                <span className="type-meta text-ink-muted">{t("linkLabel")}</span>
                <input
                  readOnly
                  value={link.url}
                  data-share-url
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-10 rounded-control border border-border bg-cream-100 px-3 text-[14px] text-ink"
                />
              </label>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {typeof navigator !== "undefined" && "share" in navigator && (
              <Button variant="primary" onClick={() => void nativeShare()} disabled={!preview}>
                <ShareNetwork aria-hidden />
                {t("share")}
              </Button>
            )}
            <a
              href={whatsappUrl(text, shareUrl ?? "")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-[#1F7A4D] px-4 text-[15px] font-medium text-white hover:bg-[#17603c]"
            >
              <WhatsappLogo weight="fill" aria-hidden className="size-5" />
              {t("whatsapp")}
            </a>
            {shareUrl && (
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard?.writeText(shareUrl).catch(() => undefined);
                  setCopied(true);
                }}
              >
                {copied ? <Check aria-hidden /> : <CopySimple aria-hidden />}
                {copied ? t("copied") : t("copy")}
              </Button>
            )}
            <Button variant="secondary" onClick={() => download("feed")} disabled={!preview}>
              <DownloadSimple aria-hidden />
              {t("downloadFeed")}
            </Button>
            <Button variant="secondary" onClick={() => download("story")} disabled={!preview}>
              <DownloadSimple aria-hidden />
              {t("downloadStory")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
