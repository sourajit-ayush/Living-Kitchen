import { createHash } from "node:crypto";
import { systemPromptFor } from "./prompts";
import type { GenerateRequest } from "./schema";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** JSON with sorted object keys, so equal requests always serialise the same way. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * The cache key for a recipe request (docs/04 §4: hash of ingredients + prefs + locale). Order,
 * case and spacing don't matter: "Paneer, spinach" and "spinach,  paneer" are the same request.
 * `model` keeps answers from different providers or models apart.
 */
export function generateCacheKey(req: GenerateRequest, model: string): string {
  const canonical = {
    v: 2,
    model,
    // A change to the instructions retires old answers (e.g. a fixed alcohol or diet rule).
    prompt: createHash("sha256").update(systemPromptFor(req.mode)).digest("base64url").slice(0, 12),
    locale: req.locale,
    ingredients: req.ingredients
      .map((i) => ({
        name: norm(i.name),
        qty: i.qty ? norm(i.qty) : "",
        expiring: !!i.expiring,
        leftover: !!i.leftover,
      }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    pantry: [...new Set(req.pantry.map(norm))].sort(),
    prefs: { ...req.prefs, cookware: [...req.prefs.cookware].sort() },
    exclude: [...new Set(req.exclude.map(norm))].sort(),
    wish: req.wish ? norm(req.wish) : "",
    mode: req.mode,
    category: req.category,
    dish: req.dish ? norm(req.dish) : "",
  };
  return createHash("sha256").update(stable(canonical)).digest("base64url");
}
