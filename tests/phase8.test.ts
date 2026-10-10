import { describe, expect, it, vi } from "vitest";
import { generateCacheKey } from "@/lib/ai/cacheKey";
import { FIXTURES } from "@/lib/ai/mock";
import { GenerateRequestSchema, type GenerateRequestInput } from "@/lib/ai/schema";
import { bearerToken, checkLimit, LIMITS, limitFor, limitKey, type LimitStore } from "@/lib/limits";
import { buildExport, exportFileName, keysToClear, readLocalData } from "@/lib/privacy";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => null }));

const req = (over: Partial<GenerateRequestInput> = {}) =>
  GenerateRequestSchema.parse({
    ingredients: [{ name: "Paneer" }, { name: "spinach" }, { name: "tomato", qty: "2" }],
    prefs: {
      diet: "vegetarian",
      cuisine: "any",
      maxMinutes: null,
      spice: 3,
      difficulty: "any",
      cookware: ["kadai", "pressure-cooker"],
      servings: 2,
      meal: "dinner",
    },
    locale: "en",
    ...over,
  });

describe("rate limits (docs/01 §7)", () => {
  const guest = { type: "guest", ipHash: "abc" } as const;
  const user = { type: "user", id: "u-1" } as const;

  it("gives guests 20 generations an hour and signed-in users 60", () => {
    expect(limitFor("generate", guest)).toBe(20);
    expect(limitFor("generate", user)).toBe(60);
    for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[])
      expect(LIMITS[k].user).toBeGreaterThan(LIMITS[k].guest);
  });

  it("counts users and guests under separate keys, never a raw IP", () => {
    expect(limitKey("generate", user)).toBe("generate:user:u-1");
    expect(limitKey("scan", guest)).toBe("scan:ip:abc");
  });

  it("uses the shared store, and falls back to the local one if it fails", async () => {
    const shared: LimitStore = vi.fn(async () => ({ ok: false, remaining: 0, retryAfterSec: 9 }));
    const local: LimitStore = vi.fn(async () => ({ ok: true, remaining: 5, retryAfterSec: 0 }));
    expect(await checkLimit("generate", user, shared, local)).toMatchObject({ ok: false });
    expect(shared).toHaveBeenCalledWith("generate:user:u-1", 60, 3600);
    expect(local).not.toHaveBeenCalled();

    const broken: LimitStore = async () => {
      throw new Error("db down");
    };
    expect(await checkLimit("generate", guest, broken, local)).toMatchObject({ ok: true });
    expect(local).toHaveBeenCalledWith("generate:ip:abc", 20, 3600);
  });

  it("only accepts a JWT-shaped bearer token", () => {
    const h = (v: string) => new Headers({ authorization: v });
    expect(bearerToken(h("Bearer aaa.bbb.ccc"))).toBe("aaa.bbb.ccc");
    expect(bearerToken(h("Bearer nope"))).toBeNull();
    expect(bearerToken(h("Basic aaa.bbb.ccc"))).toBeNull();
    expect(bearerToken(new Headers())).toBeNull();
  });
});

describe("response cache key", () => {
  const model = "gemini:test";

  it("ignores order, case and spacing of ingredients, pantry and cookware", () => {
    const a = generateCacheKey(req(), model);
    const b = generateCacheKey(
      req({
        ingredients: [{ name: "  TOMATO", qty: "2 " }, { name: "spinach" }, { name: "paneer" }],
        prefs: { ...req().prefs, cookware: ["pressure-cooker", "kadai"] },
      }),
      model,
    );
    expect(b).toBe(a);
  });

  it("changes with anything that changes the answer", () => {
    const a = generateCacheKey(req(), model);
    expect(generateCacheKey(req({ locale: "hi" }), model)).not.toBe(a);
    expect(generateCacheKey(req({ prefs: { ...req().prefs, spice: 5 } }), model)).not.toBe(a);
    expect(generateCacheKey(req({ exclude: ["Palak Paneer"] }), model)).not.toBe(a);
    expect(generateCacheKey(req({ wish: "Dosa" }), model)).not.toBe(a);
    expect(generateCacheKey(req({ pantry: ["salt"] }), model)).not.toBe(a);
    expect(generateCacheKey(req(), "anthropic:other")).not.toBe(a);
  });
});

describe("cached answers", () => {
  it("are only stored when complete, and replay as a normal stream", async () => {
    const { getCachedRecipes, putCachedRecipes, replayRecipes } = await import("@/lib/ai/cache");
    await putCachedRecipes("partial", FIXTURES.slice(0, 2));
    expect(await getCachedRecipes("partial")).toBeNull();

    await putCachedRecipes("full", FIXTURES.slice(0, 3));
    const hit = await getCachedRecipes("full");
    expect(hit?.map((r) => r.title)).toEqual(FIXTURES.slice(0, 3).map((r) => r.title));
    // ...and expire after 24 h
    expect(await getCachedRecipes("full", Date.now() + 25 * 3600_000)).toBeNull();

    const events = [];
    for await (const e of replayRecipes(hit!)) events.push(e);
    expect(events.filter((e) => e.type === "recipe")).toHaveLength(3);
    expect(events[0]).toMatchObject({ type: "progress" });
  });
});

describe("your data (export and delete)", () => {
  const storage = (entries: Record<string, string>) => ({
    length: Object.keys(entries).length,
    key: (i: number) => Object.keys(entries)[i] ?? null,
    getItem: (k: string) => entries[k] ?? null,
  });
  const store = storage({
    "lk-pantry": JSON.stringify({ state: { items: [{ name: "rice" }] } }),
    "lk-quality": "not json",
    "sb-abc-auth-token": "secret-session",
    "other-site": "x",
  });

  it("exports the app's own keys and never the sign-in session", () => {
    const local = readLocalData(store);
    expect(Object.keys(local)).toEqual(["lk-pantry", "lk-quality"]);
    expect(local["lk-pantry"]).toEqual({ state: { items: [{ name: "rice" }] } });
    expect(local["lk-quality"]).toBe("not json");
    const out = buildExport(local, null, new Date("2026-10-10T10:00:00Z"));
    expect(out).toMatchObject({ exportedAt: "2026-10-10T10:00:00.000Z", account: null });
    expect(JSON.stringify(out)).not.toContain("secret-session");
    expect(exportFileName(new Date("2026-10-10T10:00:00Z"))).toBe(
      "living-kitchen-data-2026-10-10.json",
    );
  });

  it("deletes the app's keys and the session, and leaves other sites' data alone", () => {
    expect(keysToClear(store, "sb-abc-auth-token").sort()).toEqual([
      "lk-pantry",
      "lk-quality",
      "sb-abc-auth-token",
    ]);
    expect(keysToClear(store, null)).not.toContain("other-site");
  });
});
