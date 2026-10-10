import { matchIngredient, normalize } from "./matchIngredient";

export type ScanItem = { name: string; confidence: number };

export type ReviewItem = {
  /** Dedupe key: dictionary id, or the normalized name */
  key: string;
  id: string | null;
  /** English dictionary name (or the cleaned model text), what gets added as a chip */
  name: string;
  confidence: number;
  /** Pre-checked in the review sheet (docs/01 F2: high confidence pre-checked) */
  checked: boolean;
};

/** At or above this, an item is pre-checked in the review sheet. */
export const HIGH_CONFIDENCE = 0.7;
/** Below this the model is guessing; such items are dropped. */
export const MIN_CONFIDENCE = 0.25;

/**
 * Model output → the review sheet's list: match each name to the dictionary, merge duplicates
 * (keeping the highest confidence), drop guesses, most confident first.
 */
export function toReviewItems(items: ScanItem[]): ReviewItem[] {
  const out = new Map<string, ReviewItem>();
  for (const item of items) {
    const confidence = Math.min(1, Math.max(0, item.confidence));
    const cleaned = normalize(item.name);
    if (!cleaned || confidence < MIN_CONFIDENCE) continue;
    const match = matchIngredient(cleaned);
    const key = match?.id ?? cleaned;
    const name = match?.names.en ?? cleaned.replace(/^\p{L}/u, (c) => c.toUpperCase());
    const prev = out.get(key);
    if (prev && prev.confidence >= confidence) continue;
    out.set(key, {
      key,
      id: match?.id ?? null,
      name,
      confidence,
      checked: confidence >= HIGH_CONFIDENCE,
    });
  }
  return [...out.values()].sort((a, b) => b.confidence - a.confidence);
}

/** Longest side for uploads (docs/01 F2): enough for a model to read a fridge shelf. */
export const SCAN_MAX_SIDE = 1024;

/** Target size for a photo resized to fit within `max` on its longest side. */
export function fitWithin(width: number, height: number, max = SCAN_MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
