"use client";

import { Camera, Check, Question, ShieldCheck, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { INGREDIENTS_BY_ID } from "@/data/ingredients";
import type { Locale } from "@/i18n/routing";
import type { ScanResult } from "@/lib/ai/schema";
import { resizeForScan } from "@/lib/resizeImage";
import { toReviewItems, type ReviewItem } from "@/lib/scanItems";
import { Button, IconButton } from "@/components/ui/Button";
import { authHeaders } from "@/lib/supabase/client";

type ScanState =
  | { status: "looking" }
  | { status: "review"; items: ReviewItem[] }
  | { status: "error"; message: string };

/** Few enough finds that the sheet asks "anything else?" (docs/01 F2 acceptance). */
const FEW = 3;

/**
 * Fridge scan (F2): the photo is shrunk on the device, sent once to /api/scan, and the detected
 * ingredients come back as toggleable chips (confident ones pre-checked). Nothing is stored.
 */
export function ScanSheet({
  file,
  locale,
  onClose,
  onRetake,
  onAdd,
}: {
  file: File | null;
  locale: Locale;
  onClose: () => void;
  onRetake: () => void;
  onAdd: (items: ReviewItem[]) => void;
}) {
  const t = useTranslations("Scan");
  const [state, setState] = useState<ScanState>({ status: "looking" });
  const [preview, setPreview] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!file) return;
    const controller = new AbortController();
    let url: string | null = null;
    setState({ status: "looking" });
    void (async () => {
      let small: Blob;
      try {
        small = await resizeForScan(file);
      } catch {
        if (!controller.signal.aborted) setState({ status: "error", message: t("tooBig") });
        return;
      }
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(small);
      setPreview(url);
      const body = new FormData();
      body.append("image", small, "photo.jpg");
      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          body,
          headers: await authHeaders(),
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => null)) as
          (ScanResult & { error?: undefined }) | { error: { message: string } } | null;
        if (!res.ok || !json || json.error) {
          setState({ status: "error", message: json?.error?.message ?? t("failed") });
          return;
        }
        setState({ status: "review", items: toReviewItems(json.items) });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error", message: t("failed") });
      }
    })();
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
      setPreview(null);
    };
  }, [file, attempt, t]);

  const items = state.status === "review" ? state.items : [];
  const chosen = items.filter((i) => i.checked);
  const toggle = (key: string) =>
    setState((s) =>
      s.status === "review"
        ? { ...s, items: s.items.map((i) => (i.key === key ? { ...i, checked: !i.checked } : i)) }
        : s,
    );

  const description =
    state.status === "looking"
      ? t("lookingDetail")
      : state.status === "error"
        ? state.message
        : items.length === 0
          ? t("noneHint")
          : items.length <= FEW
            ? t("fewHint")
            : t("reviewHint");

  return (
    <Dialog.Root open={file !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-walnut-900/40 data-[state=open]:animate-[fade-in_200ms_ease-out]" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            titleRef.current?.focus();
          }}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-sheet bg-cream-50 shadow-warm focus:outline-none data-[state=open]:animate-[drawer-up_320ms_var(--ease-soft)] sm:bottom-6"
          data-scan-status={state.status}
        >
          <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <div className="min-w-0">
              <Dialog.Title asChild>
                <h2
                  ref={titleRef}
                  tabIndex={-1}
                  className="type-h2 text-ink focus:outline-none focus-visible:shadow-none focus-visible:outline-none"
                >
                  {state.status === "review" ? t("found", { count: items.length }) : t("title")}
                </h2>
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-muted" aria-live="polite">
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton aria-label={t("cancel")} className="-mr-2">
                <X aria-hidden />
              </IconButton>
            </Dialog.Close>
          </header>

          <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-4">
            {state.status === "looking" && (
              <div className="relative overflow-hidden rounded-card bg-cream-200" aria-busy="true">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local blob: preview
                  <img
                    src={preview}
                    alt={t("photoAlt")}
                    className="max-h-56 w-full object-cover opacity-80"
                  />
                ) : (
                  <div className="h-40" />
                )}
                <div
                  aria-hidden
                  className="absolute inset-0 animate-[scan-sweep_1.8s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-saffron-400/35 to-transparent motion-reduce:hidden"
                />
                <p className="absolute inset-x-0 bottom-0 bg-walnut-900/60 px-4 py-2 text-center font-hand text-xl text-cream-50">
                  {t("looking")}
                </p>
              </div>
            )}

            {state.status === "review" && items.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label={t("title")}>
                {items.map((item) => {
                  const dict = item.id ? INGREDIENTS_BY_ID.get(item.id) : undefined;
                  const label = dict?.names[locale] ?? item.name;
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        aria-pressed={item.checked}
                        onClick={() => toggle(item.key)}
                        data-scan-item={item.key}
                        className={`inline-flex items-center gap-2 rounded-full border py-1.5 pr-3 pl-2 text-[15px] transition-colors duration-150 ${
                          item.checked
                            ? "border-basil-600 bg-basil-600 text-white"
                            : "border-border bg-cream-50 text-ink hover:bg-cream-200"
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`flex size-6 items-center justify-center rounded-full ${
                            item.checked ? "bg-white/20" : "bg-cream-200"
                          }`}
                        >
                          {item.checked ? (
                            <Check weight="bold" className="size-3.5" />
                          ) : (
                            (dict?.emoji ?? "🫙")
                          )}
                        </span>
                        {label}
                        <span
                          className={`text-[12px] tabular ${
                            item.checked ? "text-white" : "text-ink-muted"
                          }`}
                        >
                          {item.confidence < 0.5 ? (
                            <>
                              <Question aria-hidden className="mr-0.5 inline size-3" />
                              {t("unsure")}
                            </>
                          ) : (
                            t("confidence", { value: Math.round(item.confidence * 100) })
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {state.status === "error" && (
              <Button
                variant="secondary"
                onClick={() => setAttempt((a) => a + 1)}
                className="self-start"
              >
                {t("retry")}
              </Button>
            )}

            <p className="flex items-start gap-2 text-[13px] text-ink-muted">
              <ShieldCheck
                weight="duotone"
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-basil-600"
              />
              {t("privacy")}
            </p>
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-border px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-sm:flex-col-reverse max-sm:items-stretch">
            <Button variant="ghost" onClick={onRetake}>
              <Camera weight="duotone" aria-hidden className="size-5" />
              {t("another")}
            </Button>
            {state.status === "review" && items.length > 0 && (
              <Button
                variant="primary"
                disabled={chosen.length === 0}
                onClick={() => onAdd(chosen)}
              >
                {t("addSelected", { count: chosen.length })}
              </Button>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
