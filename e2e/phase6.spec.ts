import AxeBuilder from "./axe";
import { expect, type Page, test } from "@playwright/test";
import fs from "node:fs";

/** The test build reads .env.local like any build: are accounts switched on in it? */
const accountsConfigured = (() => {
  try {
    return /^NEXT_PUBLIC_SUPABASE_URL=\S+/m.test(fs.readFileSync(".env.local", "utf8"));
  } catch {
    return false;
  }
})();

const SLOW = { timeout: 30_000 };
const tomorrow = () => {
  const d = new Date(Date.now() + 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function addToPantry(page: Page, text: string) {
  const input = page.getByRole("combobox", { name: "Add to pantry" });
  await input.fill(text);
  await input.press("Enter");
}

/** Follow a header link (inline on desktop, in the menu on phones). */
async function navTo(page: Page, isMobile: boolean, name: string) {
  if (isMobile) {
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name }).click();
  } else {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name }).click();
  }
}

async function cookBhurji(page: Page, ingredients = "spinach, paneer, tomato") {
  const input = page.getByRole("combobox", { name: "Add ingredients" });
  await input.fill(ingredients);
  await input.press("Enter");
  await page.getByRole("button", { name: "Cook", exact: true }).click();
  await page.getByRole("button", { name: "Palak Paneer Bhurji" }).click(SLOW);
}

test("my pantry: staples by group, an expiry date, the nudge, and cooking with the pantry", async ({
  page,
}) => {
  await page.goto("/en/pantry?no3d=1");
  await addToPantry(page, "rice, atta, turmeric, ghee, paneer");
  await expect(page.locator("[data-pantry-item]")).toHaveCount(5);
  await expect(page.locator('[data-pantry-group="spice"]')).toContainText("Turmeric");
  await page.locator('[data-pantry-item="paneer"] input[type=date]').fill(tomorrow());
  await expect(page.locator('[data-pantry-item="paneer"]')).toContainText("tomorrow");
  await page.getByRole("switch", { name: "Use my pantry" }).click();
  await expect(page.getByRole("switch", { name: "Use my pantry" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await page.goto("/en?no3d=1");
  const nudge = page.locator("[data-use-it-up]");
  await expect(nudge).toContainText("Your Paneer expires tomorrow");
  const generate = page.waitForRequest((r) => r.url().endsWith("/api/recipes/generate"));
  await nudge.getByRole("button", { name: "Cook with it" }).click();
  const body = (await generate).postDataJSON();
  // The expiring item is an ingredient to use up; the other staples go as the pantry.
  expect(body.ingredients).toContainEqual({ name: "Paneer", expiring: true });
  expect(body.pantry).toEqual(expect.arrayContaining(["Rice", "Wheat flour", "Turmeric", "Ghee"]));
  await expect(page.getByRole("heading", { name: "Fresh out of the pot" })).toBeVisible(SLOW);
  await expect(page.getByText(/Uses up/).first()).toBeVisible();
});

test("a counter chip saves to the pantry", async ({ page, isMobile }) => {
  await page.goto("/en?no3d=1");
  const input = page.getByRole("combobox", { name: "Add ingredients" });
  await input.fill("ghee");
  await input.press("Enter");
  const save = page.getByRole("button", { name: "Save Ghee to pantry" });
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await navTo(page, isMobile, "My pantry");
  await expect(page.locator('[data-pantry-item="ghee"]')).toBeVisible();
});

test("recipe book: save with the heart, rate, note, collect, and page through", async ({
  page,
}) => {
  await page.goto("/en?no3d=1");
  await cookBhurji(page);
  const heart = page.getByRole("button", { name: "Save recipe" });
  await heart.click();
  await expect(page.getByRole("button", { name: "Remove from recipe book" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Back to ideas" }).click();
  await page.getByRole("button", { name: "Palak Paneer Tawa Quesadillas" }).click();
  await page.getByRole("button", { name: "Save recipe" }).click();

  await page.goto("/en/book?no3d=1");
  await expect(page.locator("[data-book-entry]")).toHaveCount(2);
  await expect(page.getByText("Recipe 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Next recipe" }).click();
  await expect(page.getByText("Recipe 2 of 2")).toBeVisible();

  // A new collection, then file the bhurji under it with a rating and a note.
  await page.getByRole("button", { name: "New collection" }).click();
  await page.getByRole("textbox", { name: "New collection" }).fill("Sunday lunch");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("radio", { name: "All" }).check({ force: true });
  await page.locator("[data-book-entry]", { hasText: "Palak Paneer Bhurji" }).click();
  await page.getByRole("radio", { name: "4 stars" }).check({ force: true });
  await page.getByRole("combobox", { name: "Collection" }).selectOption("Sunday lunch");
  const notes = page.getByRole("textbox", { name: "Notes" });
  await notes.fill("Less chilli next time");
  await notes.blur();
  await expect(
    page.getByText("Sign in to add a photo of your dish.").or(page.getByText("Add a photo")),
  ).toBeVisible();

  await page.reload();
  await page.getByRole("radio", { name: "Sunday lunch" }).check({ force: true });
  await expect(page.locator("[data-book-entry]")).toHaveCount(1);
  await page.locator("[data-book-entry]").click();
  await expect(page.getByRole("radio", { name: "4 stars" })).toBeChecked();
  await expect(page.getByRole("textbox", { name: "Notes" })).toHaveValue("Less chilli next time");
});

test("shopping list: missing items by aisle, tick off, clear, add by hand, share", async ({
  page,
  context,
  browserName,
}) => {
  await page.goto("/en?no3d=1");
  await cookBhurji(page, "spinach"); // paneer and tomato are missing now
  await page.getByRole("button", { name: "Add missing items to shopping list" }).click();
  await page.goto("/en/list?no3d=1");
  await expect(page.locator('[data-aisle="dairy"]')).toContainText("Paneer");
  await expect(page.locator('[data-aisle="produce"]')).toContainText(/Tomato/i);
  const before = Number(await page.locator("[data-to-buy]").getAttribute("data-to-buy"));
  expect(before).toBeGreaterThan(1);

  await page.getByRole("checkbox", { name: "Got Paneer" }).check({ force: true });
  await expect(page.locator("[data-to-buy]")).toHaveAttribute("data-to-buy", String(before - 1));
  await page.getByRole("button", { name: "Clear ticked items" }).click();
  await expect(page.locator('[data-list-item="paneer"]')).toHaveCount(0);

  await page.getByRole("textbox", { name: "Add item" }).fill("1 bunch coriander");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.locator('[data-aisle="produce"]')).toContainText("coriander · 1 bunch");

  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(() => {
      // Desktop Chrome has no share sheet in tests: the copy fallback runs.
      Object.defineProperty(navigator, "share", { value: undefined });
    });
    await page.getByRole("button", { name: "Share list" }).click();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain("Shopping list");
    expect(text).toContain("• coriander (1 bunch)");
  }
});

test("navigation reaches every page; phones use the menu", async ({ page, isMobile }) => {
  await page.goto("/en?no3d=1");
  await navTo(page, isMobile, "Recipe book");
  await expect(page).toHaveURL(/\/en\/book/);
  await expect(page.getByRole("heading", { name: "Recipe book", level: 1 })).toBeVisible();
});

test("without a Supabase project, data stays on the device and says so", async ({ page }) => {
  test.skip(accountsConfigured, "accounts are configured");
  await page.goto("/en/signin?no3d=1");
  await expect(page.getByText("Accounts aren't set up on this site yet")).toBeVisible();
});

test("the 3D kitchen follows the pages: shelf, book, quiet backdrop", async ({
  page,
  isMobile,
}) => {
  await page.goto("/en");
  await page.evaluate(() =>
    localStorage.setItem("lk-quality", JSON.stringify({ state: { setting: "low" }, version: 1 })),
  );
  await page.goto("/en/pantry");
  const scene = page.locator("[data-scene-tier]");
  await expect(scene).toHaveAttribute("data-scene-ready", "true", { timeout: 60_000 });
  await expect(scene).toHaveAttribute("data-mode", "pantry");
  await navTo(page, isMobile, "Recipe book");
  await expect(scene).toHaveAttribute("data-mode", "book");
  await page.goto("/en/list");
  await expect(scene).toHaveAttribute("data-mode", "quiet");
});

for (const path of ["/en/pantry", "/en/book", "/en/list", "/en/signin"]) {
  test(`${path} has no axe violations`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${path}?no3d=1`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
