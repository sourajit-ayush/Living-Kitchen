import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ai/mock";
import type { GenerateEvent } from "@/lib/ai/events";

const streamGenerate = vi.fn();
vi.mock("@/lib/sseClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sseClient")>()),
  streamGenerate: (...args: unknown[]) => streamGenerate(...args),
}));

const { useKitchen } = await import("@/store/useKitchen");

/** Fake API: immediately streams the 3 fixtures. */
function respondWithFixtures() {
  streamGenerate.mockImplementation(async (_body: unknown, onEvent: (e: GenerateEvent) => void) => {
    FIXTURES.forEach((recipe, index) => onEvent({ type: "recipe", index, recipe }));
    onEvent({ type: "done" });
  });
}

const locales = () => streamGenerate.mock.calls.map((c) => (c[0] as { locale: string }).locale);

beforeEach(() => {
  streamGenerate.mockReset();
  useKitchen.setState({
    phase: "idle",
    results: [],
    requestLocale: null,
    selectedId: null,
    error: null,
  });
  useKitchen.getState().clearIngredients();
  useKitchen.getState().addText("spinach, paneer");
});

describe("syncLocale", () => {
  it("re-cooks showing results in the new language", async () => {
    respondWithFixtures();
    await useKitchen.getState().cook("en");
    expect(useKitchen.getState()).toMatchObject({ phase: "results", requestLocale: "en" });

    useKitchen.getState().syncLocale("hi");
    expect(useKitchen.getState()).toMatchObject({ phase: "cooking", requestLocale: "hi" });
    await vi.waitFor(() => expect(useKitchen.getState().phase).toBe("results"));
    expect(locales()).toEqual(["en", "hi"]);
  });

  it("re-cooks from an open recipe too", async () => {
    respondWithFixtures();
    await useKitchen.getState().cook("en");
    useKitchen.getState().select(FIXTURES[0].id);
    useKitchen.getState().syncLocale("hi");
    expect(useKitchen.getState().requestLocale).toBe("hi");
    expect(locales()).toEqual(["en", "hi"]);
  });

  it("is a no-op when the language did not change (e.g. strict-mode double effects)", async () => {
    respondWithFixtures();
    await useKitchen.getState().cook("en");
    useKitchen.getState().syncLocale("en");
    useKitchen.getState().syncLocale("en");
    expect(locales()).toEqual(["en"]);
  });

  it("does nothing on an idle counter or an error screen", () => {
    useKitchen.getState().syncLocale("hi");
    useKitchen.setState({ phase: "error", requestLocale: "en" });
    useKitchen.getState().syncLocale("hi");
    expect(streamGenerate).not.toHaveBeenCalled();
  });

  it("does not exclude the previous titles (same dishes, new language)", async () => {
    respondWithFixtures();
    await useKitchen.getState().cook("en");
    useKitchen.getState().syncLocale("hi");
    expect((streamGenerate.mock.calls[1][0] as { exclude: string[] }).exclude).toEqual([]);
  });

  it("start over forgets the language so switching later does nothing", async () => {
    respondWithFixtures();
    await useKitchen.getState().cook("en");
    useKitchen.getState().startOver();
    useKitchen.getState().syncLocale("hi");
    expect(locales()).toEqual(["en"]);
  });
});
