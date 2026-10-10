import AxeBuilder from "./axe";
import { expect, type Page, test } from "@playwright/test";

const SLOW = { timeout: 30_000 };
const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();

/** Fake speech recognition the test can "speak" into, and a speech synthesiser that records. */
async function fakeSpeech(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__spoken = [] as string[];
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        w.__say = (transcript: string) =>
          this.onresult?.({ resultIndex: 0, results: [[{ transcript }]] });
      }
      stop() {}
      abort() {}
    }
    w.SpeechRecognition = FakeRecognition;
    const synth = {
      speaking: false,
      cancel() {},
      speak(u: { text: string }) {
        (w.__spoken as string[]).push(u.text);
      },
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    w.SpeechSynthesisUtterance = class {
      text: string;
      lang = "";
      rate = 1;
      constructor(text: string) {
        this.text = text;
      }
    };
  });
}
const say = (page: Page, text: string) =>
  page.evaluate((t) => (window as unknown as { __say: (t: string) => void }).__say(t), text);
const spoken = (page: Page) =>
  page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.join(" | "));
const counter = (page: Page) => page.locator("[data-step-counter]");

async function openCookMode(page: Page) {
  await page.goto("/en?no3d=1");
  const input = page.getByRole("combobox").first();
  await input.fill("spinach, paneer, tomato");
  await input.press("Enter");
  await page.getByRole("button", { name: "Cook", exact: true }).click();
  await page.getByRole("button", { name: "Palak Paneer Bhurji" }).click(SLOW);
  await page.getByRole("button", { name: "Start Cook Mode" }).click();
  await expect(counter(page)).toHaveText("Step 1 of 6");
}

test("voice Cook Mode: timers of any length, jump to a step, what's next, help; it stays on", async ({
  page,
}) => {
  await fakeSpeech(page);
  await openCookMode(page);
  await page.getByRole("button", { name: "Voice control off" }).click();

  await say(page, "set a timer for 2 minutes");
  await expect(page.locator("[data-dock-timer]")).toHaveCount(1);
  await expect(page.locator("[data-dock-timer]")).toHaveAttribute("data-status", "running");
  await expect.poll(() => spoken(page)).toContain("Timer set for 2 minutes.");

  await say(page, "how much time is left");
  await expect.poll(() => spoken(page)).toMatch(/2 minutes: (1 minute \d+ seconds|2 minutes) left/);

  await say(page, "go to step 3");
  await expect(counter(page)).toHaveText("Step 3 of 6");
  await say(page, "what's next");
  await expect.poll(() => spoken(page)).toContain("Next, step 4:");
  await expect(counter(page)).toHaveText("Step 3 of 6"); // only read out, not moved

  await say(page, "step 9");
  await expect.poll(() => spoken(page)).toContain("There's no step 9.");

  await say(page, "help");
  await expect(page.locator("#voice-help")).toContainText("Go to step 3");
  expect((await axe(page)).violations).toEqual([]);

  // Turned on once, voice is on again next time.
  await page.reload();
  await expect(page.getByRole("button", { name: "Voice control on" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("shopping list goes to WhatsApp aisle by aisle", async ({ page }) => {
  await page.goto("/en/list?no3d=1");
  const add = page.locator("#list-add");
  for (const item of ["2 onions", "curd", "salt"]) {
    await add.fill(item);
    await add.press("Enter");
  }
  await page.getByRole("checkbox", { name: "Got salt" }).check({ force: true });
  const href = await page.getByRole("link", { name: "Send on WhatsApp" }).getAttribute("href");
  expect(href?.startsWith("https://wa.me/?text=")).toBe(true);
  const text = decodeURIComponent(href!.split("text=")[1]);
  expect(text).toContain("*🛒 Shopping list* (2 items)");
  expect(text).toContain("*🥬 Fruit & veg*\n• onions (2)");
  expect(text).toContain("*🥛 Dairy*\n• curd");
  expect(text).not.toContain("salt");
  await expect(page.getByRole("link", { name: "Send on WhatsApp" })).toHaveAttribute(
    "target",
    "_blank",
  );
});

test("leftovers: a Leftovers row, a tag on the chip, and the AI is told", async ({ page }) => {
  await page.goto("/en?no3d=1");
  await page.getByRole("radiogroup", { name: "Quick add" }).getByText("Leftovers").click();
  await expect(page.getByText("Tap what's left from yesterday.")).toBeVisible();
  await page.getByRole("button", { name: "Add Leftover rice" }).click();
  const input = page.getByRole("combobox", { name: "Add ingredients" });
  await input.fill("basi roti, onion");
  await input.press("Enter");
  const chips = page.getByRole("list", { name: "On your counter" });
  await expect(chips.getByRole("listitem").filter({ hasText: "Leftover rotis" })).toContainText(
    "Leftover",
  );
  const request = page.waitForRequest("**/api/recipes/generate");
  await page.getByRole("button", { name: "Cook", exact: true }).click();
  const body = (await request).postDataJSON() as {
    ingredients: { name: string; leftover?: boolean }[];
  };
  expect(body.ingredients.filter((i) => i.leftover).map((i) => i.name)).toEqual([
    "Leftover rice",
    "Leftover rotis",
  ]);
  expect(body.ingredients.find((i) => i.name === "Onion")?.leftover).toBeUndefined();
  await expect(page.getByRole("heading", { name: "Fresh out of the pot" })).toBeVisible(SLOW);
});

test("real 3D ingredient models land on the counter without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const models: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/models/ingredients/") && r.url().endsWith(".glb"))
      models.push(`${r.status()} ${r.url().split("/").pop()}`);
  });
  await page.goto("/en");
  await page.evaluate(() =>
    localStorage.setItem("lk-quality", JSON.stringify({ state: { setting: "low" }, version: 1 })),
  );
  await page.reload();
  await expect(page.locator("[data-scene-tier]")).toHaveAttribute("data-scene-ready", "true", {
    timeout: 60_000,
  });
  const input = page.getByRole("combobox", { name: "Add ingredients" });
  await input.fill("tomato, onion, garlic");
  await input.press("Enter");
  await expect(page.locator("[data-on-counter]")).toHaveAttribute("data-on-counter", "3", SLOW);
  // tomato and onion have models; garlic stays a clay blob. The counter updates before the files
  // arrive, so wait for them.
  await expect.poll(() => [...models].sort(), SLOW).toEqual(["200 onion.glb", "200 tomato.glb"]);
  expect(errors).toEqual([]);
});
