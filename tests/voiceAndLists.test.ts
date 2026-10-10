import { describe, expect, it } from "vitest";
import { INGREDIENTS_BY_ID, isLeftover, LEFTOVER_IDS } from "@/data/ingredients";
import { INGREDIENT_MODELS, modelUrl } from "@/data/ingredientModels";
import { generateCacheKey } from "@/lib/ai/cacheKey";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { GenerateRequestSchema } from "@/lib/ai/schema";
import { listAsWhatsApp, whatsappTextUrl } from "@/lib/shoppingText";
import { parseIngredients } from "@/lib/parseIngredients";
import { parseVoiceCommand, parseVoiceIntent as intent } from "@/lib/voiceCommands";
import { existsSync } from "node:fs";

describe("hands-free Cook Mode: more voice commands", () => {
  it("sets a timer of any length, in English, Hindi and Hinglish", () => {
    expect(intent("set a timer for 5 minutes")).toEqual({ type: "timer", seconds: 300 });
    expect(intent("timer for ninety seconds")).toEqual({ type: "command", command: "startTimer" });
    expect(intent("timer for 90 seconds")).toEqual({ type: "timer", seconds: 90 });
    expect(intent("five minute timer")).toEqual({ type: "timer", seconds: 300 });
    expect(intent("half a minute timer")).toEqual({ type: "timer", seconds: 30 });
    expect(intent("5 मिनट का टाइमर")).toEqual({ type: "timer", seconds: 300 });
    expect(intent("पांच मिनट का टाइमर लगाओ")).toEqual({ type: "timer", seconds: 300 });
    expect(intent("das minute ka timer")).toEqual({ type: "timer", seconds: 600 });
    expect(intent("timer for 1 hour")).toEqual({ type: "timer", seconds: 3600 });
  });

  it("jumps to a step", () => {
    expect(intent("go to step 3")).toEqual({ type: "goTo", step: 3 });
    expect(intent("step four")).toEqual({ type: "goTo", step: 4 });
    expect(intent("स्टेप 2 पर जाओ")).toEqual({ type: "goTo", step: 2 });
  });

  it("answers questions, and keeps the old commands working", () => {
    expect(parseVoiceCommand("how much time is left")).toBe("timeLeft");
    expect(parseVoiceCommand("kitna time bacha hai")).toBe("timeLeft");
    expect(parseVoiceCommand("what's next")).toBe("whatsNext");
    expect(parseVoiceCommand("आगे क्या है")).toBe("whatsNext");
    expect(parseVoiceCommand("help")).toBe("help");
    expect(intent("next")).toEqual({ type: "command", command: "next" });
    expect(intent("start timer")).toEqual({ type: "command", command: "startTimer" });
    expect(intent("stop timer")).toEqual({ type: "command", command: "stopTimer" });
    expect(intent("the onions are golden")).toBeNull();
  });
});

describe("shopping list on WhatsApp", () => {
  const items = [
    { name: "Onion", qty: "2", aisle: "produce" as const, checked: false },
    { name: "Curd", aisle: "dairy" as const, checked: false },
    { name: "Salt", aisle: "spices" as const, checked: true },
  ];
  it("groups by aisle with bold headings, and leaves ticked items out", () => {
    const text = listAsWhatsApp(items, "Shopping list", "2 items", (a) => a);
    expect(text).toBe(
      [
        "*🛒 Shopping list* (2 items)",
        "",
        "*🥬 produce*",
        "• Onion (2)",
        "",
        "*🥛 dairy*",
        "• Curd",
      ].join("\n"),
    );
    expect(whatsappTextUrl(text)).toMatch(/^https:\/\/wa\.me\/\?text=\*%F0%9F%9B%92/);
  });
});

describe("leftovers", () => {
  it("knows typed leftovers, and plain rice stays rice", () => {
    expect(parseIngredients("leftover rice, basi roti, rice").map((i) => i.id)).toEqual([
      "cooked-rice",
      "leftover-roti",
      "rice",
    ]);
    expect(LEFTOVER_IDS.every((id) => INGREDIENTS_BY_ID.has(id) && isLeftover(id))).toBe(true);
    expect(isLeftover("rice")).toBe(false);
  });

  it("tells the AI which ingredients are leftovers, and caches them apart", () => {
    const req = (leftover: boolean) =>
      GenerateRequestSchema.parse({
        ingredients: [{ name: "Leftover rice", ...(leftover ? { leftover } : {}) }],
        prefs: {
          diet: "any",
          cuisine: "any",
          maxMinutes: null,
          spice: 3,
          difficulty: "any",
          cookware: [],
          servings: 2,
          meal: "dinner",
        },
        locale: "en",
      });
    expect(buildUserPrompt(req(true))).toContain("- Leftover rice [LEFTOVER]");
    expect(SYSTEM_PROMPT).toContain("[LEFTOVER] are already cooked");
    expect(generateCacheKey(req(true), "m")).not.toBe(generateCacheKey(req(false), "m"));
  });
});

describe("real 3D ingredient models", () => {
  it("only maps real ingredients, and every model file is there", () => {
    for (const id of Object.keys(INGREDIENT_MODELS)) {
      expect(INGREDIENTS_BY_ID.has(id), id).toBe(true);
      expect(INGREDIENTS_BY_ID.get(id)!.model, id).toBe(id);
      expect(existsSync(`public${modelUrl(id)}`), id).toBe(true);
    }
    expect(existsSync("public/models/ingredients/Textures/colormap.png")).toBe(true);
    expect(modelUrl("paneer")).toBeNull(); // clay blob
  });
});
