import { describe, expect, it, vi } from "vitest";
import { rainDelays, RAIN_STAGGER } from "@/components/scene/cookSignals";
import { MOCK_SCAN, sniffImage } from "@/lib/ai/scan";
import { ScanResultSchema, SurpriseIdeasSchema, SurpriseRequestSchema } from "@/lib/ai/schema";
import { tidyIdeas } from "@/lib/ai/surprise";
import { parseIngredients } from "@/lib/parseIngredients";
import { fitWithin, HIGH_CONFIDENCE, toReviewItems } from "@/lib/scanItems";
import { angleAt, PLATES, planSpin, plateAtFront, SPIN_TURNS, STEP } from "@/lib/wheel";

vi.mock("server-only", () => ({}));

const ids = (text: string) => parseIngredients(text).map((p) => p.id);

describe("voice transcripts (F3)", () => {
  it("adds 3 chips from the spec's English example", () => {
    expect(ids("I have eggs, spinach and cheese")).toEqual(["egg", "spinach", "cheese"]);
  });

  it("splits spoken lists that have no commas, in English, Hinglish and Hindi", () => {
    expect(ids("eggs spinach cheese")).toEqual(["egg", "spinach", "cheese"]);
    expect(ids("mere paas aloo pyaaz aur tamatar hai")).toEqual(["potato", "onion", "tomato"]);
    expect(ids("मेरे पास अंडे पालक और पनीर है")).toEqual(["egg", "spinach", "paneer"]);
    expect(ids("2 tomatoes 200 g paneer hari mirch")).toEqual(["tomato", "paneer", "green-chilli"]);
  });

  it("keeps an unknown multi-word item whole", () => {
    expect(parseIngredients("dragon fruit")).toEqual([{ id: null, name: "Dragon fruit" }]);
  });

  it("doesn't split Hindi words that contain a conjunction (या inside प्याज़)", () => {
    expect(ids("टमाटर प्याज़ और हरी मिर्च")).toEqual(["tomato", "onion", "green-chilli"]);
  });

  it("turns Hindi and Hinglish counts into digits", () => {
    expect(parseIngredients("दो अंडे और दूध")).toEqual([
      { id: "egg", name: "Egg", qty: "2" },
      { id: "milk", name: "Milk" },
    ]);
    expect(parseIngredients("teen tamatar")[0].qty).toBe("3");
    expect(parseIngredients("३ अंडे")[0].qty).toBe("3");
    // "do" is only a number before a space: "doodh" stays milk
    expect(parseIngredients("do ande aur doodh").map((p) => p.id)).toEqual(["egg", "milk"]);
  });
});

describe("fridge scan review (F2)", () => {
  it("matches names, merges duplicates, drops guesses and sorts by confidence", () => {
    const items = toReviewItems([
      { name: "Eggs", confidence: 0.8 },
      { name: "egg", confidence: 0.95 },
      { name: "palak", confidence: 0.6 },
      { name: "mystery jar", confidence: 0.1 },
      { name: "kiwi berries", confidence: 0.4 },
    ]);
    expect(items.map((i) => [i.key, i.confidence])).toEqual([
      ["egg", 0.95],
      ["spinach", 0.6],
      ["kiwi berries", 0.4],
    ]);
    expect(items[2]).toMatchObject({ id: null, name: "Kiwi berries" });
  });

  it("pre-checks only confident items", () => {
    const items = toReviewItems([
      { name: "paneer", confidence: HIGH_CONFIDENCE },
      { name: "tomato", confidence: HIGH_CONFIDENCE - 0.01 },
    ]);
    expect(items.map((i) => i.checked)).toEqual([true, false]);
  });

  it("clamps out-of-range confidences", () => {
    expect(toReviewItems([{ name: "milk", confidence: 7 }])[0].confidence).toBe(1);
  });

  it("resizes to 1024 px on the longest side, never up", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(1080, 1920)).toEqual({ width: 576, height: 1024 });
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it("sniffs real image types and rejects anything else", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe("image/png");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(sniffImage(webp)).toBe("image/webp");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });

  it("validates model output strictly", () => {
    expect(ScanResultSchema.safeParse(MOCK_SCAN).success).toBe(true);
    expect(ScanResultSchema.safeParse({ items: [{ name: "egg", confidence: 1.4 }] }).success).toBe(
      false,
    );
    expect(
      ScanResultSchema.safeParse({ items: [{ name: "egg", confidence: 0.9, html: "<b>" }] })
        .success,
    ).toBe(false);
  });
});

describe("Surprise Me wheel (R3)", () => {
  it("always lands the chosen plate at the front after the full turns", () => {
    for (let target = 0; target < PLATES; target++) {
      for (const from of [0, 1.3, -4]) {
        const plan = planSpin(target, from);
        expect(plateAtFront(plan.to)).toBe(target);
        expect(plan.to - from).toBeGreaterThanOrEqual(SPIN_TURNS * Math.PI * 2);
        expect(plan.to - from).toBeLessThan((SPIN_TURNS + 1) * Math.PI * 2);
      }
    }
  });

  it("decelerates: always turning forward, slower at the end", () => {
    const plan = planSpin(5);
    const at = (ms: number) => angleAt(plan, ms);
    let prev = at(0);
    for (let ms = 100; ms <= plan.durationMs; ms += 100) {
      expect(at(ms)).toBeGreaterThanOrEqual(prev);
      prev = at(ms);
    }
    const early = at(400) - at(0);
    const late = at(plan.durationMs) - at(plan.durationMs - 400);
    expect(late).toBeLessThan(early / 10);
    expect(at(plan.durationMs + 5000)).toBe(plan.to);
  });

  it("reduced motion lands at once", () => {
    const plan = planSpin(3, 0, undefined, 0);
    expect(plateAtFront(angleAt(plan, 0))).toBe(3);
  });

  it("picks the plate nearest the front", () => {
    expect(plateAtFront(0)).toBe(0);
    expect(plateAtFront(-STEP * 2 + 0.1)).toBe(2);
    expect(plateAtFront(STEP)).toBe(PLATES - 1);
  });

  it("tidies ideas to exactly one emoji each", () => {
    const ideas = tidyIdeas([
      { title: "Dal", emoji: "lentils 🥣!", oneLiner: "x" },
      { title: "Poha", emoji: "🍚🍋", oneLiner: "y" },
    ]);
    expect(ideas.map((i) => i.emoji)).toEqual(["🥣", "🍚"]);
  });

  it("rejects a degenerate answer (the same dish eight times) so it gets the retry", () => {
    const same = { title: "तलरे डलवल", emoji: "🍽️", oneLiner: "x" };
    expect(SurpriseIdeasSchema.safeParse({ ideas: Array(8).fill(same) }).success).toBe(false);
    const garbled = Array.from({ length: 8 }, (_, i) => ({
      title: i ? `Dish ${i}` : "तलहल तलहल तलहल तलहल",
      emoji: "🍲",
      oneLiner: "x",
    }));
    expect(SurpriseIdeasSchema.safeParse({ ideas: garbled }).success).toBe(false);
  });

  it("needs exactly 8 ideas and a valid request", () => {
    const idea = { title: "Poha", emoji: "🍚", oneLiner: "Light and lemony." };
    const eight = Array.from({ length: 8 }, (_, i) => ({ ...idea, title: `Poha ${i}` }));
    expect(SurpriseIdeasSchema.safeParse({ ideas: eight }).success).toBe(true);
    expect(SurpriseIdeasSchema.safeParse({ ideas: eight.slice(1) }).success).toBe(false);
    expect(
      SurpriseRequestSchema.safeParse({ ingredients: [], prefs: {}, locale: "en" }).success,
    ).toBe(false);
  });
});

describe("ingredient rain", () => {
  it("staggers items that arrive together; a single item drops at once", () => {
    expect([...rainDelays(["a"])]).toEqual([]);
    expect([...rainDelays(["a", "b", "c"])]).toEqual([
      ["a", 0],
      ["b", RAIN_STAGGER],
      ["c", RAIN_STAGGER * 2],
    ]);
  });
});
