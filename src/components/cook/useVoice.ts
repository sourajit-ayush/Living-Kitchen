"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { recognitionCtor, type Recognition } from "@/lib/speech";
import { parseVoiceIntent, type VoiceIntent } from "@/lib/voiceCommands";

export type VoiceState = "off" | "listening" | "denied" | "unsupported";

let speaking = "";
const plain = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim();

/** Read text aloud (the "repeat" command, and each new step while voice is on). */
export function speak(text: string, lang: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  speaking = plain(text);
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

/**
 * Hands-free Cook Mode (F9): continuous speech recognition in en-IN / hi-IN, turned into commands
 * by parseVoiceCommand. Recognition stops on its own after silence, so it restarts while on.
 * While a step is being read aloud, a phrase that is part of that text is treated as the app
 * hearing itself; anything else is a command, and interrupts the reading.
 */
export function useVoice(lang: string, onCommand: (intent: VoiceIntent) => void) {
  const [state, setState] = useState<VoiceState>("off");
  const [supported, setSupported] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const wanted = useRef(false);
  const handler = useRef(onCommand);
  useEffect(() => {
    handler.current = onCommand;
  }, [onCommand]);

  useEffect(() => setSupported(recognitionCtor() !== null), []);

  const stop = useCallback(() => {
    wanted.current = false;
    recognition.current?.abort();
    recognition.current = null;
    setState((s) => (s === "listening" ? "off" : s));
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return setState("unsupported");
    wanted.current = true;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0]?.transcript ?? "";
        const reading = window.speechSynthesis?.speaking && speaking;
        if (reading && plain(transcript) && speaking.includes(plain(transcript))) continue; // echo
        const intent = parseVoiceIntent(transcript);
        if (!intent) continue;
        if (reading) window.speechSynthesis.cancel(); // the cook interrupted: stop reading
        handler.current(intent);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wanted.current = false;
        setState("denied");
      }
    };
    rec.onend = () => {
      // Browsers end recognition after silence; keep listening while it's switched on.
      if (wanted.current && recognition.current === rec) {
        try {
          rec.start();
        } catch {
          /* already restarting */
        }
      }
    };
    recognition.current = rec;
    try {
      rec.start();
      setState("listening");
    } catch {
      setState("off");
    }
  }, [lang]);

  // Language change or leaving Cook Mode: stop cleanly.
  useEffect(() => stop, [stop, lang]);

  return { state, supported, start, stop };
}
