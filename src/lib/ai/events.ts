import type { Recipe } from "./schema";

export type GenerateErrorCode =
  "bad_request" | "rate_limited" | "invalid_output" | "refused" | "upstream" | "config";

/** SSE events for POST /api/recipes/generate (docs/04 §4). */
export type GenerateEvent =
  | { type: "progress"; value: number; line?: string }
  | { type: "recipe"; index: number; recipe: Recipe }
  | { type: "done" }
  | { type: "error"; code: GenerateErrorCode; message: string };

export class GenerateError extends Error {
  constructor(
    public code: GenerateErrorCode,
    message: string,
  ) {
    super(message);
  }
}
