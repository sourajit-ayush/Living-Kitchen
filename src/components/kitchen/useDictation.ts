"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { recognitionCtor, type Recognition } from "@/lib/speech";

export type DictationState =
  | { status: "idle" }
  | { status: "listening"; interim: string }
  | { status: "error"; reason: "denied" | "noSpeech" | "nothing" | "unsupported" | "error" };

/**
 * Voice input for ingredients (F3): Web Speech recognition in en-IN or hi-IN. Each finished phrase
 * is handed over as soon as it is final, so chips drop while the cook is still talking; listening
 * ends after a pause (the browser decides) or on Stop. `onPhrase` returns how many ingredients
 * it understood, so a session that added nothing can say so.
 */
export function useDictation(lang: string, onPhrase: (text: string) => number) {
  const [state, setState] = useState<DictationState>({ status: "idle" });
  const [supported, setSupported] = useState<boolean | null>(null);
  const rec = useRef<Recognition | null>(null);
  const added = useRef(0);
  const heard = useRef(false);
  const handler = useRef(onPhrase);
  useEffect(() => {
    handler.current = onPhrase;
  }, [onPhrase]);

  useEffect(() => setSupported(recognitionCtor() !== null), []);

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return setState({ status: "error", reason: "unsupported" });
    rec.current?.abort();
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    added.current = 0;
    heard.current = false;
    let failed = false;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0]?.transcript ?? "";
        if (text.trim()) heard.current = true;
        // Results without isFinal (some engines) are treated as final.
        if (result.isFinal === false) interim += text;
        else if (text.trim()) added.current += handler.current(text);
      }
      setState({ status: "listening", interim: interim.trim() });
    };
    r.onerror = (e) => {
      failed = true;
      if (e.error === "aborted") return;
      const reason =
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "denied"
          : e.error === "no-speech"
            ? "noSpeech"
            : "error";
      setState({ status: "error", reason });
    };
    r.onend = () => {
      if (rec.current === r) rec.current = null;
      if (failed) return;
      setState(
        heard.current && added.current === 0
          ? { status: "error", reason: "nothing" }
          : !heard.current
            ? { status: "error", reason: "noSpeech" }
            : { status: "idle" },
      );
    };
    rec.current = r;
    try {
      r.start();
      setState({ status: "listening", interim: "" });
    } catch {
      setState({ status: "error", reason: "error" });
    }
  }, [lang]);

  const dismiss = useCallback(() => setState({ status: "idle" }), []);

  // Leaving the page (or switching language mid-sentence) stops cleanly.
  useEffect(
    () => () => {
      rec.current?.abort();
      rec.current = null;
    },
    [lang],
  );

  return { state, supported, start, stop, dismiss };
}
