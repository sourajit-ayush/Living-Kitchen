import AxeBuilder from "./axe";
import { expect, type Locator, type Page, test } from "@playwright/test";
import fs from "node:fs";

const SLOW = { timeout: 30_000 };
const supabaseReady = (() => {
  try {
    const env = fs.readFileSync(".env.local", "utf8");
    return /^NEXT_PUBLIC_SUPABASE_URL=\S/m.test(env) && /^SUPABASE_SERVICE_ROLE_KEY=\S/m.test(env);
  } catch {
    return false;
  }
})();

const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();

/** Press Tab until `target` has focus (a keyboard user's path to it). */
async function tabTo(page: Page, target: Locator, max = 80) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
  }
  throw new Error(`Never reached ${target} with Tab`);
}

test.describe("security", () => {
  test("pages and API send the security headers", async ({ request }) => {
    for (const res of [
      await request.get("/en"),
      await request.post("/api/share", { multipart: { recipe: "{}" } }),
    ]) {
      const h = res.headers();
      expect(h["content-security-policy"]).toContain("default-src 'self'");
      expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(h["content-security-policy"]).toContain("object-src 'none'");
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(h["permissions-policy"]).toContain("camera=()");
      expect(h["x-powered-by"]).toBeUndefined();
    }
  });

  test("deleting an account needs a valid sign-in", async ({ request }) => {
    test.skip(!supabaseReady, "needs the Supabase project");
    expect((await request.delete("/api/account")).status()).toBe(401);
    const forged = await request.delete("/api/account", {
      headers: { Authorization: "Bearer aaa.bbb.ccc" },
    });
    expect(forged.status()).toBe(401);
  });
});

test.describe("settings", () => {
  test("units, diet, 3D quality and sound stick; the language switch moves the page", async ({
    page,
  }) => {
    await page.goto("/en/settings?no3d=1");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    // People click the visible pill (the radio inside it is visually hidden).
    const pick = (group: string, option: string) =>
      page.getByRole("group", { name: group }).getByText(option, { exact: true }).click();
    await pick("Units", "Metric");
    await pick("Diet", "Vegan");
    await pick("3D kitchen", "Low");
    await pick("Kitchen sounds", "On");
    await page.reload();
    await expect(page.getByRole("radio", { name: "Metric" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Vegan" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Low" })).toBeChecked();
    await expect(
      page.getByRole("group", { name: "Kitchen sounds" }).getByRole("radio", { name: "On" }),
    ).toBeChecked();

    await pick("Language", "हिन्दी");
    await expect(page).toHaveURL(/\/hi\/settings/);
    await expect(page.getByRole("heading", { name: "सेटिंग्स", level: 1 })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  });

  test("download my data: this device's data as JSON, never the sign-in session", async ({
    page,
  }) => {
    await page.goto("/en/list?no3d=1");
    const add = page.locator("#list-add");
    await add.fill("2 onions");
    await add.press("Enter");
    await page.evaluate(() => localStorage.setItem("sb-test-auth-token", "secret-session"));
    await page.goto("/en/settings?no3d=1");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download my data" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^living-kitchen-data-\d{4}-\d{2}-\d{2}\.json$/);
    const text = fs.readFileSync((await file.path())!, "utf8");
    const data = JSON.parse(text);
    expect(data.app).toBe("The Living Kitchen");
    expect(data.account).toBeNull();
    expect(JSON.stringify(data.thisDevice["lk-list"])).toContain("onions");
    expect(text).not.toContain("secret-session");
    await expect(page.getByRole("status").filter({ hasText: "downloaded" })).toBeVisible();
  });

  test("delete my data asks first; cancelling keeps everything; confirming clears the device", async ({
    page,
  }) => {
    await page.goto("/en?no3d=1");
    const input = page.getByRole("combobox").first();
    await input.fill("spinach, paneer");
    await input.press("Enter");
    await expect(
      page.getByRole("list", { name: "On your counter" }).getByRole("listitem"),
    ).toHaveCount(2);

    await page.goto("/en/settings?no3d=1");
    const del = page.getByRole("button", { name: "Delete my data" });
    await del.click();
    const dialog = page.getByRole("alertdialog", { name: "Delete all your data?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("can't be undone");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(del).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem("lk-kitchen"))).toContain("Spinach");

    await del.click();
    await dialog.getByRole("button", { name: "Delete everything" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "All your data has been deleted." }),
    ).toBeVisible(SLOW);
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).filter((k) => k === "lk-kitchen" || k === "lk-list"),
      ),
    ).toEqual([]);
    await page.goto("/en?no3d=1");
    await expect(page.getByRole("list", { name: "On your counter" })).toHaveCount(0);
  });

  test("settings, its delete dialog and night mode pass axe", async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        "lk-daypart",
        JSON.stringify({ state: { setting: "night" }, version: 1 }),
      ),
    );
    for (const locale of ["en", "hi", "bn"]) {
      await page.goto(`/${locale}/settings?no3d=1`);
      await page.getByRole("radio").first().waitFor();
      expect((await axe(page)).violations).toEqual([]);
    }
    await page.goto("/en/settings?no3d=1");
    await page.getByRole("button", { name: "Delete my data" }).click();
    await page.getByRole("alertdialog").waitFor();
    expect((await axe(page)).violations).toEqual([]);
  });
});

test("an unknown address gets a 404 in the right language, inside the site", async ({ page }) => {
  for (const [locale, title] of [
    ["en", "This page isn't in the kitchen"],
    ["hi", "यह पेज रसोई में नहीं है"],
    ["bn", "এই পাতা রান্নাঘরে নেই"],
  ]) {
    const res = await page.goto(`/${locale}/no-such-page/at-all?no3d=1`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("banner")).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
  }
});

test("keyboard only: skip link, add, cook, open a recipe, Cook Mode and back", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "a hardware keyboard path; phones are covered by the touch tests");
  await page.goto("/en?no3d=1");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();

  const input = page.getByRole("combobox", { name: "Add ingredients" });
  await tabTo(page, input);
  await page.keyboard.type("spinach, paneer, tomato");
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("button", { name: "Cook", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Fresh out of the pot" })).toBeFocused(SLOW);

  await tabTo(page, page.getByRole("button", { name: "Palak Paneer Bhurji" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Palak Paneer Bhurji", level: 2 })).toBeFocused();

  await tabTo(page, page.getByRole("button", { name: "Start Cook Mode" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/en\/cook\//);
  await expect(page.locator("[data-step-counter]")).toHaveText("Step 1 of 6");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[data-step-counter]")).toHaveText("Step 2 of 6");
  expect((await axe(page)).violations).toEqual([]);

  await tabTo(page, page.getByRole("button", { name: "Exit Cook Mode" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/en$/);
});
