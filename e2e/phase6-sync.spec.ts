import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type BrowserContext, type Page, test } from "@playwright/test";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

/**
 * Phase 6 DoD against the real Supabase project: two devices signed in to one account stay in
 * sync, and a guest's data merges into the account on sign-in. Skipped until .env.local has the
 * project keys. A throwaway user is created (service key) and deleted afterwards.
 */
const env = (() => {
  try {
    return Object.fromEntries(
      fs
        .readFileSync(".env.local", "utf8")
        .split(/\r?\n/)
        .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
        .filter((m): m is RegExpMatchArray => !!m)
        .map((m) => [m[1], m[2].trim()]),
    ) as Record<string, string>;
  } catch {
    return {} as Record<string, string>;
  }
})();
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

test.describe.configure({ mode: "serial" });
test.skip(!URL || !ANON || !SERVICE, "Supabase isn't configured in .env.local");

const storageKey = () => `sb-${new globalThis.URL(URL).hostname.split(".")[0]}-auth-token`;
let admin: SupabaseClient;
let userId: string;
let session: Session;

test.beforeAll(async () => {
  admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const email = `lk-sync-${randomUUID().slice(0, 8)}@example.com`;
  const password = `pw-${randomUUID()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  session = signedIn.data.session;
});

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

/** Put the account's session where supabase-js keeps it, as if the magic link was opened here. */
async function signIn(context: BrowserContext) {
  await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    storageKey(),
    JSON.stringify(session),
  ] as const);
}

async function addToPantry(page: Page, text: string) {
  const input = page.getByRole("combobox", { name: "Add to pantry" });
  await input.fill(text);
  await input.press("Enter");
}

const pantryRow = (key: string) =>
  admin.from("pantry_items").select("key, deleted_at").eq("user_id", userId).eq("key", key);

test("guest data merges on sign-in, and two devices stay in sync", async ({ browser }) => {
  test.setTimeout(120_000);
  // Device A starts as a guest with something in the pantry.
  const a = await browser.newContext();
  const pageA = await a.newPage();
  await pageA.goto("/en/pantry?no3d=1");
  await addToPantry(pageA, "saffron");
  await expect(pageA.locator('[data-pantry-item="saffron"]')).toBeVisible();

  // …then signs in: the guest item joins the account.
  await signIn(a);
  await pageA.reload();
  await expect(pageA.getByText(/Signed in as/)).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => (await pantryRow("saffron")).data?.length ?? 0, { timeout: 20_000 })
    .toBe(1);

  // Device B signs in and gets it.
  const b = await browser.newContext();
  await signIn(b);
  const pageB = await b.newPage();
  await pageB.goto("/en/pantry?no3d=1");
  await expect(pageB.locator('[data-pantry-item="saffron"]')).toBeVisible({ timeout: 20_000 });

  // A change on B reaches A live (Realtime), with no reload.
  await addToPantry(pageB, "cardamom");
  await expect(pageA.locator('[data-pantry-item="cardamom"]')).toBeVisible({ timeout: 20_000 });

  // Both devices are listening live (Realtime) before the next change.
  for (const page of [pageA, pageB]) {
    await expect(page.locator("html")).toHaveAttribute("data-sync-channel", "SUBSCRIBED", {
      timeout: 20_000,
    });
  }

  // A deletion on A disappears from B.
  await pageA.getByRole("button", { name: "Remove Saffron from pantry" }).click();
  await expect(pageB.locator('[data-pantry-item="saffron"]')).toHaveCount(0, { timeout: 20_000 });
  const row = (await pantryRow("saffron")).data?.[0];
  expect(row?.deleted_at).toBeTruthy();

  // The shopping list syncs the same way.
  await pageB.goto("/en/list?no3d=1");
  await pageB.getByRole("textbox", { name: "Add item" }).fill("2 lemons");
  await pageB.getByRole("button", { name: "Add item" }).click();
  await pageA.goto("/en/list?no3d=1");
  await expect(pageA.locator('[data-aisle="produce"]')).toContainText("lemons", {
    timeout: 20_000,
  });

  // Signing out takes the account's data off the device.
  if (!(await pageA.getByRole("button", { name: "Sign out" }).isVisible())) {
    await pageA.getByRole("button", { name: "Menu" }).click();
  }
  await pageA.getByRole("button", { name: "Sign out" }).click();
  await expect(pageA.locator("[data-list-item]")).toHaveCount(0);

  await a.close();
  await b.close();
});
