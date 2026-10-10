import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ai/mock";
import { GEMINI_RECIPE_SCHEMA, sanitizeForGemini } from "@/lib/ai/jsonSchema";
import { aiProvider, isMockMode } from "@/lib/ai/provider";
import { parseRecipeSet } from "@/lib/ai/validate";

describe("provider selection", () => {
  it("defaults to anthropic and accepts gemini", () => {
    expect(aiProvider({})).toBe("anthropic");
    expect(aiProvider({ AI_PROVIDER: " Gemini " })).toBe("gemini");
    expect(aiProvider({ AI_PROVIDER: "something-else" })).toBe("anthropic");
  });

  it("uses mock mode when forced or when the selected provider has no key", () => {
    expect(
      isMockMode({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "k", NEXT_PUBLIC_MOCK_AI: "1" }),
    ).toBe(true);
    expect(isMockMode({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "  " })).toBe(true);
    expect(isMockMode({ AI_PROVIDER: "gemini", ANTHROPIC_API_KEY: "k" })).toBe(true);
    expect(
      isMockMode({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "k", NEXT_PUBLIC_MOCK_AI: "0" }),
    ).toBe(false);
    expect(isMockMode({ ANTHROPIC_API_KEY: "k" })).toBe(false);
  });
});

describe("Gemini response schema", () => {
  const allKeys = (node: unknown, parentIsNameMap = false): string[] => {
    if (Array.isArray(node)) return node.flatMap((n) => allKeys(n));
    if (!node || typeof node !== "object") return [];
    return Object.entries(node).flatMap(([k, v]) => [
      ...(parentIsNameMap ? [] : [k]),
      ...(k === "enum" || k === "required" ? [] : allKeys(v, k === "properties" || k === "$defs")),
    ]);
  };

  it("only uses keywords Gemini supports", () => {
    const keys = new Set(allKeys(GEMINI_RECIPE_SCHEMA));
    for (const banned of [
      "$schema",
      "pattern",
      "minLength",
      "maxLength",
      "exclusiveMinimum",
      "default",
    ]) {
      expect(keys.has(banned), banned).toBe(false);
    }
  });

  it("keeps the structure: required fields, enums, array bounds and closed objects", () => {
    const s = JSON.stringify(GEMINI_RECIPE_SCHEMA);
    expect(s).toContain('"best_match"');
    expect(s).toContain('"pressure-cooker"');
    expect(s).toContain('"missing_summary"');
    expect(s).toContain('"additionalProperties":false');
    expect(s).toContain('"minItems":3');
    expect(s).toContain('"maximum":12');
  });

  it("keeps property *names* that look like keywords", () => {
    const out = sanitizeForGemini({
      type: "object",
      properties: { pattern: { type: "string", pattern: "x" } },
    }) as { properties: Record<string, unknown> };
    expect(out.properties).toEqual({ pattern: { type: "string" } });
  });
});

describe("parseRecipeSet", () => {
  it("accepts the fixtures", () => {
    const r = parseRecipeSet(JSON.stringify({ recipes: FIXTURES }));
    expect(r.ok && r.recipes).toHaveLength(3);
  });

  it("reports truncated or invalid JSON and schema issues", () => {
    expect(parseRecipeSet('{"recipes": [', true)).toEqual({
      ok: false,
      issues: expect.stringContaining("cut off"),
    });
    expect(parseRecipeSet("not json")).toEqual({
      ok: false,
      issues: expect.stringContaining("not valid JSON"),
    });
    const bad = parseRecipeSet(JSON.stringify({ recipes: FIXTURES.slice(0, 2) }));
    expect(bad.ok).toBe(false);
  });
});
