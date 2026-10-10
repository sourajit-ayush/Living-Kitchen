import { describe, expect, it } from "vitest";
import { shotFor } from "@/components/scene/cameraShots";
import {
  arcPoint,
  cardFan,
  hopRanks,
  launchVelocity,
  POT_MOUTH,
  steamFor,
} from "@/components/scene/cookSignals";

describe("hop order", () => {
  it("ranks ingredients nearest the pot first", () => {
    const ranks = hopRanks([
      ["far", { x: -1.2, z: 0 }],
      ["near", { x: 0.8, z: -0.05 }],
      ["mid", { x: 0.1, z: 0.1 }],
    ]);
    expect([...ranks]).toEqual([
      ["near", 0],
      ["mid", 1],
      ["far", 2],
    ]);
  });
});

describe("hop arc", () => {
  const from = { x: -0.5, y: 0.05, z: 0.1 };

  it("starts at the counter and ends in the pot mouth", () => {
    expect(arcPoint(from, POT_MOUTH, 0.5, 0).toArray()).toEqual([from.x, from.y, from.z]);
    const end = arcPoint(from, POT_MOUTH, 0.5, 1);
    expect(end.distanceTo(POT_MOUTH)).toBeLessThan(1e-9);
  });

  it("peaks the requested height above the higher end, halfway along", () => {
    const apex = arcPoint(from, POT_MOUTH, 0.5, 0.5);
    expect(apex.y).toBeCloseTo(Math.max(from.y, POT_MOUTH.y) + 0.5, 9);
    for (const u of [0.1, 0.3, 0.7, 0.9]) {
      expect(arcPoint(from, POT_MOUTH, 0.5, u).y).toBeLessThanOrEqual(apex.y);
    }
  });
});

describe("pop-out launch", () => {
  it("lands on the target after the flight time under gravity", () => {
    const from = { x: 1.02, y: 0.33, z: -0.05 };
    const to = { x: -0.4, y: 0.06, z: 0.12 };
    const T = 0.75;
    const v = launchVelocity(from, to, T);
    const g = 9.81;
    expect(from.x + v.x * T).toBeCloseTo(to.x, 9);
    expect(from.z + v.z * T).toBeCloseTo(to.z, 9);
    expect(from.y + v.y * T - 0.5 * g * T * T).toBeCloseTo(to.y, 9);
  });
});

describe("steam density", () => {
  it("is calm when idle and follows the SSE progress while cooking", () => {
    expect(steamFor("idle", 0)).toBe(0.2);
    expect(steamFor("cooking", 0)).toBeCloseTo(0.35);
    expect(steamFor("cooking", 1)).toBeCloseTo(1);
    expect(steamFor("cooking", 0.5)).toBeGreaterThan(steamFor("cooking", 0.2));
    expect(steamFor("cooking", 7)).toBeCloseTo(1); // clamped
    expect(steamFor("revealing", 1)).toBeGreaterThan(1); // the bright burst as cards rise
  });
});

describe("card fan", () => {
  it("is symmetric around the pot, with the centre card highest and outer cards rolled outward", () => {
    const [left, centre, right] = cardFan(3);
    expect(centre[0]).toBe(0);
    expect(left[0]).toBeCloseTo(-right[0]);
    expect(centre[1]).toBeGreaterThan(left[1]);
    expect(left[3]).toBeCloseTo(-right[3]);
    expect(cardFan(1)).toEqual([[0, 0.45, -0, -0]]);
  });
});

describe("camera shots", () => {
  it("follows the cook phases", () => {
    expect(shotFor("idle", "desktop", false)).toBe("counter");
    expect(shotFor("cooking", "desktop", false)).toBe("stove");
    expect(shotFor("error", "mobile", false)).toBe("stoveLeft");
    expect(shotFor("revealing", "mobile", false)).toBe("reveal");
    expect(shotFor("recipe", "desktop", false)).toBe("reveal");
  });

  it("frames each Cook Mode step where its action happens", () => {
    expect(shotFor("recipe", "desktop", false, "chop")).toBe("cookBoard");
    expect(shotFor("recipe", "mobile", false, "plate")).toBe("cookBoard");
    expect(shotFor("recipe", "desktop", false, "stir")).toBe("cookPot");
    expect(shotFor("idle", "mobile", true, "boil")).toBe("cookPot"); // reduced motion: a cut
  });

  it("never moves the camera beyond the counter framing with reduced motion", () => {
    expect(shotFor("cooking", "desktop", true)).toBe("counterLeft");
    expect(shotFor("results", "mobile", true)).toBe("counter");
    expect(shotFor("idle", "desktop", true)).toBe("counter");
  });
});

describe("Cook Mode pot looks", () => {
  it("boils hardest under steam, fries hottest, rests covered and calm", async () => {
    const { potLookFor } = await import("@/components/scene/cookSignals");
    const boil = potLookFor("boil");
    const fry = potLookFor("fry");
    const rest = potLookFor("rest");
    expect(boil.bubbles).toBeGreaterThan(fry.bubbles);
    expect(boil.steam).toBe(1);
    expect(fry.flame).toBeGreaterThan(boil.flame);
    expect(rest).toMatchObject({ lid: 0 });
    expect(rest.bubbles).toBeLessThan(0.1);
    // every look stays in the 0..1 signal range
    for (const a of [
      "chop",
      "stir",
      "fry",
      "boil",
      "bake",
      "mix",
      "rest",
      "grind",
      "plate",
      "other",
    ]) {
      for (const v of Object.values(potLookFor(a))) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of Object.values(potLookFor(a))) expect(v).toBeLessThanOrEqual(1);
    }
  });
});
