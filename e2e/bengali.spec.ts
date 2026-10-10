import AxeBuilder from "./axe";
import { expect, type Page, test } from "@playwright/test";

const SLOW = { timeout: 30_000 };
const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();

test("Bengali: switch to বা, type a Bengali list, and Nani is asked in Bengali", async ({
  page,
}) => {
  await page.goto("/en?no3d=1");
  await page.getByRole("link", { name: "বা" }).click();
  await expect(page).toHaveURL(/\/bn$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toHaveText("আপনার রান্নাঘরে কী আছে?");
  // Bengali text renders in the Bengali web font, not a system fallback
  await expect
    .poll(() => page.evaluate(() => document.fonts.check("600 40px 'Noto Serif Bengali'", "কী")))
    .toBe(true);

  const input = page.getByRole("combobox", { name: "উপকরণ যোগ করুন" });
  await input.fill("২টো টমেটো, পেঁয়াজ আর begun");
  await input.press("Enter");
  const chips = page.getByRole("list", { name: "আপনার কাউন্টারে" });
  for (const name of ["টমেটো", "পেঁয়াজ", "বেগুন"]) {
    await expect(chips.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  }
  expect((await axe(page)).violations).toEqual([]);

  const request = page.waitForRequest("**/api/recipes/generate");
  await page.getByRole("button", { name: "রাঁধুন", exact: true }).click();
  const body = (await request).postDataJSON() as { locale: string };
  expect(body.locale).toBe("bn");
  await expect(page.getByRole("heading", { name: "হাঁড়ি থেকে টাটকা" })).toBeVisible(SLOW);
  expect((await axe(page)).violations).toEqual([]);
});

test("Bengali pages: book, list and Cook Mode chrome are Bengali, and the header fits", async ({
  page,
}) => {
  for (const [path, heading] of [
    ["/bn/book", "রেসিপির খাতা"],
    ["/bn/list", "বাজারের তালিকা"],
    ["/bn/pantry", "আমার ভাঁড়ার"],
  ]) {
    await page.goto(`${path}?no3d=1`);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    // three language links still fit: nothing scrolls sideways
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.goto("/bn/cook/unknown?no3d=1");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/[ঀ-৿]/);
});
