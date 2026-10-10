import AxeBuilder from "./axe";
import { expect, type Page, test } from "@playwright/test";

const SLOW = { timeout: 30_000 };
const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();

test("What's for dinner?: one tap, the pantry goes with it, the pick opens; Something else asks again", async ({
  page,
}) => {
  // Evening, with two things in the pantry and "Use my pantry" off: the button still sends them.
  await page.clock.setFixedTime(new Date("2026-10-10T20:00:00"));
  await page.goto("/en/pantry?no3d=1");
  const add = page.getByRole("combobox", { name: "Add to pantry" });
  await add.fill("rice, toor dal");
  await add.press("Enter");
  await page.goto("/en?no3d=1");

  const button = page.getByRole("button", { name: "What's for dinner?" });
  await expect(button).toBeVisible();
  await expect(page.getByText("One tap. Nani picks from your pantry (2 items).")).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);

  const first = page.waitForRequest("**/api/recipes/generate");
  await button.click();
  const body = (await first).postDataJSON() as {
    mode: string;
    ingredients: unknown[];
    pantry: string[];
    prefs: { meal: string };
    exclude: string[];
  };
  expect(body).toMatchObject({ mode: "tonight", ingredients: [], exclude: [] });
  expect(body.pantry.sort()).toEqual(["Rice", "Toor dal"]);
  expect(body.prefs.meal).toBe("dinner");

  // One recipe, opened straight away, with the way back to the kitchen
  const title = page.locator("#recipe-title");
  await expect(title).toHaveText("Palak Paneer Bhurji", SLOW);
  await expect(page.getByRole("button", { name: "Back to the kitchen" })).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);

  const second = page.waitForRequest("**/api/recipes/generate");
  await page.getByRole("button", { name: "Something else" }).click();
  expect(((await second).postDataJSON() as { exclude: string[] }).exclude).toEqual([
    "Palak Paneer Bhurji",
  ]);
  await expect(title).not.toHaveText("Palak Paneer Bhurji", SLOW);
  await expect(title).toHaveText(/\S/);
});

test("the button follows the clock and the Food/Drinks switch", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-10T08:00:00"));
  await page.goto("/en?no3d=1");
  await expect(page.getByRole("button", { name: "What's for breakfast?" })).toBeVisible();
  await expect(page.getByText("One tap. Nani picks something simple to cook.")).toBeVisible();
  await page.getByRole("radiogroup", { name: "Food or drinks" }).getByText("Drinks").click();
  await expect(page.getByRole("button", { name: "What should I drink?" })).toBeVisible();
  await page.goto("/bn?no3d=1");
  await expect(page.getByRole("button", { name: "কী পান করব?" })).toBeVisible();
});
