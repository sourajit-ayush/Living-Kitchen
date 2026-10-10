"use client";

import { Microphone, MicrophoneSlash, Stop, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/routing";
import { SPEECH_LANG } from "@/lib/speech";
import { IconButton } from "@/components/ui/Button";
import { useDictation } from "./useDictation";

/**
 * The mic button beside the ingredient input (F3) and its status line. Recognition starts in the
 * UI language; the cook can switch between English and an Indian language: Bengali on Bengali
 * pages, otherwise Hindi (Hinglish works in either).
 */
const SPEECH_LABELS: Record<Locale, string> = { en: "EN", hi: "हिं", bn: "বাং" };

export function useVoiceInput(locale: Locale, onPhrase: (text: string) => number) {
  const t = useTranslations("Voice");
  const [speechLocale, setSpeechLocale] = useState<Locale>(locale);
  const { state, supported, start, stop, dismiss } = useDictation(
    SPEECH_LANG[speechLocale],
    onPhrase,
  );
  const listening = state.status === "listening";
  // Switching language mid-listen restarts recognition in the new language.
  const restart = useRef(false);
  useEffect(() => {
    if (!restart.current) return;
    restart.current = false;
    start();
  }, [start]);
  const unavailable = supported === false;
  const choices: Locale[] = ["en", locale === "en" ? "hi" : locale];

  const button = (
    <span className="relative inline-flex" data-voice-input>
      <IconButton
        aria-label={unavailable ? t("unsupported") : listening ? t("stop") : t("start")}
        aria-pressed={unavailable ? undefined : listening}
        // Unsupported: a quiet, inert-looking mic whose tooltip explains why (docs/01 F3).
        aria-disabled={unavailable || undefined}
        title={unavailable ? t("unsupported") : undefined}
        onClick={() => (unavailable ? start() : listening ? stop() : start())}
        className={`h-12 w-12 border ${
          listening
            ? "animate-[pulse-soft_1.6s_ease-in-out_infinite] border-tomato-600 bg-tomato-600 text-white hover:bg-chilli-700 motion-reduce:animate-none"
            : unavailable
              ? "border-dashed border-border text-walnut-500"
              : "border-border bg-cream-50"
        }`}
      >
        {unavailable ? (
          <MicrophoneSlash aria-hidden className="size-5" />
        ) : listening ? (
          <Stop weight="fill" aria-hidden className="size-5" />
        ) : (
          <Microphone weight="duotone" aria-hidden className="size-5" />
        )}
      </IconButton>
    </span>
  );

  const message =
    state.status === "listening"
      ? state.interim
        ? t("heard", { text: state.interim })
        : t("listening")
      : state.status === "error"
        ? t(state.reason)
        : null;

  const caption = message ? (
    <div
      className="mt-2 flex items-center gap-2 rounded-control bg-cream-200/70 px-3 py-2 text-[14px] text-ink"
      data-voice-status={state.status}
    >
      {listening && (
        <span
          aria-hidden
          className="size-2 shrink-0 animate-pulse rounded-full bg-tomato-600 motion-reduce:animate-none"
        />
      )}
      <p role="status" className="min-w-0 flex-1">
        {message}
      </p>
      {listening && (
        <div
          role="group"
          aria-label={t("langLabel")}
          className="flex shrink-0 rounded-full border border-border bg-cream-50 p-0.5"
        >
          {choices.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={speechLocale === l}
              lang={l}
              onClick={() => {
                if (l === speechLocale) return;
                restart.current = true;
                setSpeechLocale(l);
              }}
              className={`rounded-full px-2 py-0.5 text-[12px] ${
                speechLocale === l ? "bg-walnut-900 text-cream-50" : "text-ink hover:bg-cream-200"
              }`}
            >
              {SPEECH_LABELS[l]}
            </button>
          ))}
        </div>
      )}
      {state.status === "error" && (
        <IconButton size="sm" aria-label={t("dismiss")} onClick={dismiss} className="-my-1">
          <X aria-hidden />
        </IconButton>
      )}
    </div>
  ) : null;

  return { button, caption, listening };
}
