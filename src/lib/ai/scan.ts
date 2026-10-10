import "server-only";
import { claudeStructured } from "./claude";
import { geminiStructured } from "./gemini";
import { SCAN_PROMPT } from "./prompts";
import { aiProvider, isMockMode } from "./provider";
import { ScanResultSchema, type ScanResult } from "./schema";

export { sniffImage } from "@/lib/imageSniff";
export type ScanImage = { bytes: Uint8Array; mime: "image/jpeg" | "image/png" | "image/webp" };

/** Deterministic mock: a plausible Indian fridge, with a couple of low-confidence guesses. */
export const MOCK_SCAN: ScanResult = {
  items: [
    { name: "spinach", confidence: 0.94 },
    { name: "paneer", confidence: 0.9 },
    { name: "tomato", confidence: 0.88 },
    { name: "eggs", confidence: 0.86 },
    { name: "curd", confidence: 0.78 },
    { name: "capsicum", confidence: 0.62 },
    { name: "lemon", confidence: 0.48 },
  ],
};

/** Photo → detected ingredients with confidence (docs/04 §4 POST /api/scan). Not stored. */
export async function scanImage(image: ScanImage, signal?: AbortSignal): Promise<ScanResult> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 900)); // feel like a real look at the photo
    return MOCK_SCAN;
  }
  const base64 = Buffer.from(image.bytes).toString("base64");
  if (aiProvider() === "gemini") {
    return geminiStructured(
      [{ inlineData: { mimeType: image.mime, data: base64 } }, { text: "Here is the photo." }],
      ScanResultSchema,
      SCAN_PROMPT,
      signal,
    );
  }
  return claudeStructured(
    [
      { type: "image", source: { type: "base64", media_type: image.mime, data: base64 } },
      { type: "text", text: "Here is the photo." },
    ],
    ScanResultSchema,
    SCAN_PROMPT,
    signal,
    process.env.ANTHROPIC_VISION_MODEL || undefined,
  );
}
