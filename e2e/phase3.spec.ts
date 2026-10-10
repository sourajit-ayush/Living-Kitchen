import { expect, type Page, test } from "@playwright/test";

const scene = (page: Page) => page.locator("[data-scene-tier]");
// Software GL under parallel load is slow; physics and the reveal are timing-based.
const SLOW = { timeout: 30_000 };

async function addIngredients(page: Page, text: string) {
  const input = page.getByRole("combobox", { name: "Add ingredients" });
  await input.fill(text);
  await input.press("Enter");
}

// CI renders WebGL in software, where "auto" quality shows the poster; pin a 3D tier. "low"
// (no post-processing) keeps software rendering fast enough; the cook logic is tier-independent.
test.beforeEach(async ({ page }) => {
  await page.goto("/en");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("lk-quality", JSON.stringify({ state: { setting: "low" }, version: 1 }));
  });
  await page.reload();
  await expect(scene(page)).toHaveAttribute("data-scene-ready", "true", { timeout: 60_000 });
});

test("ingredients hop into the pot, recipes rise and hand over to the panel, start over brings them back", async ({
  page,
}) => {
  await addIngredients(page, "spinach, paneer, tomato");
  await expect(scene(page)).toHaveAttribute("data-on-counter", "3", SLOW);

  await page.getByRole("button", { name: "Cook", exact: true }).click();
  await expect(scene(page)).toHaveAttribute("data-pot", "open");
  await expect(scene(page)).toHaveAttribute("data-in-pot", "3", SLOW);

  // The 3D cards rise first ("Plating up…"), then the DOM results take over.
  await expect(page.getByText("Plating up…")).toBeVisible(SLOW);
  await expect(page.getByRole("heading", { name: "Fresh out of the pot" })).toBeVisible(SLOW);

  await page.getByRole("button", { name: "Palak Paneer Bhurji" }).click();
  await expect(page.getByRole("heading", { name: "Palak Paneer Bhurji" })).toBeVisible();
  await page.getByRole("button", { name: "Back to ideas" }).click();

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(scene(page)).toHaveAttribute("data-in-pot", "0", SLOW);
  await expect(scene(page)).toHaveAttribute("data-pot", "closed");
  await expect(scene(page)).toHaveAttribute("data-on-counter", "3");
  await expect(page.getByRole("button", { name: "Cook", exact: true })).toBeEnabled();
});

test("the pot boils over on an API error, with a working retry and a way back", async ({
  page,
}) => {
  await addIngredients(page, "boil over, paneer");
  await page.getByRole("button", { name: "Cook", exact: true }).click();
  const alert = page.getByRole("alert");
  await expect(alert.getByRole("heading", { name: "Oops, the pot boiled over." })).toBeVisible(
    SLOW,
  );
  await expect(scene(page)).toHaveAttribute("data-in-pot", "2", SLOW);

  const retried = page.waitForRequest("**/api/recipes/generate");
  await alert.getByRole("button", { name: "Try again" }).click();
  await retried;
  await expect(alert.getByRole("heading", { name: "Oops, the pot boiled over." })).toBeVisible(
    SLOW,
  );

  await alert.getByRole("button", { name: "Back to the counter" }).click();
  await expect(scene(page)).toHaveAttribute("data-in-pot", "0", SLOW);
  await expect(scene(page)).toHaveAttribute("data-pot", "closed");
});

test("kitchen sounds are off by default and remembered when switched on", async ({
  page,
  isMobile,
}) => {
  // Phones keep the header to one line: the switch is in the menu there (Phase 6).
  const toggle = async () => {
    if (isMobile) {
      if (!(await page.getByRole("dialog", { name: "Menu" }).isVisible())) {
        await page.getByRole("button", { name: "Menu" }).click();
      }
      return page
        .getByRole("dialog", { name: "Menu" })
        .getByRole("button", { name: "Kitchen sounds" });
    }
    return page.getByRole("button", { name: "Kitchen sounds" });
  };
  await expect(await toggle()).toHaveAttribute("aria-pressed", "false");
  await (await toggle()).click();
  await expect(await toggle()).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(await toggle()).toHaveAttribute("aria-pressed", "true");
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("no 3D reveal: the recipes simply appear, and start over restores the counter", async ({
    page,
  }) => {
    await addIngredients(page, "spinach, paneer");
    await expect(scene(page)).toHaveAttribute("data-on-counter", "2", SLOW);
    await page.getByRole("button", { name: "Cook", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Fresh out of the pot" })).toBeVisible(SLOW);
    await expect(page.getByText("Plating up…")).toHaveCount(0);
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(scene(page)).toHaveAttribute("data-in-pot", "0", SLOW);
  });
});
