import AxeBuilder from "./axe";
import { expect, type Page, test } from "@playwright/test";
import fs from "node:fs";

const SLOW = { timeout: 30_000 };
const env = (() => {
  try {
    return Object.fromEntries(
      fs
        .readFileSync(".env.local", "utf8")
        .split(/\r?\n/)
        .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
        .filter((m): m is RegExpMatchArray => !!m)
        .map((m) => [m[1], m[2].trim()]),
    ) as Record<string, string>;
  } catch {
    return {} as Record<string, string>;
  }
})();
const supabaseReady = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

async function openKitchenLight(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /^Kitchen light/ }).click();
}

async function openBhurji(page: Page, ingredients = "spinach, paneer, tomato") {
  await page.goto("/en?no3d=1");
  const input = page.getByRole("combobox").first();
  await input.fill(ingredients);
  await input.press("Enter");
  await page.getByRole("button", { name: "Cook", exact: true }).click();
  await page.getByRole("button", { name: "Palak Paneer Bhurji" }).click(SLOW);
}

test.describe("Day/Night kitchen", () => {
  test("pick night from the header; it sticks; 'follow my clock' goes back to the time", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/en?no3d=1");
    await openKitchenLight(page, isMobile);
    await page.getByRole("menuitemradio", { name: "Night", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-daypart", "night");
    if (!isMobile) await expect(page.getByText("Late night, your counter")).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-daypart", "night");

    await openKitchenLight(page, isMobile);
    await page.getByRole("menuitemradio", { name: /Follow my clock/ }).click();
    const hour = await page.evaluate(() => new Date().getHours());
    const expected = hour >= 19 || hour < 5 ? "night" : hour >= 16 ? "golden" : "morning";
    await expect(page.locator("html")).toHaveAttribute("data-daypart", expected);
  });

  test("the 3D kitchen switches to night without errors, and the page passes axe", async ({
    page,
    isMobile,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/en");
    await page.evaluate(() => {
      localStorage.setItem("lk-quality", JSON.stringify({ state: { setting: "low" }, version: 1 }));
      localStorage.setItem(
        "lk-daypart",
        JSON.stringify({ state: { setting: "night" }, version: 1 }),
      );
    });
    await page.reload();
    await expect(page.locator("[data-scene-tier]")).toHaveAttribute("data-scene-ready", "true", {
      timeout: 60_000,
    });
    await expect(page.locator("html")).toHaveAttribute("data-daypart", "night");
    await openKitchenLight(page, isMobile);
    await page.getByRole("menuitemradio", { name: "Morning", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-daypart", "morning");
    expect(errors).toEqual([]);

    await page.keyboard.press("Escape");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() =>
      localStorage.setItem(
        "lk-daypart",
        JSON.stringify({ state: { setting: "night" }, version: 1 }),
      ),
    );
    await page.goto("/en?no3d=1");
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
  });
});

test.describe("sharing", () => {
  test.skip(!supabaseReady, "needs the Supabase project");
  // No clean-up: every run shares the same two mock recipes (one per project), so the shared rows
  // and cards never grow, and parallel runs can't delete a page another run is checking.
  let slug: string | null = null;

  test("share makes a public page with a preview card, WhatsApp and pictures", async ({
    page,
    request,
  }, testInfo) => {
    // Each project shares a slightly different recipe (other ingredients on the counter change
    // its have/missing marks, so its slug): parallel runs must not delete each other's page.
    await openBhurji(
      page,
      testInfo.project.name === "mobile"
        ? "spinach, paneer, tomato, onion"
        : "spinach, paneer, tomato",
    );
    await page.getByRole("button", { name: "Share recipe" }).click();
    const dialog = page.getByRole("dialog", { name: "Share this recipe" });
    await expect(dialog).toHaveAttribute("data-share-status", "ready", SLOW);
    const url = await dialog.locator("[data-share-url]").inputValue();
    expect(url).toMatch(/\/en\/r\/palak-paneer-bhurji-[a-z0-9]+$/);
    slug = url.split("/").pop()!;
    const wa = await dialog.getByRole("link", { name: "WhatsApp" }).getAttribute("href");
    expect(wa?.startsWith("https://wa.me/?text=")).toBe(true);
    expect(wa).toContain(encodeURIComponent(url));
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Save story picture" }).click();
    expect((await download).suggestedFilename()).toMatch(/story\.jpg$/);
    const axe = await new AxeBuilder({ page })
      .include("[role=dialog]")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(axe.violations).toEqual([]);

    // The public page: the recipe, the preview card and rich data for search.
    await page.goto(`/en/r/${slug}?no3d=1`);
    await expect(
      page.getByRole("heading", { name: "A recipe from The Living Kitchen", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Palak Paneer Bhurji" })).toBeVisible();
    const og = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(og).toContain(`/share-cards/${slug}.jpg`);
    const card = await request.get(og!);
    expect(card.status()).toBe(200);
    expect(card.headers()["content-type"]).toContain("image/jpeg");
    expect((await card.body()).length).toBeLessThan(300 * 1024); // WhatsApp-friendly
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Palak Paneer Bhurji",
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
    const ld = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent())!,
    );
    expect(ld).toMatchObject({ "@type": "Recipe", name: "Palak Paneer Bhurji" });
    const pageAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(pageAxe.violations).toEqual([]);

    // The same link in Hindi has Hindi page chrome (dynamic pages follow the URL's language).
    await page.goto(`/hi/r/${slug}?no3d=1`);
    await expect(page.getByRole("heading", { name: "द लिविंग किचन की एक रेसिपी" })).toBeVisible();
    await expect(page.getByRole("button", { name: "किचन खोलें" })).toBeVisible();

    await page.goto(`/en/r/${slug}?no3d=1`);
    await page.getByRole("button", { name: "Open the kitchen" }).click();
    await expect(page).toHaveURL(/\/en$/);
  });
});

test("an unknown share link explains itself", async ({ page }) => {
  await page.goto("/en/r/not-a-real-recipe-zz?no3d=1");
  await expect(page.getByRole("heading", { name: "This recipe isn't here" })).toBeVisible();
  await page.getByRole("link", { name: "Open the kitchen" }).click();
  await expect(page).toHaveURL(/\/en$/);
});

test("Hindi Cook Mode chrome is Hindi (the locale reaches dynamic pages)", async ({ page }) => {
  await page.goto("/hi/cook/unknown?no3d=1");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/[ऀ-ॿ]/);
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
});

test("the share API validates what it stores", async ({ request }) => {
  test.skip(!supabaseReady, "needs the Supabase project");
  const bad = await request.post("/api/share", {
    multipart: { recipe: JSON.stringify({ title: "x" }) },
  });
  expect(bad.status()).toBe(400);
  const notJpeg = await request.post("/api/share", {
    multipart: {
      recipe: fs.readFileSync("src/lib/ai/fixtures/palak-paneer-bhurji.json", "utf8"),
      card: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("<svg/>") },
    },
  });
  expect(notJpeg.status()).toBe(415);
});
