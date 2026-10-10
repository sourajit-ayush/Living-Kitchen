import { describe, expect, it } from "vitest";
import { INGREDIENTS } from "@/data/ingredients";
import { BN_ALIASES, BN_NAMES } from "@/data/ingredientNamesBn";
import { LOADING_LINES, DRINK_LOADING_LINES } from "@/lib/ai/loadingLines";
import { FIXTURES } from "@/lib/ai/mock";
import { SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { GenerateRequestSchema } from "@/lib/ai/schema";
import { languageIssues } from "@/lib/ai/validate";
import { matchIngredient } from "@/lib/matchIngredient";
import { parseIngredients } from "@/lib/parseIngredients";
import { SPEECH_LANG } from "@/lib/speech";
import { detectTimers } from "@/lib/timers";
import { parseVoiceCommand, parseVoiceIntent as intent } from "@/lib/voiceCommands";

describe("Bengali (bn)", () => {
  it("every ingredient has a Bengali name in Bengali script, and no stray ids", () => {
    const ids = new Set(INGREDIENTS.map((i) => i.id));
    for (const ing of INGREDIENTS) expect(ing.names.bn, ing.id).toMatch(/[ঀ-৿]/);
    for (const id of [...Object.keys(BN_NAMES), ...Object.keys(BN_ALIASES)]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("matches Bengali names and romanised Bengali", () => {
    expect(matchIngredient("পেঁয়াজ")?.id).toBe("onion");
    expect(matchIngredient("কাঁচালঙ্কা")?.id).toBe("green-chilli");
    expect(matchIngredient("begun")?.id).toBe("brinjal");
    expect(matchIngredient("dhone pata")?.id).toBe("coriander");
    // Hindi "badam" stays almonds
    expect(matchIngredient("badam")?.id).toBe("almonds");
  });

  it("parses a typed or spoken Bengali list with counts and units", () => {
    expect(parseIngredients("২টো টমেটো, পালং শাক আর ডিম")).toEqual([
      { id: "tomato", name: "Tomato", qty: "2" },
      { id: "spinach", name: "Spinach" },
      { id: "egg", name: "Egg" },
    ]);
    expect(parseIngredients("আমার কাছে দুটো আলু এবং ২০০ গ্রাম পনির আছে")).toEqual([
      { id: "potato", name: "Potato", qty: "2" },
      { id: "paneer", name: "Paneer", qty: "200 গ্রাম" },
    ]);
  });

  it("finds timers in Bengali step text", () => {
    expect(detectTimers("ঢাকা দিয়ে ১০ মিনিট রান্না করুন।").map((t) => t.seconds)).toEqual([600]);
    expect(detectTimers("৫ থেকে ৭ মিনিটের জন্য ভাজুন")[0]).toMatchObject({
      seconds: 300,
      maxSeconds: 420,
    });
    expect(detectTimers("১ ঘণ্টা আর ১৫ মিনিট ফোটান")[0].seconds).toBe(4500);
    expect(detectTimers("আধ ঘণ্টা ভিজিয়ে রাখুন")[0].seconds).toBe(1800);
  });

  it("understands Bengali Cook Mode voice commands", () => {
    expect(parseVoiceCommand("পরের")).toBe("next");
    expect(parseVoiceCommand("আগেরটা")).toBe("back");
    expect(parseVoiceCommand("আবার বলো")).toBe("repeat");
    expect(parseVoiceCommand("কত সময় বাকি")).toBe("timeLeft");
    expect(parseVoiceCommand("পরের ধাপ কী")).toBe("whatsNext");
    expect(parseVoiceCommand("টাইমার বন্ধ করো")).toBe("stopTimer");
    expect(parseVoiceCommand("সাহায্য")).toBe("help");
    expect(intent("৫ মিনিটের টাইমার")).toEqual({ type: "timer", seconds: 300 });
    expect(intent("পাঁচ মিনিটের টাইমার চালাও")).toEqual({ type: "timer", seconds: 300 });
    expect(intent("ধাপ ৩-এ যাও")).toEqual({ type: "goTo", step: 3 });
  });

  it("asks the AI for Bengali, checks the script, and listens in bn-IN", () => {
    expect(SYSTEM_PROMPT).toContain('"bn" = Bengali (Bangla) in Bengali script');
    expect(GenerateRequestSchema.shape.locale.options).toContain("bn");
    const bengali = {
      ...FIXTURES[0],
      locale: "bn" as const,
      title: "পালং পনির ভুর্জি",
      tagline: "ঝটপট আর সুস্বাদু।",
      missing_summary: null,
      steps: FIXTURES[0].steps.map((s) => ({ ...s, text: "পালং ধুয়ে কেটে নিন।" })),
    };
    expect(languageIssues([bengali], "bn")).toEqual([]);
    expect(languageIssues([{ ...bengali, tagline: "Quick and tasty." }], "bn")).toEqual([
      "- recipes.0.tagline: write it in Bengali (Bengali script)",
    ]);
    // Hindi text is not Bengali
    expect(languageIssues([{ ...bengali, title: "पालक पनीर" }], "bn")).toHaveLength(1);
    expect(SPEECH_LANG.bn).toBe("bn-IN");
    expect(LOADING_LINES.bn).toHaveLength(LOADING_LINES.en.length);
    expect(DRINK_LOADING_LINES.bn).toHaveLength(DRINK_LOADING_LINES.en.length);
  });
});
