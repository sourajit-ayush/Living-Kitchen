import { describe, expect, it } from "vitest";
import { detectTimers, formatClock, stepTimers } from "@/lib/timers";

const secs = (text: string) => detectTimers(text).map((t) => t.seconds);

describe("detectTimers", () => {
  it("finds minutes, seconds and hours in English", () => {
    expect(secs("Simmer for 10 minutes.")).toEqual([600]);
    expect(secs("Blanch for 2 min, then drain")).toEqual([120]);
    expect(secs("Rest the dough 1 hour")).toEqual([3600]);
    expect(secs("Bake for 45 mins")).toEqual([2700]);
    expect(secs("Stir in the garlic for 30 seconds")).toEqual([30]);
  });

  it("finds every timer in a step, in order", () => {
    const text =
      "Stir in the garlic for 30 seconds, then add the tomato. Cook until soft, about 3 minutes.";
    const timers = detectTimers(text);
    expect(timers.map((t) => t.seconds)).toEqual([30, 180]);
    // offsets point at the matched words (used for inline chips)
    expect(text.slice(timers[0].start, timers[0].end)).toBe("30 seconds");
    expect(text.slice(timers[1].start, timers[1].end)).toBe("3 minutes");
  });

  it("starts ranges at the lower bound and remembers the upper", () => {
    const [t] = detectTimers("Simmer 8–10 minutes until thick");
    expect(t).toMatchObject({ seconds: 480, maxSeconds: 600, label: "8–10 minutes" });
    expect(secs("cook 5-7 min")).toEqual([300]);
    expect(secs("roast 20 to 25 minutes")).toEqual([1200]);
    expect(secs("2 or 3 minutes per side")).toEqual([120]);
  });

  it("understands fractions, words and compound durations", () => {
    expect(secs("braise for 1½ hours")).toEqual([5400]);
    expect(secs("leave for half an hour")).toEqual([1800]);
    expect(secs("knead for ten minutes")).toEqual([600]);
    expect(secs("a minute more")).toEqual([60]);
    expect(secs("slow-cook 1 hr 15 min")).toEqual([4500]);
    expect(secs("1 hour and 30 minutes")).toEqual([5400]);
  });

  it("works in Hindi and Hinglish, including Devanagari digits", () => {
    expect(secs("धीमी आंच पर 10 मिनट पकाएँ")).toEqual([600]);
    expect(secs("५ मिनट तक भूनें")).toEqual([300]);
    expect(secs("1 घंटा भिगोकर रखें")).toEqual([3600]);
    expect(secs("30 सेकंड तक चलाएँ")).toEqual([30]);
    expect(secs("5-7 मिनट")).toEqual([300]);
    expect(secs("dal ko 15 min ubaalein")).toEqual([900]);
  });

  it("ignores things that are not durations", () => {
    expect(secs("Add 2 cups of water and 4 tomatoes")).toEqual([]);
    expect(secs("Roll into 4 thin rounds")).toEqual([]);
    expect(secs("Preheat to 180 degrees")).toEqual([]);
    expect(secs("the administrator minutes")).toEqual([]);
  });
});

describe("stepTimers", () => {
  it("prefers the text, falling back to the model's timer_minutes", () => {
    expect(stepTimers({ text: "Fry for 3 minutes", timer_minutes: 5 })[0].seconds).toBe(180);
    expect(stepTimers({ text: "Fry until golden", timer_minutes: 5 })[0].seconds).toBe(300);
    expect(stepTimers({ text: "Serve hot", timer_minutes: null })).toEqual([]);
  });
});

describe("formatClock", () => {
  it("formats remaining time like a kitchen timer", () => {
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(9.2)).toBe("0:10"); // rounds up: never shows 0:00 while running
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(-3)).toBe("0:00");
  });
});
