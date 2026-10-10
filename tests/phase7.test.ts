import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ai/mock";
import { languageIssues, parseRecipeSet } from "@/lib/ai/validate";
import { daypartAt, effectiveDaypart, LOOKS, mixLooks } from "@/lib/daypart";
import { shareCardUrl, shareSlug, whatsappUrl } from "@/lib/share";
import { recipeJsonLd, safeJson } from "@/lib/sharedRecipe";

vi.mock("server-only", () => ({}));

describe("Day/Night kitchen (R9)", () => {
  it("follows the local clock: golden hour 4–7 pm, night 7 pm–5 am, morning otherwise", () => {
    expect([4, 5, 9, 15, 16, 18, 19, 23, 0].map(daypartAt)).toEqual([
      "night",
      "morning",
      "morning",
      "morning",
      "golden",
      "golden",
      "night",
      "night",
      "night",
    ]);
  });

  it("a manual choice overrides the clock", () => {
    const noon = new Date(2026, 9, 9, 12);
    expect(effectiveDaypart("auto", noon)).toBe("morning");
    expect(effectiveDaypart("night", noon)).toBe("night");
  });

  it("blends looks smoothly, ending exactly on the target", () => {
    const { golden, night } = LOOKS;
    const lower = (l: object) => JSON.parse(JSON.stringify(l).toLowerCase());
    expect(lower(mixLooks(golden, night, 0))).toEqual(lower(golden));
    expect(lower(mixLooks(golden, night, 1))).toEqual(lower(night));
    const half = mixLooks(golden, night, 0.5);
    expect(half.lamp).toBeCloseTo(0.5);
    expect(half.background).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("recipes come back in the language asked for (R6)", () => {
  const hindi = {
    ...FIXTURES[0],
    locale: "hi" as const,
    title: "पालक पनीर भुर्जी",
    tagline: "झटपट और स्वादिष्ट।",
    missing_summary: null,
    steps: FIXTURES[0].steps.map((s) => ({ ...s, text: "पालक धोकर काट लें।" })),
  };

  it("accepts Hindi text, and flags English sentences in a Hindi recipe", () => {
    expect(languageIssues([hindi], "hi")).toEqual([]);
    const mixed = { ...hindi, missing_summary: "Add garlic and you can make it." };
    expect(languageIssues([mixed], "hi")).toEqual([
      "- recipes.0.missing_summary: write it in Hindi (Devanagari script)",
    ]);
    expect(languageIssues([hindi], "en")).toEqual(['- recipes.0.locale: must be "en"']);
  });

  it("an English answer to a Hindi request fails validation (so it gets the retry)", () => {
    const result = parseRecipeSet(JSON.stringify({ recipes: FIXTURES }), false, "hi");
    expect(result.ok).toBe(false);
    expect(parseRecipeSet(JSON.stringify({ recipes: FIXTURES }), false, "en").ok).toBe(true);
  });
});

describe("sharing (R5)", () => {
  it("the same recipe always gets the same public slug, a different one never does", () => {
    const [a, b] = FIXTURES;
    expect(shareSlug(structuredClone(a))).toBe(shareSlug(a));
    expect(shareSlug(a)).not.toBe(shareSlug(b));
    expect(shareSlug(a)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("builds the card URL and the WhatsApp link", () => {
    expect(shareCardUrl("dal-1x", "https://p.supabase.co")).toBe(
      "https://p.supabase.co/storage/v1/object/public/share-cards/dal-1x.jpg",
    );
    expect(whatsappUrl("Dal & rice", "https://x.in/r/a")).toBe(
      "https://wa.me/?text=Dal%20%26%20rice%0Ahttps%3A%2F%2Fx.in%2Fr%2Fa",
    );
  });

  it("describes the recipe for search engines, and recipe text can't escape the script tag", () => {
    const evil = { ...FIXTURES[0], title: "</script><script>alert(1)</script>" };
    const ld = recipeJsonLd(evil, "https://x.in/r/a", null);
    expect(ld).toMatchObject({ "@type": "Recipe", totalTime: expect.stringMatching(/^PT\d+M$/) });
    const json = safeJson(ld);
    expect(json).not.toContain("</script>");
    expect(JSON.parse(json).name).toBe(evil.title);
  });
});
