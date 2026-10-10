import AxeBuilder from "./axe";
import { expect, type Page, test } from "@playwright/test";

const SLOW = { timeout: 30_000 };
const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();

const category = (page: Page) => page.getByRole("radiogroup", { name: "Food or drinks" });

test.describe("Name a dish", () => {
  test("type a dish: the full recipe opens straight away, and back goes to the kitchen", async ({
    page,
  }) => {
    await page.goto("/en?no3d=1");
    await page.getByRole("tab", { name: "Name a dish" }).click();
    await page.getByLabel("Which dish or drink?").fill("Butter Chicken");
    await page.getByRole("button", { name: "Show me how" }).click();

    const title = page.getByRole("heading", { name: "Butter Chicken", level: 2 });
    await expect(title).toBeVisible(SLOW);
    await expect(title).toBeFocused();
    // the whole recipe: ingredients with what to buy, and the steps
    await expect(page.getByRole("heading", { name: "Ingredients", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Method", exact: true })).toBeVisible();
    await expect(page.getByText("Need").first()).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);

    await page.getByRole("button", { name: "Back to the kitchen" }).click();
    await expect(page.getByRole("tab", { name: "Name a dish" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("heading", { name: "Butter Chicken" })).toHaveCount(0);
  });

  test("asks for a name, and the tabs work from the keyboard", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard path");
    await page.goto("/en?no3d=1");
    const have = page.getByRole("tab", { name: "What I have" });
    await have.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Name a dish" })).toBeFocused();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Show me how" }).click();
    const input = page.getByLabel("Which dish or drink?");
    await expect(page.getByText("Type the name of a dish or drink.")).toBeVisible();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    expect((await axe(page)).violations).toEqual([]);
  });

  test("a failed dish is retried as the same dish", async ({ page }) => {
    await page.goto("/en?no3d=1");
    await page.getByRole("tab", { name: "Name a dish" }).click();
    await page.getByLabel("Which dish or drink?").fill("boil over");
    await page.getByRole("button", { name: "Show me how" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Oops, the pot boiled over." }),
    ).toBeVisible(SLOW);
    const retried = page.waitForRequest("**/api/recipes/generate");
    await page.getByRole("button", { name: "Try again" }).click();
    expect((await retried).postDataJSON()).toMatchObject({ mode: "dish", dish: "boil over" });
  });

  test("in Hindi", async ({ page }) => {
    await page.goto("/hi?no3d=1");
    await page.getByRole("tab", { name: "पकवान का नाम" }).click();
    await page.getByLabel("कौन-सा पकवान या पेय?").fill("चिली चिकन");
    await page.getByRole("button", { name: "बनाना सिखाएँ" }).click();
    await expect(page.getByRole("button", { name: "रसोई पर वापस" })).toBeVisible(SLOW);
  });
});

test.describe("Drinks", () => {
  test("from the counter: drink basics, Mix, three drinks; the choice is remembered", async ({
    page,
  }) => {
    await page.goto("/en?no3d=1");
    await category(page).getByText("Drinks").click();
    await expect(page.getByRole("heading", { name: "Drink basics" })).toBeVisible();
    await page.getByRole("button", { name: "Add Tea leaves" }).click();
    const input = page.getByRole("combobox", { name: "Add ingredients" });
    await input.fill("milk, ginger, sugar");
    await input.press("Enter");
    const request = page.waitForRequest("**/api/recipes/generate");
    await page.getByRole("button", { name: "Mix", exact: true }).click();
    expect((await request).postDataJSON()).toMatchObject({
      mode: "ingredients",
      category: "drink",
    });

    await expect(page.getByRole("heading", { name: "Poured and ready" })).toBeVisible(SLOW);
    const cards = page.getByRole("region", { name: "Recipes" }).getByRole("article");
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toContainText("Masala Chai");
    await page.getByRole("button", { name: "Masala Chai" }).click();
    await expect(page.locator("[data-recipe-badges]")).toContainText("Drink");
    expect((await axe(page)).violations).toEqual([]);

    await page.reload();
    await expect(category(page).getByRole("radio", { name: "Drinks" })).toBeChecked();
  });

  test("a named drink from the suggestions", async ({ page }) => {
    await page.goto("/en?no3d=1");
    await page.getByRole("tab", { name: "Name a dish" }).click();
    await category(page).getByText("Drinks").click();
    await expect(page.getByLabel("Which dish or drink?")).toHaveAttribute(
      "placeholder",
      "e.g. Masala Chai",
    );
    await page.getByRole("button", { name: "Mango Lassi" }).click();
    await expect(page.getByRole("heading", { name: "Mango Lassi", level: 2 })).toBeVisible(SLOW);
    await expect(page.locator("[data-recipe-badges]")).toContainText("Drink");
  });

  test("the 3D kitchen mixes a drink in the glass without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/en");
    await page.evaluate(() =>
      localStorage.setItem("lk-quality", JSON.stringify({ state: { setting: "low" }, version: 1 })),
    );
    await page.reload();
    await expect(page.locator("[data-scene-tier]")).toHaveAttribute("data-scene-ready", "true", {
      timeout: 60_000,
    });
    await category(page).getByText("Drinks").click();
    await page.getByRole("tab", { name: "Name a dish" }).click();
    await page.getByRole("button", { name: "Virgin Mojito" }).click();
    await expect(page.getByRole("heading", { name: "Virgin Mojito", level: 2 })).toBeVisible(SLOW);
    await page.getByRole("button", { name: "Back to the kitchen" }).click();
    await expect(page.locator("[data-scene-tier]")).toHaveAttribute("data-scene-ready", "true");
    expect(errors).toEqual([]);
  });
});
