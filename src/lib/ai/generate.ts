import "server-only";
import { claudeGenerate } from "./claude";
import type { GenerateEvent } from "./events";
import { geminiGenerate } from "./gemini";
import { mockGenerate } from "./mock";
import { aiProvider, isMockMode } from "./provider";
import type { GenerateRequest } from "./schema";

/** Single entry point for recipe generation: mock fixtures, Claude or Gemini (AI_PROVIDER). */
export function generateRecipes(
  req: GenerateRequest,
  signal?: AbortSignal,
): AsyncGenerator<GenerateEvent> {
  if (isMockMode()) return mockGenerate(req, signal);
  return aiProvider() === "gemini" ? geminiGenerate(req, signal) : claudeGenerate(req, signal);
}
