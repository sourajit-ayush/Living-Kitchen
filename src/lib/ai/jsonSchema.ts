import { z } from "zod";
import { DishRecipeSetSchema, isSingleRecipe, RecipeSetSchema, type GenerateMode } from "./schema";

/**
 * JSON Schema keywords Gemini's `responseJsonSchema` accepts (from the @google/genai docs).
 * Anything else (pattern, minLength, maxLength, $schema…) is dropped here and enforced by Zod.
 */
const GEMINI_KEYWORDS = new Set([
  "$id",
  "$defs",
  "$ref",
  "$anchor",
  "type",
  "format",
  "title",
  "description",
  "enum",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "anyOf",
  "oneOf",
  "properties",
  "additionalProperties",
  "required",
  "propertyOrdering",
]);

/** Keys whose values are maps of *names* → schemas, not keywords. */
const NAME_MAPS = new Set(["properties", "$defs"]);

export function sanitizeForGemini(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeForGemini);
  if (!node || typeof node !== "object") return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (!GEMINI_KEYWORDS.has(key)) continue;
    if (NAME_MAPS.has(key) && value && typeof value === "object") {
      out[key] = Object.fromEntries(
        Object.entries(value).map(([name, schema]) => [name, sanitizeForGemini(schema)]),
      );
    } else if (key === "enum" || key === "required" || key === "propertyOrdering") {
      out[key] = value;
    } else {
      out[key] = sanitizeForGemini(value);
    }
  }
  return out;
}

/** The recipe-set schema as Gemini-compatible JSON Schema, generated from the Zod source of truth. */
export const GEMINI_RECIPE_SCHEMA = sanitizeForGemini(
  z.toJSONSchema(RecipeSetSchema, { io: "output", unrepresentable: "any" }),
) as Record<string, unknown>;

/** "Name a dish": the same, with exactly one recipe. */
export const GEMINI_DISH_SCHEMA = sanitizeForGemini(
  z.toJSONSchema(DishRecipeSetSchema, { io: "output", unrepresentable: "any" }),
) as Record<string, unknown>;

export function geminiSchemaFor(mode: GenerateMode): Record<string, unknown> {
  return isSingleRecipe(mode) ? GEMINI_DISH_SCHEMA : GEMINI_RECIPE_SCHEMA;
}
