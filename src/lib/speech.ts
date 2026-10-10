/** Minimal typing of the Web Speech recognition API (not in TypeScript's DOM lib). */
export type RecognitionResultList = ArrayLike<
  ArrayLike<{ transcript: string }> & { isFinal?: boolean }
>;

export type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
export type RecognitionCtor = new () => Recognition;

/** The browser's speech recognition constructor, or null (Firefox, some in-app browsers). */
export function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Recognition language for a UI locale or an explicit choice (docs/01 F3: en-IN, hi-IN, bn-IN). */
export const SPEECH_LANG = { en: "en-IN", hi: "hi-IN", bn: "bn-IN" } as const;
