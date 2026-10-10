import AxeBuilder from "./axe";
import { expect, type Page, test } from "@playwright/test";
import path from "node:path";

const FIXTURES = path.join(__dirname, "..", "tests", "fixtures", "images");
const scene = (page: Page) => page.locator("[data-scene-tier]");
const chips = (page: Page) =>
  page.getByRole("list", { name: "On your counter" }).locator("[data-ingredient]");
const SLOW = { timeout: 30_000 };

async function scan(page: Page, file = "fridge-bright.jpg") {
  await page.locator("[data-scan-input]").setInputFiles(path.join(FIXTURES, file));
}

/** A stand-in for the browser's speech recognition that the test can "speak" into. */
async function fakeRecognition(page: Page, opts: { deny?: boolean } = {}) {
  await page.addInitScript((deny) => {
    type Ev = { resultIndex: number; results: unknown };
    const w = window as unknown as Record<string, unknown>;
    w.__langs = [] as string[];
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((e: Ev) => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        (w.__langs as string[]).push(this.lang);
        if (deny) {
          setTimeout(() => {
            this.onerror?.({ error: "not-allowed" });
            this.onend?.();
          });
          return;
        }
        w.__say = (transcript: string) => {
          const result = Object.assign([{ transcript }], { isFinal: true });
          this.onresult?.({ resultIndex: 0, results: [result] });
        };
        w.__silence = () => this.onend?.();
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onerror?.({ error: "aborted" });
        this.onend?.();
      }
    }
    w.SpeechRecognition = FakeRecognition;
  }, opts.deny ?? false);
}
const say = (page: Page, text: string) =>
  page.evaluate((t) => (window as unknown as { __say: (t: string) => void }).__say(t), text);

test.describe("with the 3D kitchen", () => {
  // Software GL in CI: pin the light "low" tier (as in phases 3–4).
  test.beforeEach(async ({ page }) => {
    await page.goto("/en");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("lk-quality", JSON.stringify({ state: { setting: "low" }, version: 1 }));
    });
    await page.reload();
    await expect(scene(page)).toHaveAttribute("data-scene-ready", "true", { timeout: 60_000 });
  });

  test("a fridge photo becomes reviewed chips that rain onto the counter", async ({ page }) => {
    await scan(page);
    const sheet = page.getByRole("dialog");
    await expect(sheet).toHaveAttribute("data-scan-status", "review", SLOW);
    await expect(sheet.getByRole("heading", { name: "I spotted 7 things" })).toBeVisible();
    await expect(sheet).toContainText("Your photo isn't stored");
    // Confident finds start ticked, guesses don't.
    await expect(sheet.getByRole("button", { name: /Spinach/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(sheet.getByRole("button", { name: /Lemon/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await sheet.getByRole("button", { name: /Paneer/ }).click(); // untick
    await sheet.getByRole("button", { name: "Add 4 ingredients" }).click();
    await expect(sheet).toBeHidden();
    await expect(chips(page)).toHaveCount(4);
    await expect(scene(page)).toHaveAttribute("data-on-counter", "4", SLOW);
  });

  test("Surprise Me spins the wheel, lands on a dish and cooks it", async ({ page }) => {
    const input = page.getByRole("combobox", { name: "Add ingredients" });
    await input.fill("spinach, paneer, tomato");
    await input.press("Enter");
    const generate = page.waitForRequest((r) => r.url().endsWith("/api/recipes/generate"));
    const ideasResponse = page.waitForResponse((r) => r.url().endsWith("/api/surprise"));
    await page.getByRole("button", { name: "Surprise me" }).click();
    // The 3D wheel comes up out of the counter (software GL is slow, so "on its way" counts).
    await expect(scene(page)).toHaveAttribute("data-wheel", /moving|up/, SLOW);
    // It lands on one of the eight ideas, which is sent as the recipe request's wish. Read from
    // the network, not the panel: under load the 4.2 s spin can be over before the panel is read.
    const { ideas } = (await (await ideasResponse).json()) as { ideas: { title: string }[] };
    expect(ideas).toHaveLength(8);
    const wish = (await generate).postDataJSON().wish as string;
    expect(ideas.map((i) => i.title)).toContain(wish);
    await expect(scene(page)).toHaveAttribute("data-wheel", "down", SLOW);
    await expect(page.getByRole("heading", { name: "Fresh out of the pot" })).toBeVisible(SLOW);
  });
});

test("on desktop the UI steps aside while the 3D moments play, then comes back", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "phones keep the sheet; it only lowers");
  await page.goto("/en?no3d=1");
  const dock = page.locator("[data-stage]");
  const input = page.getByRole("combobox", { name: "Add ingredients" });
  await input.fill("spinach, paneer");
  await input.press("Enter");
  await page.getByRole("button", { name: "Surprise me" }).click();
  await expect(dock).toHaveAttribute("data-stage", "on");
  await expect(input).toBeHidden(); // slid away: not visible, not focusable
  // Cooking shows only a compact progress pill, not the full side panel.
  await expect(page.locator("section[data-compact]")).toBeVisible(SLOW);
  await expect(page.getByRole("progressbar", { name: /progress/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fresh out of the pot" })).toBeVisible(SLOW);
  await expect(dock).toHaveAttribute("data-stage", "off");
  await expect(input).toBeVisible();
});

test.describe("content first (no 3D)", () => {
  test("voice adds chips in English and in Hindi", async ({ page }) => {
    await fakeRecognition(page);
    await page.goto("/en?no3d=1");
    const mic = page.getByRole("button", { name: "Add ingredients by voice" });
    await mic.click();
    await expect(page.getByRole("button", { name: "Stop listening" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await say(page, "I have eggs, spinach and cheese");
    await expect(chips(page)).toHaveCount(3);
    await expect(chips(page)).toContainText(["Egg", "Spinach", "Cheese"]);

    // Switch the speech language mid-listen: recognition restarts in hi-IN.
    await page.getByRole("button", { name: "हिं" }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __langs: string[] }).__langs))
      .toEqual(["en-IN", "hi-IN"]);
    await say(page, "मेरे पास आलू प्याज़ और टमाटर है");
    await expect(chips(page)).toHaveCount(6);
    await expect(chips(page)).toContainText(["Potato", "Onion", "Tomato"]);
    await page.getByRole("button", { name: "Stop listening" }).click();
    await expect(page.getByRole("button", { name: "Add ingredients by voice" })).toBeVisible();
  });

  test("the Hindi page listens in Hindi by default", async ({ page }) => {
    await fakeRecognition(page);
    await page.goto("/hi?no3d=1");
    await page.getByRole("button", { name: "बोलकर सामग्री जोड़ें" }).click();
    await say(page, "दो अंडे और दूध");
    await expect(page.locator("[data-ingredient]")).toHaveCount(2);
    expect(await page.evaluate(() => (window as unknown as { __langs: string[] }).__langs)).toEqual(
      ["hi-IN"],
    );
  });

  test("voice explains itself when unsupported or blocked", async ({ page, browser }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      delete w.SpeechRecognition;
      delete w.webkitSpeechRecognition;
    });
    await page.goto("/en?no3d=1");
    const unsupported = "Voice input isn't available in this browser";
    const mic = page.getByRole("button", { name: new RegExp(unsupported) });
    await expect(mic).toHaveAttribute("aria-disabled", "true");
    await expect(mic).toHaveAttribute("title", new RegExp(unsupported));

    const denied = await browser.newPage();
    await fakeRecognition(denied, { deny: true });
    await denied.goto("/en?no3d=1");
    await denied.getByRole("button", { name: "Add ingredients by voice" }).click();
    await expect(
      denied.getByRole("status").filter({ hasText: "microphone is blocked" }),
    ).toBeVisible();
    await denied.close();
  });

  test("a dark, blurry photo is handled gracefully, and errors offer a retry", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/scan", async (route) => {
      calls++;
      if (calls === 1) {
        return route.fulfill({
          status: 502,
          json: { error: { code: "upstream", message: "The AI chef is very busy right now." } },
        });
      }
      // What a real model returns for tests/fixtures/images/fridge-dark-blurry.jpg: little, unsure.
      return route.fulfill({
        json: {
          items: [
            { name: "egg", confidence: 0.6 },
            { name: "milk", confidence: 0.45 },
            { name: "thing", confidence: 0.1 },
          ],
        },
      });
    });
    await page.goto("/en?no3d=1");
    await scan(page, "fridge-dark-blurry.jpg");
    const sheet = page.getByRole("dialog");
    await expect(sheet).toHaveAttribute("data-scan-status", "error");
    await expect(sheet).toContainText("The AI chef is very busy right now.");
    await sheet.getByRole("button", { name: "Try again" }).click();
    await expect(sheet.getByRole("heading", { name: "I spotted 2 things" })).toBeVisible();
    await expect(sheet).toContainText("Anything else?");
    // Nothing was confident enough to pre-tick.
    await expect(sheet.getByRole("button", { name: "Add selected" })).toBeDisabled();
    await sheet.getByRole("button", { name: /Egg/ }).click();
    await sheet.getByRole("button", { name: "Add 1 ingredient" }).click();
    await expect(chips(page)).toHaveCount(1);
  });

  test("a file that isn't a photo is turned away kindly", async ({ page }) => {
    await page.goto("/en?no3d=1");
    await page.locator("[data-scan-input]").setInputFiles({
      name: "notes.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("not really a photo"),
    });
    await expect(page.getByRole("dialog")).toContainText("That file isn't a photo we can read");
  });

  test("Surprise Me with reduced motion lands at once and cooks", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/en?no3d=1");
    const input = page.getByRole("combobox", { name: "Add ingredients" });
    await expect(page.getByRole("button", { name: "Surprise me" })).toBeDisabled();
    await input.fill("eggs, onion");
    await input.press("Enter");
    await page.getByRole("button", { name: "Surprise me" }).click();
    await expect(page.locator("[data-surprise]:visible")).toHaveAttribute(
      "data-surprise",
      "landed",
    );
    await expect(page.getByRole("heading", { name: "Fresh out of the pot" })).toBeVisible(SLOW);
  });

  test("scan sheet and Surprise panel have no axe violations", async ({ page }) => {
    await page.goto("/en?no3d=1");
    await scan(page);
    await expect(page.getByRole("dialog")).toHaveAttribute("data-scan-status", "review", SLOW);
    const axe = () =>
      new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect((await axe()).violations).toEqual([]);
    await page.getByRole("button", { name: "Add 5 ingredients" }).click();

    // Checked mid-spin (about 4 s), with all eight ideas listed.
    await page.getByRole("button", { name: "Surprise me" }).click();
    await expect(page.locator("[data-surprise]:visible")).toHaveAttribute(
      "data-surprise",
      "spinning",
    );
    expect((await axe()).violations).toEqual([]);
  });
});

test("the scan and surprise APIs validate their input", async ({ request }) => {
  const svg = await request.post("/api/scan", {
    multipart: {
      image: { name: "x.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") },
    },
  });
  expect(svg.status()).toBe(415);
  const empty = await request.post("/api/scan", { multipart: { other: "x" } });
  expect(empty.status()).toBe(400);
  const surprise = await request.post("/api/surprise", {
    data: { ingredients: [], prefs: {}, locale: "en" },
  });
  expect(surprise.status()).toBe(400);
});
