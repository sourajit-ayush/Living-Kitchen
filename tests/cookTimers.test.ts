import { beforeEach, describe, expect, it } from "vitest";
import { remainingMs, timerId, useTimers } from "@/store/useTimers";

const T0 = 1_000_000;
const spec = (stepN: number, minutes: number) => ({
  id: timerId("dal", stepN, 0),
  recipeId: "dal",
  stepN,
  label: `${minutes} minutes`,
  durationMs: minutes * 60_000,
});
const get = (id: string) => useTimers.getState().timers.find((t) => t.id === id)!;

beforeEach(() => useTimers.setState({ timers: [] }));

describe("cook timers", () => {
  it("run several at once, each from its own start time", () => {
    const { start } = useTimers.getState();
    start(spec(1, 10), T0);
    start(spec(3, 2), T0 + 60_000);
    expect(remainingMs(get("dal:1:0"), T0 + 120_000)).toBe(8 * 60_000);
    expect(remainingMs(get("dal:3:0"), T0 + 120_000)).toBe(60_000);
  });

  it("pause and resume without losing time", () => {
    const { start, pause, resume } = useTimers.getState();
    start(spec(1, 5), T0);
    pause("dal:1:0", T0 + 60_000);
    // time passing while paused doesn't count
    expect(remainingMs(get("dal:1:0"), T0 + 10 * 60_000)).toBe(4 * 60_000);
    resume("dal:1:0", T0 + 10 * 60_000);
    expect(remainingMs(get("dal:1:0"), T0 + 11 * 60_000)).toBe(3 * 60_000);
  });

  it("tick reports each timer once, when it runs out", () => {
    const { start, tick } = useTimers.getState();
    start(spec(1, 1), T0);
    start(spec(2, 3), T0);
    expect(tick(T0 + 59_000)).toEqual([]);
    expect(tick(T0 + 61_000).map((t) => t.id)).toEqual(["dal:1:0"]);
    expect(tick(T0 + 62_000)).toEqual([]); // already done
    expect(get("dal:1:0").status).toBe("done");
    expect(get("dal:2:0").status).toBe("running");
  });

  it("can add time, which restarts a finished timer", () => {
    const { start, tick, extend } = useTimers.getState();
    start(spec(1, 1), T0);
    tick(T0 + 61_000);
    extend("dal:1:0", 30_000, T0 + 70_000);
    expect(get("dal:1:0").status).toBe("running");
    expect(remainingMs(get("dal:1:0"), T0 + 80_000)).toBe(20_000);
  });

  it("restarting a step's timer replaces it rather than duplicating it", () => {
    const { start, dismiss } = useTimers.getState();
    start(spec(1, 1), T0);
    start(spec(1, 1), T0 + 30_000);
    expect(useTimers.getState().timers).toHaveLength(1);
    dismiss("dal:1:0");
    expect(useTimers.getState().timers).toHaveLength(0);
  });
});
