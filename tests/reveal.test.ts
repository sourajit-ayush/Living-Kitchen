import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ai/mock";
import type { GenerateEvent } from "@/lib/ai/events";

const streamGenerate = vi.fn();
vi.mock("@/lib/sseClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sseClient")>()),
  streamGenerate: (...args: unknown[]) => streamGenerate(...args),
}));

const { useKitchen } = await import("@/store/useKitchen");
const { useScene } = await import("@/store/useScene");

beforeEach(() => {
  streamGenerate.mockReset();
  streamGenerate.mockImplementation(async (_b: unknown, onEvent: (e: GenerateEvent) => void) => {
    FIXTURES.forEach((recipe, index) => onEvent({ type: "recipe", index, recipe }));
    onEvent({ type: "done" });
  });
  useKitchen.setState({ phase: "idle", results: [], selectedId: null, error: null });
  useKitchen.getState().clearIngredients();
  useKitchen.getState().addText("spinach, paneer");
});

afterEach(() => {
  vi.useRealTimers();
  useScene.getState().setReveal3d(false);
});

describe("recipe reveal hand-off", () => {
  it("goes straight to results without live 3D cards (no3d, reduced motion, low-end)", async () => {
    await useKitchen.getState().cook("en");
    expect(useKitchen.getState().phase).toBe("results");
  });

  it("lets the 3D cards rise first, then the scene hands over to the results panel", async () => {
    useScene.getState().setReveal3d(true);
    await useKitchen.getState().cook("en");
    expect(useKitchen.getState()).toMatchObject({ phase: "revealing", progress: 1 });
    expect(useKitchen.getState().results).toHaveLength(3);
    useKitchen.getState().finishReveal();
    expect(useKitchen.getState().phase).toBe("results");
  });

  it("never gets stuck revealing if the scene doesn't finish (paused or off-screen canvas)", async () => {
    vi.useFakeTimers();
    useScene.getState().setReveal3d(true);
    await useKitchen.getState().cook("en");
    expect(useKitchen.getState().phase).toBe("revealing");
    vi.advanceTimersByTime(4000);
    expect(useKitchen.getState().phase).toBe("results");
  });

  it("finishReveal is a no-op outside the reveal", async () => {
    await useKitchen.getState().cook("en");
    useKitchen.getState().select(FIXTURES[0].id);
    useKitchen.getState().finishReveal();
    expect(useKitchen.getState().phase).toBe("recipe");
  });
});
