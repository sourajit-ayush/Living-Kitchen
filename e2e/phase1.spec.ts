import AxeBuilder from "./axe";
import { expect, type Page, test } from "@playwright/test";

async function addIngredients(page: Page, text: string) {
  const input = page.getByRole("combobox", { name: "Add ingredients" });
  await input.fill(text);
  await input.press("Enter");
}

const counter = (page: Page) => page.getByRole("list", { name: "On your counter" });

test.beforeEach(async ({ page }) => {
  await page.goto("/en?no3d=1");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("type 4 ingredients, cook, see 3 recipes, open one, scale and swap", async ({ page }) => {
  await addIngredients(page, "spinach, 200g paneer, onion and tomato");
  await expect(counter(page).getByRole("listitem")).toHaveCount(4);
  await expect(counter(page)).toContainText("200g");

  await page.getByRole("button", { name: "Cook", exact: true }).click();
  await expect(page.getByRole("progressbar")).toBeVisible();

  const results = page.getByRole("heading", { name: "Fresh out of the pot" });
  await expect(results).toBeVisible({ timeout: 15_000 });
  await expect(results).toBeFocused();
  const cards = page.getByRole("region", { name: "Recipes" }).getByRole("article");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText("Uses only your ingredients");
  await expect(cards.nth(1)).toContainText("Need 2 items");
  await expect(cards.nth(2)).toContainText("Wildcard");

  await page.getByRole("button", { name: "Palak Paneer Bhurji" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Palak Paneer Bhurji" })).toBeFocused();

  // Servings scaler: 2 → 4 doubles the paneer.
  const paneerRow = page.locator("li[data-status]").filter({ hasText: "Paneer" }).first();
  await expect(paneerRow).toContainText("200 g");
  await page.getByRole("button", { name: "More servings" }).click();
  await page.getByRole("button", { name: "More servings" }).click();
  await expect(paneerRow).toContainText("400 g");

  // Units toggle: US shows ounces.
  await page.getByText("US", { exact: true }).click();
  await expect(paneerRow).toContainText("oz");

  // Substitution from the local/AI table.
  await page.getByRole("button", { name: "Swap Paneer" }).click();
  await page.getByRole("button", { name: /Firm tofu/ }).click();
  await expect(paneerRow).toContainText("Using Firm tofu instead of Paneer.");
  await paneerRow.getByRole("button", { name: "Undo" }).click();
  await expect(paneerRow).not.toContainText("Firm tofu");

  // Back to the ideas.
  await page.getByRole("button", { name: "Back to ideas" }).click();
  await expect(cards).toHaveCount(3);
});

test("missing items can go on the shopping list", async ({ page }) => {
  await addIngredients(page, "spinach, paneer, onion, tomato");
  await page.getByRole("button", { name: "Cook", exact: true }).click();
  await page.getByRole("button", { name: "Dhaba-Style Palak Paneer" }).click();

  const cream = page.locator("li[data-status='missing']").filter({ hasText: "Fresh cream" });
  await expect(cream).toContainText("Need");
  await cream.getByRole("button", { name: "Add Fresh cream to shopping list" }).click();
  await expect(cream).toContainText("On list");

  const stored = await page.evaluate(() => localStorage.getItem("lk-list"));
  expect(stored).toContain("Fresh cream");
});

test("autocomplete, staples, duplicates and removal", async ({ page }) => {
  const input = page.getByRole("combobox", { name: "Add ingredients" });
  await input.fill("dah");
  await expect(page.getByRole("option", { name: /Curd/ })).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(counter(page)).toContainText("Curd");

  await page.getByRole("button", { name: "Add Salt" }).click();
  await expect(page.getByRole("button", { name: "Add Salt" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await addIngredients(page, "dahi");
  await expect(counter(page).getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "Remove Curd" }).click();
  await expect(counter(page).getByRole("listitem")).toHaveCount(1);
});

test("preferences persist across reloads", async ({ page }) => {
  await page.getByRole("button", { name: "Preferences" }).click();
  const dialog = page.getByRole("dialog", { name: "Preferences" });
  await dialog.getByText("Jain", { exact: true }).click();
  await dialog.getByText("Pressure cooker", { exact: true }).click();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /Preferences/ })).toContainText("2 set");

  await page.reload();
  await page.getByRole("button", { name: /Preferences/ }).click();
  await expect(page.getByRole("radio", { name: "Jain" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Pressure cooker" })).toBeChecked();
});

test("API failure shows the boiled-over state with a working retry", async ({ page }) => {
  await addIngredients(page, "boil over");
  await page.getByRole("button", { name: "Cook", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Oops, the pot boiled over." })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "Remove Boil over" }).click();
  await addIngredients(page, "egg");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Fresh out of the pot" })).toBeVisible({
    timeout: 15_000,
  });
});

test("API rejects invalid input", async ({ request }) => {
  const res = await request.post("/api/recipes/generate", { data: { ingredients: [] } });
  expect(res.status()).toBe(400);
});

test("Hindi UI: typing पनीर और पालक adds two chips with Hindi names", async ({ page }) => {
  await page.goto("/hi?no3d=1");
  const input = page.getByRole("combobox", { name: "सामग्री डालें" });
  await input.fill("पनीर और पालक");
  await input.press("Enter");
  const chips = page.getByRole("list", { name: "आपके काउंटर पर" });
  await expect(chips.getByRole("listitem")).toHaveCount(2);
  await expect(chips).toContainText("पनीर");
  await expect(chips).toContainText("पालक");
  await expect(page.getByRole("button", { name: "पकाएँ" })).toBeEnabled();
});

test("no axe violations on the kitchen, results and recipe views", async ({ page }) => {
  // Contrast is checked on the settled UI: with reduced motion nothing is caught mid-fade, which
  // fixed waits couldn't guarantee on a loaded CI machine.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const axe = () => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect((await axe()).violations).toEqual([]);

  await addIngredients(page, "spinach, paneer, onion, tomato");
  await page.getByRole("button", { name: "Cook", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fresh out of the pot" })).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForTimeout(800); // let the card reveal finish (blur/opacity)
  expect((await axe()).violations).toEqual([]);

  await page.getByRole("button", { name: "Palak Paneer Bhurji" }).click();
  await page.waitForTimeout(500);
  expect((await axe()).violations).toEqual([]);

  await page.getByRole("button", { name: "Preferences" }).click();
  await page.waitForTimeout(400);
  expect((await axe()).violations).toEqual([]);
});

test("switching language with results open re-cooks them in the new language", async ({ page }) => {
  await addIngredients(page, "spinach, paneer, onion, tomato");
  await page.getByRole("button", { name: "Cook", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fresh out of the pot" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Palak Paneer Bhurji" }).click();

  const hindiRequest = page.waitForRequest(
    (r) => r.url().endsWith("/api/recipes/generate") && r.postDataJSON()?.locale === "hi",
  );
  await page.getByRole("link", { name: "हि" }).click();
  await expect(page).toHaveURL(/\/hi$/);
  expect((await hindiRequest).postDataJSON().ingredients).toHaveLength(4);

  await expect(page.getByRole("heading", { name: "पतीले से ताज़ा" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("region", { name: "रेसिपी" }).getByRole("article")).toHaveCount(3);

  // Switching back re-cooks again, in English.
  const englishRequest = page.waitForRequest(
    (r) => r.url().endsWith("/api/recipes/generate") && r.postDataJSON()?.locale === "en",
  );
  await page.getByRole("link", { name: "EN" }).click();
  await englishRequest;
  await expect(page.getByRole("heading", { name: "Fresh out of the pot" })).toBeVisible({
    timeout: 15_000,
  });
});

test("switching language on an idle counter does not call the API", async ({ page }) => {
  let calls = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/recipes/generate")) calls++;
  });
  await addIngredients(page, "egg, bread");
  await page.getByRole("link", { name: "हि" }).click();
  await expect(page).toHaveURL(/\/hi$/);
  await expect(
    page.getByRole("list", { name: "आपके काउंटर पर" }).getByRole("listitem"),
  ).toHaveCount(2);
  expect(calls).toBe(0);
});

test("sauces: quick-add switch and typed sauce names", async ({ page }) => {
  await page.getByText("Sauces", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Sauces" })).toBeChecked();
  await page.getByRole("button", { name: "Add Schezwan sauce" }).click();
  await page.getByRole("button", { name: "Add Soy sauce" }).click();

  await addIngredients(page, "green chilli sauce, hot and sweet sauce");
  const chips = counter(page);
  await expect(chips.getByRole("listitem")).toHaveCount(4);
  for (const name of ["Schezwan sauce", "Soy sauce", "Green chilli sauce", "Tomato chilli sauce"]) {
    await expect(chips).toContainText(name);
  }

  // Autocomplete suggests sauces too.
  const input = page.getByRole("combobox", { name: "Add ingredients" });
  await input.fill("sriracha");
  await expect(page.getByRole("option", { name: /Hot sauce/ })).toBeVisible();
});
