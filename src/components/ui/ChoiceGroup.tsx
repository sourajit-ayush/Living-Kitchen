"use client";

import { useId } from "react";

type Option<T extends string> = { value: T; label: string };

/**
 * Pill-style radio group (single) or checkbox group (multiple) built on native inputs,
 * so arrow-key navigation and screen-reader semantics come for free.
 */
export function ChoiceGroup<T extends string>({
  legend,
  hint,
  options,
  value,
  onChange,
  multiple = false,
}: {
  legend: string;
  hint?: string;
  options: Option<T>[];
  value: T | T[];
  onChange: (value: T | T[]) => void;
  multiple?: boolean;
}) {
  const name = useId();
  const selected = new Set(Array.isArray(value) ? value : [value]);
  const hintId = hint ? `${name}-hint` : undefined;

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={hintId}>
      <legend className="mb-2 type-meta text-ink">{legend}</legend>
      {hint && (
        <p id={hintId} className="-mt-1 text-[13px] text-ink-muted">
          {hint}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const checked = selected.has(opt.value);
          return (
            <label
              key={opt.value}
              className={`relative cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                checked
                  ? "border-walnut-900 bg-walnut-900 text-cream-50"
                  : "border-border bg-surface text-ink hover:bg-cream-200"
              }`}
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                name={name}
                value={opt.value}
                checked={checked}
                onChange={(e) => {
                  if (!multiple) return onChange(opt.value);
                  const next = new Set(selected);
                  if (e.target.checked) next.add(opt.value);
                  else next.delete(opt.value);
                  onChange(options.map((o) => o.value).filter((v) => next.has(v)));
                }}
                className="sr-only"
              />
              {opt.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
