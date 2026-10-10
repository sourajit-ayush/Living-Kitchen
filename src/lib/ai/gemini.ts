import "server-only";
import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel, type Content } from "@google/genai";
import { GenerateError, type GenerateEvent } from "./events";
import { z } from "zod";
import { geminiSchemaFor, sanitizeForGemini } from "./jsonSchema";
import { buildRetryPrompt, buildUserPrompt, systemPromptFor } from "./prompts";
import type { GenerateRequest } from "./schema";
import { parseJson, parseRecipeSet, progressFromChars } from "./validate";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.8-flash";

/**
 * Overload handling: Gemini returns 503 "high demand" spikes (each costs ~3–5 s), which the SDK
 * sometimes surfaces mid-stream as a JSON parse error. Alternate main → fallback → main → fallback
 * with short pauses, so a spike on one model rarely reaches the user.
 */
const CALL_PLAN: { model: string; delayMs: number }[] =
  FALLBACK_MODEL && FALLBACK_MODEL !== MODEL
    ? [
        { model: MODEL, delayMs: 0 },
        { model: FALLBACK_MODEL, delayMs: 0 },
        { model: MODEL, delayMs: 1000 },
        { model: FALLBACK_MODEL, delayMs: 2000 },
      ]
    : [
        { model: MODEL, delayMs: 0 },
        { model: MODEL, delayMs: 1000 },
      ];

const TRANSIENT_STATUS = new Set([500, 502, 503, 504]);

const BLOCKED: ReadonlySet<string> = new Set([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
  FinishReason.RECITATION,
]);

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (!ms) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason);
    });
  });

/** Worth retrying: server overload, or a stream that broke off (network / partial JSON frame). */
export function isTransient(error: unknown): boolean {
  if (error instanceof GenerateError) return false;
  if (error instanceof ApiError) return TRANSIENT_STATUS.has(error.status);
  return error instanceof Error;
}

function toGenerateError(error: unknown): GenerateError {
  if (error instanceof GenerateError) return error;
  if (error instanceof ApiError) {
    if (error.status === 429)
      return new GenerateError("rate_limited", "The AI quota is used up for now.");
    if (error.status === 400 || error.status === 401 || error.status === 403) {
      return new GenerateError("config", "The kitchen's AI key isn't set up correctly.");
    }
  }
  return new GenerateError("upstream", "The AI chef is very busy right now.");
}

/** One streamed call. Yields progress; returns the full text and finish reason. */
async function* streamOnce(
  model: string,
  contents: Content[],
  mode: GenerateRequest["mode"],
  signal?: AbortSignal,
): AsyncGenerator<GenerateEvent, { text: string; finishReason?: string }> {
  const stream = await getClient().models.generateContentStream({
    model,
    contents,
    config: {
      systemInstruction: systemPromptFor(mode),
      responseMimeType: "application/json",
      responseJsonSchema: geminiSchemaFor(mode),
      // Low thinking keeps latency near the 8 s target; recipes don't need deep reasoning.
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      maxOutputTokens: 16384,
      abortSignal: signal,
    },
  });

  let text = "";
  let finishReason: string | undefined;
  for await (const chunk of stream) {
    if (chunk.promptFeedback?.blockReason) {
      throw new GenerateError("refused", "The AI chef couldn't help with that request.");
    }
    const delta = chunk.text ?? "";
    if (delta) {
      text += delta;
      yield { type: "progress", value: progressFromChars(text.length, mode) };
    }
    finishReason = chunk.candidates?.[0]?.finishReason ?? finishReason;
  }
  return { text, finishReason };
}

/** Run the call plan until one streamed call completes; map the final failure to a GenerateError. */
async function* streamWithRetry(
  contents: Content[],
  mode: GenerateRequest["mode"],
  signal?: AbortSignal,
): AsyncGenerator<GenerateEvent, { text: string; finishReason?: string }> {
  let lastError: unknown;
  for (const { model, delayMs } of CALL_PLAN) {
    try {
      await sleep(delayMs, signal);
      return yield* streamOnce(model, contents, mode, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      const status = error instanceof ApiError ? error.status : "stream";
      console.warn(
        `[generate] Gemini ${model} failed (${status}): ${String((error as Error)?.message).slice(0, 160)}`,
      );
      if (!isTransient(error)) break;
    }
  }
  throw toGenerateError(lastError);
}

/**
 * Gemini recipe generation. Same contract as claudeGenerate: stream progress, validate the
 * whole JSON with Zod, retry once with the validation errors, then give up.
 */
export async function* geminiGenerate(
  req: GenerateRequest,
  signal?: AbortSignal,
): AsyncGenerator<GenerateEvent> {
  const contents: Content[] = [{ role: "user", parts: [{ text: buildUserPrompt(req) }] }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, finishReason } = yield* streamWithRetry(contents, req.mode, signal);

    if (finishReason && BLOCKED.has(finishReason)) {
      throw new GenerateError("refused", "The AI chef couldn't help with that request.");
    }

    const result = parseRecipeSet(
      text,
      finishReason === FinishReason.MAX_TOKENS,
      req.locale,
      req.mode,
    );
    if (result.ok) {
      for (const [index, recipe] of result.recipes.entries()) {
        yield { type: "recipe", index, recipe };
      }
      return;
    }

    console.warn(`[generate] Gemini validation failed (attempt ${attempt + 1})\n${result.issues}`);
    contents.push(
      { role: "model", parts: [{ text }] },
      { role: "user", parts: [{ text: buildRetryPrompt(result.issues, req.mode) }] },
    );
  }

  throw new GenerateError("invalid_output", "The recipes came out lumpy.");
}

/**
 * One non-streamed structured call (fridge scan, Surprise Me ideas): the same overload plan as
 * recipes, then Zod validation with one retry carrying the validation errors (golden rule 4).
 */
export async function geminiStructured<T>(
  parts: Content["parts"],
  schema: z.ZodType<T>,
  system: string,
  signal?: AbortSignal,
): Promise<T> {
  const jsonSchema = sanitizeForGemini(
    z.toJSONSchema(schema, { io: "output", unrepresentable: "any" }),
  ) as Record<string, unknown>;
  const contents: Content[] = [{ role: "user", parts }];

  for (let attempt = 0; attempt < 2; attempt++) {
    let text = "";
    let finishReason: string | undefined;
    let lastError: unknown;
    let answered = false;
    for (const { model, delayMs } of CALL_PLAN) {
      try {
        await sleep(delayMs, signal);
        const res = await getClient().models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: system,
            responseMimeType: "application/json",
            responseJsonSchema: jsonSchema,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            maxOutputTokens: 4096,
            abortSignal: signal,
          },
        });
        if (res.promptFeedback?.blockReason) {
          throw new GenerateError("refused", "The AI chef couldn't help with that request.");
        }
        text = res.text ?? "";
        finishReason = res.candidates?.[0]?.finishReason;
        answered = true;
        break;
      } catch (error) {
        if (signal?.aborted) throw error;
        lastError = error;
        console.warn(
          `[ai] Gemini ${model} failed: ${String((error as Error)?.message).slice(0, 160)}`,
        );
        if (!isTransient(error)) break;
      }
    }
    if (!answered) throw toGenerateError(lastError);
    if (finishReason && BLOCKED.has(finishReason)) {
      throw new GenerateError("refused", "The AI chef couldn't help with that request.");
    }

    const result = parseJson(text, schema);
    if (result.ok) return result.data;
    console.warn(`[ai] Gemini validation failed (attempt ${attempt + 1})\n${result.issues}`);
    contents.push(
      { role: "model", parts: [{ text }] },
      {
        role: "user",
        parts: [
          {
            text: `That JSON failed validation:\n${result.issues}\nAnswer again as one corrected JSON object.`,
          },
        ],
      },
    );
  }
  throw new GenerateError("invalid_output", "The answer came out lumpy.");
}
