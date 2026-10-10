"use client";

import { SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import { useSound } from "@/store/useSound";

/** Header toggle for the optional kitchen sounds (off by default, docs/02 §7). */
export function SoundToggle({ label }: { label: string }) {
  const enabled = useSound((s) => s.enabled);
  const Icon = enabled ? SpeakerHigh : SpeakerSlash;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={enabled}
      title={label}
      onClick={() => useSound.getState().toggle()}
      className="flex size-10 items-center justify-center rounded-full text-ink glass transition-colors duration-150 hover:bg-cream-200 aria-pressed:bg-walnut-900 aria-pressed:text-cream-50"
    >
      <Icon aria-hidden className="size-5" weight={enabled ? "fill" : "regular"} />
    </button>
  );
}
