import "server-only";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { GenerateEvent } from "./events";
import { aiProvider } from "./provider";
import { RecipeSchema, type Recipe } from "./schema";

/** docs/04 §4: repeat requests within 24 h get the same three recipes, without a model call. */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MEMORY_MAX = 200;

/** Three ideas, or the one recipe for a named dish. */
const CachedSchema = z
  .array(RecipeSchema)
  .min(1)
  .max(3)
  .refine((r) => r.length === 1 || r.length === 3);
const memory = new Map<string, { at: number; recipes: Recipe[] }>();

function remember(key: string, at: number, recipes: Recipe[]) {
  memory.delete(key);
  memory.set(key, { at, recipes });
  if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value!);
}

/** Which model answered: a change of provider or model starts a fresh cache. */
export function modelLabel(): string {
  const provider = aiProvider();
  const model = provider === "gemini" ? process.env.GEMINI_MODEL : process.env.ANTHROPIC_MODEL;
  return `${provider}:${model || "default"}`;
}

/** Cached recipes for this key, if fresh. Never throws: a cache problem just means a model call. */
export async function getCachedRecipes(key: string, now = Date.now()): Promise<Recipe[] | null> {
  const hit = memory.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.recipes;
  const db = supabaseAdmin();
  if (!db) return null;
  try {
    const { data } = await db
      .from("ai_cache")
      .select("payload, created_at")
      .eq("key", key)
      .maybeSingle<{ payload: unknown; created_at: string }>();
    if (!data) return null;
    const at = Date.parse(data.created_at);
    if (!(now - at < CACHE_TTL_MS)) return null;
    // Stored by us, but validated again like any AI output (golden rule 4).
    const parsed = CachedSchema.safeParse(data.payload);
    if (!parsed.success) return null;
    remember(key, at, parsed.data);
    return parsed.data;
  } catch {
    return null;
  }
}

/** Store a complete answer (three ideas, or one named dish). Old rows are swept now and then. */
export async function putCachedRecipes(key: string, recipes: Recipe[]): Promise<void> {
  if (!CachedSchema.safeParse(recipes).success) return;
  const now = Date.now();
  remember(key, now, recipes);
  const db = supabaseAdmin();
  if (!db) return;
  try {
    await db
      .from("ai_cache")
      .upsert({ key, kind: "generate", payload: recipes, created_at: new Date(now).toISOString() });
    if (Math.random() < 0.05) {
      await db
        .from("ai_cache")
        .delete()
        .lt("created_at", new Date(now - 2 * CACHE_TTL_MS).toISOString());
    }
  } catch {
    // caching is best-effort
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(id), resolve()), { once: true });
  });

/**
 * Play cached recipes back as a short stream: the pot still bubbles for a moment (the cook
 * animation needs a beat), then the three cards rise as usual.
 */
export async function* replayRecipes(
  recipes: Recipe[],
  signal?: AbortSignal,
): AsyncGenerator<GenerateEvent> {
  for (let i = 1; i <= 4; i++) {
    await sleep(220, signal);
    if (signal?.aborted) return;
    yield { type: "progress", value: (i / 4) * 0.9 };
  }
  for (const [index, recipe] of recipes.entries()) {
    await sleep(140, signal);
    if (signal?.aborted) return;
    yield { type: "recipe", index, recipe };
  }
}
