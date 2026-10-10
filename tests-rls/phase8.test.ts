import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ai/mock";
import { deleteAccountData } from "@/lib/supabase/deleteAccount";

/**
 * Phase 8 against the real project: the shared rate limiter, that browsers can't touch the
 * limiter or the AI cache, and that "Delete my data" really removes everything.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(URL && ANON && SERVICE);

describe.skipIf(!configured)("Phase 8 hardening", () => {
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  const key = `test:ip:${randomUUID()}`;

  beforeAll(() => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    anon = createClient(URL!, ANON!, { auth: { persistSession: false } });
  });

  // If an assertion fails before the deletion runs, still remove the throwaway account.
  const cleanup: (() => Promise<void>)[] = [];

  afterAll(async () => {
    await admin?.from("rate_limits").delete().eq("key", key);
    for (const fn of cleanup) await fn().catch(() => undefined);
  });

  it("the shared limiter counts across calls and blocks over the limit", async () => {
    const hit = () =>
      admin
        .rpc("hit_rate_limit", { p_key: key, p_limit: 2, p_window_seconds: 3600 })
        .single<{ ok: boolean; remaining: number; retry_after: number }>();
    expect((await hit()).data).toMatchObject({ ok: true, remaining: 1, retry_after: 0 });
    expect((await hit()).data).toMatchObject({ ok: true, remaining: 0 });
    const third = (await hit()).data!;
    expect(third.ok).toBe(false);
    expect(third.retry_after).toBeGreaterThan(3500);
  });

  it("browsers can't call the limiter or read the limiter and cache tables", async () => {
    const call = await anon.rpc("hit_rate_limit", { p_key: key, p_limit: 1, p_window_seconds: 1 });
    expect(call.error).not.toBeNull();
    for (const table of ["rate_limits", "ai_cache"]) {
      const { data } = await anon.from(table).select("*").limit(1);
      expect(data ?? [], table).toEqual([]);
      const ins = await anon.from(table).insert({ key: "x", kind: "x", payload: {} });
      expect(ins.error, table).not.toBeNull();
    }
  });

  it("deleting an account removes its rows, its recipes and its photos", async () => {
    const email = `lk-del-${randomUUID().slice(0, 8)}@example.com`;
    const password = `pw-${randomUUID()}`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const uid = created.data.user!.id;
    cleanup.push(async () => {
      await admin.storage.from("made-photos").remove([`${uid}/made.jpg`]);
      await admin.from("recipes").delete().eq("author_id", uid);
      await admin.auth.admin.deleteUser(uid);
    });
    const me = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await me.auth.signInWithPassword({ email, password });

    await me
      .from("pantry_items")
      .insert({ user_id: uid, key: "rice", name: "Rice", category: "grain" });
    await me
      .from("shopping_list")
      .insert({ user_id: uid, key: "curd", name: "Curd", aisle: "dairy" });
    const recipe = await me
      .from("recipes")
      .insert({ slug: `del-${randomUUID().slice(0, 8)}`, author_id: uid, data: FIXTURES[0] })
      .select("id")
      .single();
    const recipeId = recipe.data!.id as string;
    await me.from("saved_recipes").insert({ user_id: uid, key: "k", recipe_id: recipeId });
    const photo = await me.storage
      .from("made-photos")
      .upload(
        `${uid}/made.jpg`,
        new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }),
        {
          contentType: "image/jpeg",
        },
      );
    expect(photo.error).toBeNull();

    await deleteAccountData(admin, uid);

    for (const [table, col] of [
      ["pantry_items", "user_id"],
      ["shopping_list", "user_id"],
      ["saved_recipes", "user_id"],
      ["profiles", "id"],
    ] as const) {
      const { data } = await admin.from(table).select("*").eq(col, uid);
      expect(data, table).toEqual([]);
    }
    expect((await admin.from("recipes").select("id").eq("id", recipeId)).data).toEqual([]);
    expect((await admin.storage.from("made-photos").list(uid)).data ?? []).toEqual([]);
    expect((await admin.auth.admin.getUserById(uid)).data.user).toBeNull();
  });
});
