"use client";

import { Check, ShareNetwork, Trash, WhatsappLogo, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AISLES } from "@/lib/pantry";
import { listAsText, listAsWhatsApp, whatsappTextUrl } from "@/lib/shoppingText";
import { live } from "@/lib/sync/rows";
import { useList, type ListItem } from "@/store/useList";
import { Button, IconButton } from "@/components/ui/Button";
import { AccountNote } from "@/components/account/AccountNote";

/** Shopping list (R8): grouped by aisle, tick off, share as text. */
export function ShoppingList() {
  const t = useTranslations("List");
  const all = useList((s) => s.items);
  const items = live(all);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const toBuy = items.filter((i) => !i.checked).length;
  const aisleName = (a: ListItem["aisle"]) => t(`aisles.${a}`);

  const share = async () => {
    const body = listAsText(items, t("shareTitle"), aisleName);
    try {
      if (navigator.share) {
        await navigator.share({ title: t("shareTitle"), text: body });
        return;
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return; // the user closed the share sheet
    }
    await navigator.clipboard?.writeText(body).catch(() => undefined);
    setStatus(t("copied"));
  };

  return (
    <div className="flex flex-col gap-6">
      <AccountNote />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = text.trim();
          if (!v) return;
          const m = v.match(/^((?:\d+(?:[.,/]\d+)?|½|¼|¾)\s*\S*)\s+(.+)$/);
          useList.getState().add(m ? { name: m[2], qty: m[1] } : { name: v });
          setText("");
        }}
      >
        <label htmlFor="list-add" className="sr-only">
          {t("add")}
        </label>
        <input
          id="list-add"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("placeholder")}
          maxLength={80}
          autoComplete="off"
          className="h-12 min-w-0 flex-1 rounded-control border border-border bg-cream-50 px-4 text-base text-ink placeholder:text-walnut-500"
        />
        <Button type="submit" className="h-12" disabled={!text.trim()}>
          {t("add")}
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-hand text-2xl text-walnut-700" data-to-buy={toBuy}>
          {t("left", { count: toBuy })}
        </p>
        <div className="flex gap-2">
          {items.some((i) => i.checked) && (
            <Button size="sm" variant="ghost" onClick={() => useList.getState().clearChecked()}>
              <Trash aria-hidden />
              {t("clearChecked")}
            </Button>
          )}
          {toBuy > 0 && (
            <a
              href={whatsappTextUrl(
                listAsWhatsApp(
                  items,
                  t("shareTitle"),
                  t("itemsCount", { count: toBuy }),
                  aisleName,
                ),
              )}
              target="_blank"
              rel="noopener noreferrer"
              data-whatsapp-list
              className="inline-flex h-9 items-center gap-1.5 rounded-control bg-[#1f7a4d] px-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#186640] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <WhatsappLogo weight="fill" aria-hidden className="size-4.5" />
              {t("whatsapp")}
            </a>
          )}
          {toBuy > 0 && (
            <Button size="sm" variant="secondary" onClick={() => void share()}>
              <ShareNetwork aria-hidden />
              {t("share")}
            </Button>
          )}
        </div>
      </div>
      <p role="status" className="sr-only">
        {status}
      </p>

      {items.length === 0 ? (
        <p className="rounded-chip border border-dashed border-walnut-500/40 px-4 py-6 text-center font-hand text-xl text-walnut-700">
          {t("empty")}
        </p>
      ) : (
        AISLES.map((aisle) => {
          const rows = items.filter((i) => i.aisle === aisle);
          if (!rows.length) return null;
          return (
            <section key={aisle} aria-labelledby={`aisle-${aisle}`} data-aisle={aisle}>
              <h2 id={`aisle-${aisle}`} className="mb-2 type-meta text-ink-muted">
                {aisleName(aisle)}
              </h2>
              <ul className="flex flex-col gap-1.5">
                {rows.map((item) => (
                  <li
                    key={item.key}
                    data-list-item={item.key}
                    className="flex items-center gap-3 rounded-control border border-border bg-cream-50 px-3 py-2"
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={item.checked}
                        onChange={() => useList.getState().toggle(item.key)}
                        aria-label={t("check", { name: item.name })}
                      />
                      <span
                        aria-hidden
                        className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-walnut-500 text-white peer-checked:border-basil-600 peer-checked:bg-basil-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink"
                      >
                        {item.checked && <Check weight="bold" className="size-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={`block text-[15px] ${item.checked ? "text-ink-muted line-through" : "text-ink"}`}
                        >
                          {item.name}
                          {item.qty && <span className="text-ink-muted"> · {item.qty}</span>}
                        </span>
                        {item.fromRecipe && (
                          <span className="block truncate text-[12px] text-ink-muted">
                            {t("fromRecipe", { title: item.fromRecipe })}
                          </span>
                        )}
                      </span>
                    </label>
                    <IconButton
                      size="sm"
                      aria-label={t("remove", { name: item.name })}
                      onClick={() => useList.getState().remove(item.name)}
                    >
                      <X weight="bold" aria-hidden />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
