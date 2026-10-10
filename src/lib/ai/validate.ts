import type { z } from "zod";
import {
  DishRecipeSetSchema,
  formatIssues,
  isSingleRecipe,
  RecipeSetSchema,
  type GenerateMode,
  type Recipe,
} from "./schema";
import type { Locale } from "@/i18n/routing";

/** Rough size of a JSON response; only used to turn streamed chars into progress. */
const EXPECTED_CHARS: Record<GenerateMode, number> = {
  ingredients: 9000,
  dish: 3600,
  tonight: 3600,
};

export function progressFromChars(chars: number, mode: GenerateMode = "ingredients"): number {
  return Math.min(0.95, 0.1 + (chars / EXPECTED_CHARS[mode]) * 0.85);
}

export type ParseResult = { ok: true; recipes: Recipe[] } | { ok: false; issues: string };

/** The script each non-English locale is written in: Devanagari (Hindi), Bengali (Bangla). */
const SCRIPTS: Partial<Record<Locale, { re: RegExp; name: string }>> = {
  hi: { re: /[ऀ-ॿ]/, name: "Hindi (Devanagari script)" },
  bn: { re: /[ঀ-৿]/, name: "Bengali (Bengali script)" },
};

/**
 * Recipes must be in the language that was asked for (R6). Schema-valid JSON can still be in the
 * wrong language (seen with Hindi on the lite model): for Hindi and Bengali, every reader-facing
 * sentence must be written in that script, or the answer gets the one retry with the reason.
 */
export function languageIssues(recipes: Recipe[], locale: Locale): string[] {
  const issues: string[] = [];
  const script = SCRIPTS[locale];
  recipes.forEach((r, i) => {
    if (r.locale !== locale) issues.push(`- recipes.${i}.locale: must be "${locale}"`);
    if (!script) return;
    const fields: [string, string | null][] = [
      ["title", r.title],
      ["tagline", r.tagline],
      ["missing_summary", r.missing_summary],
      ...r.steps.map((s, j) => [`steps.${j}.text`, s.text] as [string, string]),
    ];
    for (const [path, value] of fields) {
      if (value && !script.re.test(value)) {
        issues.push(`- recipes.${i}.${path}: write it in ${script.name}`);
      }
    }
  });
  return issues.slice(0, 20);
}

/**
 * Validate a model's raw JSON text against the recipe set schema (and, given the requested
 * locale, its language). Provider-agnostic: every model's output goes through this (AI output
 * is untrusted, golden rule 4).
 */
export function parseRecipeSet(
  text: string,
  truncated = false,
  locale?: Locale,
  mode: GenerateMode = "ingredients",
): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      ok: false,
      issues: truncated
        ? "- the response was cut off before the JSON finished; keep steps and tips concise"
        : "- the response was not valid JSON",
    };
  }
  // Three ideas from the counter, or one recipe (a named dish, or tonight's pick).
  const result = (isSingleRecipe(mode) ? DishRecipeSetSchema : RecipeSetSchema).safeParse(json);
  if (!result.success) return { ok: false, issues: formatIssues(result.error) };
  const wrongLanguage = locale ? languageIssues(result.data.recipes, locale) : [];
  return wrongLanguage.length
    ? { ok: false, issues: wrongLanguage.join("\n") }
    : { ok: true, recipes: result.data.recipes };
}

/** Validate any model JSON answer against a Zod schema (scan results, Surprise Me ideas). */
export function parseJson<T>(
  text: string,
  schema: z.ZodType<T>,
): { ok: true; data: T } | { ok: false; issues: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, issues: "- the response was not valid JSON" };
  }
  const result = schema.safeParse(json);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, issues: formatIssues(result.error) };
}
