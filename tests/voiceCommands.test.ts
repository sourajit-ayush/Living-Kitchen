import { describe, expect, it } from "vitest";
import { parseVoiceCommand as cmd } from "@/lib/voiceCommands";

describe("parseVoiceCommand", () => {
  it("understands the four core commands in English", () => {
    expect(cmd("Next")).toBe("next");
    expect(cmd("next step please")).toBe("next");
    expect(cmd("go back")).toBe("back");
    expect(cmd("previous")).toBe("back");
    expect(cmd("Repeat that")).toBe("repeat");
    expect(cmd("start timer")).toBe("startTimer");
    expect(cmd("Set a timer!")).toBe("startTimer");
  });

  it("tells a timer start from a stop", () => {
    expect(cmd("stop the timer")).toBe("stopTimer");
    expect(cmd("timer")).toBe("startTimer");
  });

  it("understands Hindi and Hinglish in either script", () => {
    expect(cmd("आगे")).toBe("next");
    expect(cmd("agla")).toBe("next");
    expect(cmd("पीछे चलो")).toBe("back");
    expect(cmd("wapas")).toBe("back");
    expect(cmd("दोबारा बोलो")).toBe("repeat");
    expect(cmd("phir se")).toBe("repeat");
    expect(cmd("टाइमर शुरू करो")).toBe("startTimer");
    expect(cmd("timer roko")).toBe("stopTimer");
    expect(cmd("सामग्री दिखाओ")).toBe("ingredients");
  });

  it("uses the last command in a phrase and whole words only", () => {
    expect(cmd("next, no wait, go back")).toBe("back");
    expect(cmd("background music")).toBeNull(); // not "back"
    expect(cmd("the nextdoor neighbour")).toBeNull();
    expect(cmd("hmm")).toBeNull();
    expect(cmd("")).toBeNull();
  });
});
