import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { GenerateError, type GenerateEvent } from "./events";
import { buildRetryPrompt, buildUserPrompt, systemPromptFor } from "./prompts";
import {
  DishRecipeSetSchema,
  isSingleRecipe,
  RecipeSetSchema,
  type GenerateRequest,
} from "./schema";
import { parseJson, parseRecipeSet, progressFromChars } from "./validate";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY from the server environment
  return client;
}

/**
 * Structured outputs instead of a forced `return_recipes` tool: Claude Sonnet 5.5 rejects forced
 * tool_choice with a 400. The JSON schema is derived from the same Zod schema we validate with.
 */
const RECIPE_FORMAT = zodOutputFormat(RecipeSetSchema);
const DISH_FORMAT = zodOutputFormat(DishRecipeSetSchema);

function extractText(message: Anthropic.Beta.BetaMessage): string {
  return message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export async function* claudeGenerate(
  req: GenerateRequest,
  signal?: AbortSignal,
): AsyncGenerator<GenerateEvent> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: buildUserPrompt(req) },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    let message: Anthropic.Beta.BetaMessage;
    try {
      const stream = getClient().beta.messages.stream(
        {
          model: MODEL,
          max_tokens: 32000,
          betas: ["server-side-fallback-2026-07-01"],
          // On a safety-classifier decline, the API re-runs the request on a fallback model.
          fallbacks: "default",
          system: [
            {
              type: "text",
              text: systemPromptFor(req.mode),
              cache_control: { type: "ephemeral" },
            },
          ],
          messages,
          // Low effort keeps p50 latency near the 8 s target; recipes don't need deep reasoning.
          output_config: {
            effort: "low",
            format: isSingleRecipe(req.mode) ? DISH_FORMAT : RECIPE_FORMAT,
          },
        },
        { signal },
      );

      let chars = 0;
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          chars += event.delta.text.length;
          yield { type: "progress", value: progressFromChars(chars, req.mode) };
        }
      }
      message = await stream.finalMessage();
    } catch (error) {
      if (signal?.aborted) throw error;
      if (
        error instanceof Anthropic.AuthenticationError ||
        error instanceof Anthropic.PermissionDeniedError
      ) {
        throw new GenerateError("config", "The kitchen's AI key isn't set up correctly.");
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new GenerateError("rate_limited", "The AI quota is used up for now.");
      }
      if (error instanceof Anthropic.InternalServerError) {
        throw new GenerateError("upstream", "The kitchen is very busy right now.");
      }
      if (error instanceof Anthropic.APIError) {
        console.error("[generate] Claude API error", error.status, error.message);
        throw new GenerateError("upstream", "The AI chef didn't answer.");
      }
      throw error;
    }

    if (message.stop_reason === "refusal") {
      throw new GenerateError("refused", "The AI chef couldn't help with that request.");
    }

    const result = parseRecipeSet(
      extractText(message),
      message.stop_reason === "max_tokens",
      req.locale,
      req.mode,
    );
    if (result.ok) {
      for (const [index, recipe] of result.recipes.entries()) {
        yield { type: "recipe", index, recipe };
      }
      return;
    }
    const { issues } = result;

    console.warn(`[generate] validation failed (attempt ${attempt + 1})\n${issues}`);
    // Append-only retry: keep the model's turn, add the validation errors as feedback.
    messages.push(
      { role: "assistant", content: message.content },
      { role: "user", content: buildRetryPrompt(issues, req.mode) },
    );
  }

  throw new GenerateError("invalid_output", "The recipes came out lumpy.");
}

/**
 * One structured Claude call (fridge scan with vision, Surprise Me ideas), validated with Zod and
 * retried once with the validation errors appended.
 */
export async function claudeStructured<T>(
  content: Anthropic.Beta.BetaContentBlockParam[],
  schema: z.ZodType<T>,
  system: string,
  signal?: AbortSignal,
  model = MODEL,
): Promise<T> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];
  for (let attempt = 0; attempt < 2; attempt++) {
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await getClient().beta.messages.create(
        {
          model,
          max_tokens: 4096,
          system,
          messages,
          output_config: { effort: "low", format: zodOutputFormat(schema) },
        },
        { signal },
      );
    } catch (error) {
      if (signal?.aborted) throw error;
      if (
        error instanceof Anthropic.AuthenticationError ||
        error instanceof Anthropic.PermissionDeniedError
      ) {
        throw new GenerateError("config", "The kitchen's AI key isn't set up correctly.");
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new GenerateError("rate_limited", "The AI quota is used up for now.");
      }
      if (error instanceof Anthropic.APIError) {
        console.error("[ai] Claude API error", error.status, error.message);
      }
      throw new GenerateError("upstream", "The AI chef didn't answer.");
    }
    if (message.stop_reason === "refusal") {
      throw new GenerateError("refused", "The AI chef couldn't help with that request.");
    }
    const text = extractText(message);
    const result = parseJson(text, schema);
    if (result.ok) return result.data;
    console.warn(`[ai] Claude validation failed (attempt ${attempt + 1})\n${result.issues}`);
    messages.push(
      { role: "assistant", content: message.content },
      {
        role: "user",
        content: `That JSON failed validation:\n${result.issues}\nAnswer again as one corrected JSON object.`,
      },
    );
  }
  throw new GenerateError("invalid_output", "The answer came out lumpy.");
}
