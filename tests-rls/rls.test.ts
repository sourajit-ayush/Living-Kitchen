import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ai/mock";

/**
 * Phase 6 DoD: another user cannot read (or change) your data. Two throwaway users are created
 * with the service key, each signs in like a real browser (anon key + password), and B tries to
 * read, update, delete and impersonate A's rows. Everything is cleaned up afterwards.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(URL && ANON && SERVICE);

type User = { id: string; email: string; client: SupabaseClient };

async function makeUser(admin: SupabaseClient, label: string): Promise<User> {
  const email = `lk-rls-${label}-${randomUUID().slice(0, 8)}@example.com`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const client = createClient(URL!, ANON!, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, client };
}

describe.skipIf(!configured)("row-level security", () => {
  let admin: SupabaseClient;
  let a: User;
  let b: User;
  let anon: SupabaseClient;
  let recipeId: string;
  let publicRecipeId: string;
  const photoPath = () => `${a.id}/rls-test.jpg`;

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    anon = createClient(URL!, ANON!, { auth: { persistSession: false } });
    a = await makeUser(admin, "a");
    b = await makeUser(admin, "b");

    // A's data, written as A (through RLS, like the app does).
    const pantry = await a.client
      .from("pantry_items")
      .insert({ user_id: a.id, key: "paneer", name: "Paneer", category: "dairy" });
    expect(pantry.error).toBeNull();
    const list = await a.client
      .from("shopping_list")
      .insert({ user_id: a.id, key: "curd", name: "Curd", aisle: "dairy" });
    expect(list.error).toBeNull();
    const recipe = await a.client
      .from("recipes")
      .insert({ slug: `rls-${randomUUID().slice(0, 8)}`, author_id: a.id, data: FIXTURES[0] })
      .select("id")
      .single();
    expect(recipe.error).toBeNull();
    recipeId = recipe.data!.id;
    const shared = await a.client
      .from("recipes")
      .insert({
        slug: `rls-public-${randomUUID().slice(0, 8)}`,
        author_id: a.id,
        data: FIXTURES[1],
        is_public: true,
      })
      .select("id")
      .single();
    publicRecipeId = shared.data!.id;
    const saved = await a.client
      .from("saved_recipes")
      .insert({ user_id: a.id, key: "bhurji", recipe_id: recipeId, notes: "secret family tweak" });
    expect(saved.error).toBeNull();
    const photo = await a.client.storage
      .from("made-photos")
      .upload(photoPath(), new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), {
        contentType: "image/jpeg",
      });
    expect(photo.error).toBeNull();
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.storage.from("made-photos").remove([photoPath()]);
    // Deleting a user keeps their recipes (author set to null), so remove them explicitly.
    const ids = [recipeId, publicRecipeId].filter(Boolean);
    if (ids.length) await admin.from("recipes").delete().in("id", ids);
    for (const u of [a, b]) if (u) await admin.auth.admin.deleteUser(u.id);
  });

  it("A sees their own rows", async () => {
    for (const table of ["pantry_items", "shopping_list", "saved_recipes"]) {
      const { data } = await a.client.from(table).select("*");
      expect(data, table).toHaveLength(1);
    }
    const { data: profile } = await a.client.from("profiles").select("id");
    expect(profile).toEqual([{ id: a.id }]);
  });

  it("B can't read A's pantry, list, saved recipes, private recipe or profile", async () => {
    for (const table of ["pantry_items", "shopping_list", "saved_recipes", "profiles"]) {
      const { data } = await b.client
        .from(table)
        .select("*")
        .eq(table === "profiles" ? "id" : "user_id", a.id);
      expect(data, table).toEqual([]);
    }
    const { data } = await b.client.from("recipes").select("id").eq("id", recipeId);
    expect(data).toEqual([]);
  });

  it("B can't change or delete A's rows", async () => {
    const upd = await b.client
      .from("pantry_items")
      .update({ name: "Hacked" })
      .eq("user_id", a.id)
      .select();
    expect(upd.data ?? []).toEqual([]);
    const del = await b.client.from("shopping_list").delete().eq("user_id", a.id).select();
    expect(del.data ?? []).toEqual([]);
    const rec = await b.client
      .from("recipes")
      .update({ is_public: true })
      .eq("id", recipeId)
      .select();
    expect(rec.data ?? []).toEqual([]);
    // A's rows are untouched.
    const { data } = await a.client.from("pantry_items").select("name");
    expect(data).toEqual([{ name: "Paneer" }]);
  });

  it("B can't write rows as A, or save A's private recipe", async () => {
    const asA = await b.client
      .from("pantry_items")
      .insert({ user_id: a.id, key: "x", name: "X", category: "other" });
    expect(asA.error).not.toBeNull();
    const steal = await b.client
      .from("saved_recipes")
      .insert({ user_id: b.id, key: "stolen", recipe_id: recipeId });
    expect(steal.error).not.toBeNull();
  });

  it("B can't see or download A's photos", async () => {
    const list = await b.client.storage.from("made-photos").list(a.id);
    expect(list.data ?? []).toEqual([]);
    const dl = await b.client.storage.from("made-photos").download(photoPath());
    expect(dl.data).toBeNull();
    const up = await b.client.storage
      .from("made-photos")
      .upload(`${a.id}/planted.jpg`, new Blob([new Uint8Array([0xff, 0xd8, 0xff])]), {
        contentType: "image/jpeg",
      });
    expect(up.error).not.toBeNull();
  });

  it("anyone can read a recipe A chose to share, and nothing else", async () => {
    const shared = await anon.from("recipes").select("id").eq("id", publicRecipeId);
    expect(shared.data).toEqual([{ id: publicRecipeId }]);
    const hidden = await anon.from("recipes").select("id").eq("id", recipeId);
    expect(hidden.data).toEqual([]);
    const pantry = await anon.from("pantry_items").select("*");
    expect(pantry.data ?? []).toEqual([]);
  });
});
