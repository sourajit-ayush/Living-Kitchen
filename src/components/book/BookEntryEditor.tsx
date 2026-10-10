"use client";

import { Camera, Star } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { deletePhoto, photoUrl, uploadMadePhoto } from "@/lib/supabase/photos";
import { useAccount } from "@/store/useAccount";
import { ALL, useBook, type BookEntry } from "@/store/useBook";
import { Button } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";

export function useCollectionLabel() {
  const t = useTranslations("Book");
  return (name: string) =>
    name === ALL
      ? t("all")
      : name === "Weeknight" || name === "Guests"
        ? t(`collections.${name}`)
        : name;
}

/** Star rating as a radio group (arrow keys work, one tab stop). */
export function StarRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  const t = useTranslations("Book");
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1 type-meta text-ink-muted">{t("rating")}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="cursor-pointer rounded-full p-0.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink"
          >
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="sr-only"
              aria-label={t("stars", { count: n })}
            />
            <Star
              weight={value !== null && n <= value ? "fill" : "regular"}
              aria-hidden
              className={`size-7 ${value !== null && n <= value ? "text-saffron-400" : "text-walnut-500"}`}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function MadeItPhoto({ entry }: { entry: BookEntry }) {
  const t = useTranslations("Book");
  const ta = useTranslations("Account");
  const signedIn = useAccount((s) => s.status === "signedIn");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    setUrl(null);
    if (entry.photoPath && signedIn) void photoUrl(entry.photoPath).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [entry.photoPath, signedIn]);

  if (!signedIn) {
    return (
      <p className="text-[13px] text-ink-muted">
        {t("photoNeedsAccount")}{" "}
        <Link href="/signin" className="font-medium text-walnut-900 underline underline-offset-2">
          {ta("signIn")}
        </Link>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- a private, signed storage URL
        <img
          src={url}
          alt={t("photoAlt", { title: entry.recipe.title })}
          className="max-h-60 w-full rounded-card object-cover"
        />
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          setError("");
          try {
            const old = entry.photoPath;
            const path = await uploadMadePhoto(file, entry.key);
            useBook.getState().update(entry.key, { photoPath: path });
            if (old) void deletePhoto(old);
          } catch {
            setError(t("uploadFailed"));
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <Camera weight="duotone" aria-hidden />
        {busy ? t("uploading") : entry.photoPath ? t("changePhoto") : t("addPhoto")}
      </Button>
      {error && (
        <p role="alert" className="text-[13px] text-chilli-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Your notes on a saved recipe (R2): collection, rating, notes and a "Made it!" photo. */
export function BookEntryEditor({ entry }: { entry: BookEntry }) {
  const t = useTranslations("Book");
  const collections = useBook((s) => s.collections);
  const label = useCollectionLabel();
  const [notes, setNotes] = useState(entry.notes);
  const notesId = useId();
  const collectionId = useId();
  useEffect(() => setNotes(entry.notes), [entry.key, entry.notes]);
  const update = (patch: Parameters<ReturnType<typeof useBook.getState>["update"]>[1]) =>
    useBook.getState().update(entry.key, patch);

  return (
    <section
      aria-label={t("madeIt")}
      className="flex flex-col gap-4 rounded-card border border-border bg-cream-50 p-4"
    >
      <h3 className="font-hand text-2xl text-walnut-700">{t("madeIt")}</h3>
      <div className="flex flex-wrap items-end gap-6">
        <StarRating value={entry.rating} onChange={(rating) => update({ rating })} />
        <div className="flex flex-col gap-1">
          <label htmlFor={collectionId} className="type-meta text-ink-muted">
            {t("collection")}
          </label>
          <select
            id={collectionId}
            value={entry.collection}
            onChange={(e) => update({ collection: e.target.value })}
            className="h-10 rounded-control border border-border bg-cream-50 px-3 text-ink"
          >
            {[ALL, ...collections].map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={notesId} className="type-meta text-ink-muted">
          {t("notes")}
        </label>
        <textarea
          id={notesId}
          value={notes}
          maxLength={2000}
          rows={3}
          placeholder={t("notesPlaceholder")}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== entry.notes && update({ notes })}
          className="rounded-control border border-border bg-cream-50 px-3 py-2 text-ink placeholder:text-walnut-500"
        />
      </div>
      <MadeItPhoto entry={entry} />
    </section>
  );
}
