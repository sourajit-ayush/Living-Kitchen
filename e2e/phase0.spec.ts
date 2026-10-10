import AxeBuilder from "./axe";
import { expect, test } from "@playwright/test";

test("root redirects to a locale and renders on cream", async ({ page }) => {
  // Daytime look: after 7 pm the kitchen follows the clock into night (a dark page, Phase 7).
  await page.addInitScript(() =>
    localStorage.setItem(
      "lk-daypart",
      JSON.stringify({ state: { setting: "golden" }, version: 1 }),
    ),
  );
  await page.goto("/?no3d=1");
  await expect(page).toHaveURL(/\/en(\?|$)/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What's in your kitchen?");

  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(255, 251, 245)"); // --cream-50
});

test("display font is Fraunces", async ({ page }) => {
  await page.goto("/en?no3d=1");
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toBeVisible();
  const family = await h1.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family.toLowerCase()).toContain("fraunces");
});

test("locale switch goes to Hindi and back", async ({ page }) => {
  await page.goto("/en?no3d=1");
  await page.getByRole("link", { name: "हि" }).click();
  await expect(page).toHaveURL(/\/hi$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("आपकी रसोई में क्या है?");

  await page.getByRole("link", { name: "EN" }).click();
  await expect(page).toHaveURL(/\/en$/);
});

test("has no axe violations", async ({ page }) => {
  await page.goto("/en?no3d=1");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});
