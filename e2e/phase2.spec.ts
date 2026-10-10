import AxeBuilder from "./axe";
import { expect, type Page, test } from "@playwright/test";

const scene = (page: Page) => page.locator("[data-scene-tier]");
// Physics (rapier WASM) loads lazily with the first ingredient; on CI's software GPU under
// parallel load that alone can exceed the default 5 s.
const COUNTER = { timeout: 30_000 };

async function addIngredients(page: Page, text: string) {
  const input = page.getByRole("combobox", { name: "Add ingredients" });
  await input.fill(text);
  await input.press("Enter");
}

async function waitForScene(page: Page) {
  await expect(scene(page)).toHaveAttribute("data-scene-ready", "true", { timeout: 60_000 });
}

// CI browsers render WebGL in software (SwiftShader), where "auto" quality shows the poster
// instead. These tests pin the 3D quality the way the Settings page will: "low" (no
// post-processing) keeps software rendering fast; the draw-call budget test uses "high".
test.beforeEach(async ({ page }) => {
  await page.goto("/en");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("lk-quality", JSON.stringify({ state: { setting: "low" }, version: 1 }));
  });
  await page.reload();
});

test("auto quality falls back to the poster on a software GPU", async ({ page }) => {
  await page.evaluate(() => localStorage.removeItem("lk-quality"));
  await page.reload();
  await expect(scene(page)).toHaveAttribute("data-scene-tier", "off");
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cook", exact: true })).toBeVisible();
});

test("3D kitchen loads lazily behind the UI and stays out of the a11y tree", async ({ page }) => {
  await waitForScene(page);
  await expect(scene(page)).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(await scene(page).getAttribute("data-scene-tier")).toMatch(/^(high|medium|low)$/);

  // The DOM UI is fully usable on top of the canvas.
  await expect(page.getByRole("button", { name: "Cook", exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("ingredients drop onto the counter and puff away when removed", async ({ page }) => {
  await waitForScene(page);
  await addIngredients(page, "tomato, paneer, onion, soy sauce");
  await expect(scene(page)).toHaveAttribute("data-on-counter", "4", COUNTER);

  await page.getByRole("button", { name: "Remove Paneer" }).click();
  await expect(scene(page)).toHaveAttribute("data-on-counter", "3", COUNTER);

  await page.getByRole("button", { name: "Clear counter" }).click();
  await expect(scene(page)).toHaveAttribute("data-on-counter", "0", COUNTER);
});

test("hovering or focusing a chip highlights it (chip ↔ 3D sync)", async ({ page, isMobile }) => {
  test.skip(isMobile, "hover is a desktop interaction");
  await waitForScene(page);
  await addIngredients(page, "egg, rice");
  const egg = page.locator('[data-ingredient="egg"]');
  await egg.hover();
  await expect(egg).toHaveAttribute("data-highlighted", "true");
  await page
    .locator('[data-ingredient="rice"]')
    .getByRole("button", { name: "Remove Rice" })
    .focus();
  await expect(page.locator('[data-ingredient="rice"]')).toHaveAttribute(
    "data-highlighted",
    "true",
  );
  await expect(egg).not.toHaveAttribute("data-highlighted", "true");
});

test("?no3d=1 renders the poster only, and the app still works", async ({ page }) => {
  await page.goto("/en?no3d=1");
  await expect(scene(page)).toHaveAttribute("data-scene-tier", "off");
  await expect(page.locator("canvas")).toHaveCount(0);
  await addIngredients(page, "spinach, paneer");
  await page.getByRole("button", { name: "Cook", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fresh out of the pot" })).toBeVisible({
    timeout: 15_000,
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("scene still renders and items appear in place", async ({ page }) => {
    await waitForScene(page);
    await addIngredients(page, "egg, milk");
    await expect(scene(page)).toHaveAttribute("data-on-counter", "2", COUNTER);
  });
});

test("mobile: canvas on top, bottom sheet cycles peek → half → full", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "mobile layout only");
  const sheet = page.locator("[data-snap]");
  await expect(sheet).toHaveAttribute("data-snap", "half");
  const handle = page.getByRole("button", { name: /Resize panel/ });
  await handle.click();
  await expect(sheet).toHaveAttribute("data-snap", "full");
  await handle.click();
  await expect(sheet).toHaveAttribute("data-snap", "peek");
  await handle.click();
  await expect(sheet).toHaveAttribute("data-snap", "half");

  // Results open the sheet fully.
  await addIngredients(page, "spinach, paneer");
  await page.getByRole("button", { name: "Cook", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fresh out of the pot" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(sheet).toHaveAttribute("data-snap", "full");
});

test("draw calls stay under budget with a full counter", async ({ page, isMobile }) => {
  test.skip(isMobile, "measured once on desktop");
  test.setTimeout(120_000); // waits for a full counter to settle on a software GPU
  // Worst case: the "high" tier, with shadows and the full post-processing stack. Draw calls don't
  // depend on resolution, so a small viewport keeps software rendering from starving other workers.
  await page.setViewportSize({ width: 640, height: 400 });
  await page.evaluate(() =>
    localStorage.setItem("lk-quality", JSON.stringify({ state: { setting: "high" }, version: 1 })),
  );
  await page.reload();
  await waitForScene(page);
  await addIngredients(
    page,
    "tomato, onion, potato, garlic, ginger, green chilli, capsicum, carrot, spinach, cauliflower, " +
      "peas, coriander, lemon, cucumber, egg, paneer, milk, butter, curd, cheese, rice, atta, " +
      "bread, pasta, dal, chickpeas, soy sauce, ketchup",
  );
  // Highest per-frame count (the renderer counters cover every pass of a frame) over a window.
  const peakCalls = (ms: number) =>
    page.evaluate(
      (ms) =>
        new Promise<number>((resolve) => {
          const gl = (window as unknown as { __lkGl?: { info: { render: { calls: number } } } })
            .__lkGl;
          let peak = 0;
          const start = performance.now();
          const frame = () => {
            peak = Math.max(peak, gl?.info.render.calls ?? 0);
            if (performance.now() - start < ms) requestAnimationFrame(frame);
            else resolve(peak);
          };
          requestAnimationFrame(frame);
        }),
      ms,
    );
  const dropping = await peakCalls(3000);
  // Every body is fixed 8 s (scene clock) after its drop at the latest; poll until settled.
  await expect.poll(() => peakCalls(1000), { timeout: 40_000 }).toBeLessThan(100); // rule 3
  // While 24 bodies fall at once, one shadow pass rides on top (docs/DECISIONS.md, Phase 3).
  expect(dropping).toBeLessThan(120);
});
