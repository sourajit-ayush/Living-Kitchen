"use client";

import { Plus } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useMemo, useRef, useState } from "react";
import type { Ingredient } from "@/data/ingredients";
import { searchIngredients } from "@/lib/matchIngredient";
import { Button } from "@/components/ui/Button";
import type { Locale } from "@/i18n/routing";
import { useScene } from "@/store/useScene";

/** The fragment after the last comma is what the user is currently typing. */
function currentFragment(text: string) {
  const i = text.lastIndexOf(",");
  return {
    before: i >= 0 ? text.slice(0, i) : "",
    fragment: (i >= 0 ? text.slice(i + 1) : text).trim(),
  };
}

export function IngredientCombobox({
  locale,
  onAddText,
  onAddIngredient,
  actions,
  below,
  label,
  placeholder,
  compact = false,
}: {
  locale: Locale;
  /** Desktop: the label is for screen readers only (the dock's "What I have" tab says it). */
  compact?: boolean;
  /** Defaults to the kitchen's "Add ingredients" */
  label?: string;
  placeholder?: string;
  onAddText: (text: string) => void;
  onAddIngredient: (ingredient: Ingredient) => void;
  /** Extra input buttons beside Add (the voice mic) */
  actions?: ReactNode;
  /** Rendered under the hint (voice status, scan button) */
  below?: ReactNode;
}) {
  const t = useTranslations("Dock");
  const baseId = useId();
  const listId = `${baseId}-list`;
  const hintId = `${baseId}-hint`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const { before, fragment } = currentFragment(text);
  const suggestions = useMemo(() => (fragment ? searchIngredients(fragment, 7) : []), [fragment]);
  const expanded = open && suggestions.length > 0;
  const other: Locale = locale === "en" ? "hi" : "en";

  const reset = () => {
    setText("");
    setActive(-1);
    setOpen(false);
  };

  const commitText = (value: string) => {
    if (value.trim()) onAddText(value);
    reset();
  };

  const pick = (ingredient: Ingredient) => {
    if (before.trim()) onAddText(before);
    onAddIngredient(ingredient);
    reset();
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (expanded && active >= 0) pick(suggestions[active]);
      else commitText(text);
    } else if (e.key === "," && fragment) {
      e.preventDefault();
      commitText(text);
    } else if (e.key === "Escape") {
      if (expanded) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      } else if (text) {
        e.preventDefault();
        reset();
      }
    }
  };

  return (
    <form
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        commitText(text);
      }}
    >
      <label
        htmlFor={`${baseId}-input`}
        className={`mb-2 block type-h3 text-ink ${compact ? "lg:sr-only" : ""}`}
      >
        {label ?? t("label")}
      </label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={`${baseId}-input`}
          type="text"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
          aria-describedby={hintId}
          autoComplete="off"
          autoCapitalize="none"
          enterKeyHint="done"
          placeholder={placeholder ?? t("placeholder")}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
          onFocus={() => {
            setOpen(true);
            useScene.getState().wantPhysics(); // warm up 3D physics before the first drop
          }}
          className="h-12 min-w-0 flex-1 rounded-control border border-border bg-cream-50 px-4 text-base text-ink placeholder:text-walnut-500 focus-visible:border-walnut-700"
          maxLength={1000}
        />
        <Button type="submit" size="md" className="h-12" disabled={!text.trim()}>
          <Plus weight="bold" aria-hidden />
          {t("add")}
        </Button>
        {actions}
      </div>
      <p id={hintId} className="mt-2 text-[13px] text-ink-muted lg:sr-only">
        {t("hint")}
      </p>
      {below}

      <ul
        id={listId}
        role="listbox"
        aria-label={t("suggestions")}
        hidden={!expanded}
        className={`absolute inset-x-0 top-[5.5rem] z-30 max-h-72 overflow-auto rounded-card p-1.5 glass ${compact ? "lg:top-[3.5rem]" : ""}`}
      >
        {suggestions.map((ing, i) => (
          <li
            key={ing.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            // mousedown (not click) so the input doesn't blur and close the list first
            onMouseDown={(e) => {
              e.preventDefault();
              pick(ing);
            }}
            onMouseMove={() => setActive(i)}
            className={`flex cursor-pointer items-center gap-3 rounded-[14px] px-3 py-2 ${
              i === active ? "bg-cream-200" : ""
            }`}
          >
            <span aria-hidden className="text-xl">
              {ing.emoji}
            </span>
            <span className="text-ink">{ing.names[locale]}</span>
            <span className="ml-auto text-sm text-ink-muted" lang={other}>
              {ing.names[other]}
            </span>
          </li>
        ))}
      </ul>
    </form>
  );
}
