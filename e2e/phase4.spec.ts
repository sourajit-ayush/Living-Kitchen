import AxeBuilder from "./axe";
import { expect, type Page, test } from "@playwright/test";

const counter = (page: Page) => page.locator("[data-step-counter]");

/** Kitchen → cook (mock AI) → open the bhurji → Start Cook Mode. UI-only, so no 3D. */
async function openCookMode(page: Page, query = "?no3d=1") {
  await page.goto(`/en${query}`);
  const input = page.getByRole("combobox", { name: "Add ingredients" });
  await input.fill("spinach, paneer, tomato");
  await input.press("Enter");
  await page.getByRole("button", { name: "Cook", exact: true }).click();
  await page.getByRole("button", { name: "Palak Paneer Bhurji" }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Start Cook Mode" }).click();
  await expect(page).toHaveURL(/\/en\/cook\/palak-paneer-bhurji$/);
  await expect(counter(page)).toHaveText("Step 1 of 6");
}

test("step through with buttons, keys and swipes; the place survives a reload", async ({
  page,
}) => {
  await openCookMode(page);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(counter(page)).toHaveText("Step 2 of 6");
  await page.keyboard.press("ArrowRight");
  await expect(counter(page)).toHaveText("Step 3 of 6");
  await page.keyboard.press("ArrowLeft");
  await expect(counter(page)).toHaveText("Step 2 of 6");

  // swipe left on the step = next
  const main = page.getByRole("main");
  const box = (await main.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(counter(page)).toHaveText("Step 3 of 6");

  // big type, as the spec asks (min 28 px)
  await expect(page.locator("[data-step-text]")).toHaveCSS(
    "font-size",
    /^(2[89]|[3-9]\d)(\.\d+)?px$/,
  );

  await page.reload();
  await expect(counter(page)).toHaveText("Step 3 of 6");
  await expect(page.getByRole("progressbar", { name: "Recipe progress" })).toHaveAttribute(
    "aria-valuenow",
    "3",
  );

  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { name: "Ready to serve!" })).toBeVisible();
  await page.getByRole("button", { name: "Back to the recipe" }).click();
  await expect(page).toHaveURL(/\/en$/);
});

test("timers run side by side, survive changing steps, and ring when done", async ({ page }) => {
  // The fake clock also drives requestAnimationFrame; without motion, no slide-in can stall.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await openCookMode(page);
  await page.keyboard.press("ArrowRight"); // step 2: "about 4 minutes"
  await page.getByRole("button", { name: "Start a 4 minutes timer" }).click();
  await page.keyboard.press("ArrowRight"); // step 3: "30 seconds" and "3 minutes"
  await page.getByRole("button", { name: "Start a 30 seconds timer" }).click();

  const dock = page.getByRole("region", { name: "Timers" });
  await expect(dock.locator("[data-dock-timer]")).toHaveCount(2);
  await page.clock.fastForward(31_000);
  await expect(dock.locator('[data-dock-timer$=":3:0"]')).toHaveAttribute("data-status", "done");
  await expect(dock.locator('[data-dock-timer$=":2:0"]')).toHaveAttribute("data-status", "running");

  // pause keeps the time while the clock moves on
  await dock.getByRole("button", { name: /Pause the 4 minutes timer/ }).click();
  await page.clock.fastForward(120_000);
  await expect(dock.locator('[data-dock-timer$=":2:0"]')).toHaveAttribute("data-status", "paused");
  await dock.getByRole("button", { name: /Resume the 4 minutes timer/ }).click();
  await page.clock.fastForward(4 * 60_000);
  await expect(dock.locator('[data-dock-timer$=":2:0"]')).toHaveAttribute("data-status", "done");

  await dock.getByRole("button", { name: "Dismiss the finished 30 seconds timer" }).click();
  await expect(dock.locator("[data-dock-timer]")).toHaveCount(1);
});

test("the ingredients drawer remembers what you've ticked", async ({ page }) => {
  await openCookMode(page);
  await page.getByRole("button", { name: "Ingredients" }).click();
  const drawer = page.getByRole("dialog", { name: "Ingredients" });
  await expect(drawer).toContainText("For 2 servings");
  await drawer.locator("label", { hasText: "Paneer" }).click(); // the visible check circle
  await expect(drawer.getByRole("checkbox", { name: /Paneer/ })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await page.getByRole("button", { name: "Ingredients" }).click();
  await expect(drawer.getByRole("checkbox", { name: /Paneer/ })).toBeChecked();
});

test("hands-free: voice commands move between steps and start a timer", async ({ page }) => {
  // A stand-in for the browser's speech recognition that the test can "speak" into.
  await page.addInitScript(() => {
    type Handler = ((e: unknown) => void) | null;
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: Handler = null;
      onerror: Handler = null;
      onend: (() => void) | null = null;
      start() {
        (window as unknown as { __say: (t: string) => void }).__say = (transcript: string) =>
          this.onresult?.({ resultIndex: 0, results: [[{ transcript }]] });
      }
      stop() {}
      abort() {}
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
  });
  const say = (text: string) =>
    page.evaluate((t) => (window as unknown as { __say: (t: string) => void }).__say(t), text);

  await openCookMode(page);
  await page.getByRole("button", { name: "Voice control off" }).click();
  await expect(page.getByRole("button", { name: "Voice control on" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await say("next step please");
  await expect(counter(page)).toHaveText("Step 2 of 6");
  await say("start timer");
  await expect(page.locator('[data-dock-timer$=":2:0"]')).toHaveAttribute("data-status", "running");
  await say("आगे"); // Hindi "next"
  await expect(counter(page)).toHaveText("Step 3 of 6");
  await say("go back");
  await expect(counter(page)).toHaveText("Step 2 of 6");
  await say("ingredients");
  await expect(page.getByRole("dialog", { name: "Ingredients" })).toBeVisible();
});

test("an unknown recipe explains itself and offers the way back", async ({ page }) => {
  await page.goto("/en/cook/not-a-real-recipe?no3d=1");
  await expect(
    page.getByRole("heading", { name: "This recipe isn't on this device" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to the kitchen" }).click();
  await expect(page).toHaveURL(/\/en$/);
});

test("Cook Mode has no axe violations, and the site header steps aside", async ({ page }) => {
  await openCookMode(page);
  await expect(page.locator("[data-site-header]")).toBeHidden();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("the 3D kitchen turns into the blurred Cook Mode background", async ({ page }) => {
  await page.goto("/en");
  await page.evaluate(() =>
    localStorage.setItem("lk-quality", JSON.stringify({ state: { setting: "low" }, version: 1 })),
  );
  await openCookMode(page, "");
  const scene = page.locator("[data-scene-tier]");
  await expect(scene).toHaveAttribute("data-mode", "cook");
  await expect(scene).toHaveAttribute("data-scene-ready", "true", { timeout: 60_000 });
  await page.getByRole("button", { name: "Exit Cook Mode" }).click();
  await expect(scene).toHaveAttribute("data-mode", "kitchen");
});
