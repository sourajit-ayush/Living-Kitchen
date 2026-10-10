import { describe, expect, it } from "vitest";
import {
  assignSlots,
  DROP_ZONE,
  hashString,
  MAX_ON_COUNTER,
  poissonSlots,
} from "@/components/scene/placement";
import {
  initialTier,
  learnedTierFor,
  rememberTier,
  stepDown,
  type Environment,
} from "@/components/scene/quality";

describe("poissonSlots", () => {
  const slots = poissonSlots();

  it("produces the full 24 slots inside the drop zone", () => {
    expect(slots).toHaveLength(MAX_ON_COUNTER);
    for (const [x, z] of slots) {
      expect(Math.abs(x - DROP_ZONE.centerX)).toBeLessThanOrEqual(DROP_ZONE.width / 2);
      expect(Math.abs(z - DROP_ZONE.centerZ)).toBeLessThanOrEqual(DROP_ZONE.depth / 2);
    }
  });

  it("keeps every pair at least the minimum distance apart (no awkward stacking)", () => {
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        expect(
          Math.hypot(slots[i][0] - slots[j][0], slots[i][1] - slots[j][1]),
        ).toBeGreaterThanOrEqual(0.12);
      }
    }
  });

  it("is deterministic and fills centre-out", () => {
    expect(poissonSlots()).toEqual(slots);
    const d = (s: number[]) => Math.hypot(s[0] - DROP_ZONE.centerX, s[1] - DROP_ZONE.centerZ);
    expect(d(slots[0])).toBeLessThan(d(slots[slots.length - 1]));
  });
});

describe("assignSlots", () => {
  it("gives new keys the lowest free slots and keeps existing ones in place", () => {
    const a = assignSlots(["egg", "milk", "rice"], new Map(), 24);
    expect([...a]).toEqual([
      ["egg", 0],
      ["milk", 1],
      ["rice", 2],
    ]);

    const b = assignSlots(["egg", "rice", "salt"], a, 24); // milk removed, salt added
    expect(b.get("egg")).toBe(0);
    expect(b.get("rice")).toBe(2);
    expect(b.get("salt")).toBe(1); // reuses milk's slot
  });

  it("leaves overflow keys unassigned (they go to the basket)", () => {
    const m = assignSlots(["a", "b", "c", "d"], new Map(), 2);
    expect(m.size).toBe(2);
    expect(m.has("c")).toBe(false);
  });

  it("re-packs when the capacity shrinks (quality step-down)", () => {
    const m = assignSlots(
      ["a", "b", "c"],
      new Map([
        ["a", 0],
        ["b", 5],
        ["c", 1],
      ]),
      3,
    );
    expect(m.get("a")).toBe(0);
    expect(m.get("c")).toBe(1);
    expect(m.get("b")).toBe(2);
  });
});

describe("hashString", () => {
  it("is stable and spreads values", () => {
    expect(hashString("tomato")).toBe(hashString("tomato"));
    expect(hashString("tomato")).not.toBe(hashString("potato"));
  });
});

describe("quality tiers", () => {
  const env = (over: Partial<Environment> = {}): Environment => ({
    no3dParam: false,
    webgl: true,
    softwareGl: false,
    integratedGpu: false,
    desktop: true,
    cores: 8,
    saveData: false,
    ...over,
  });

  it("starts high on capable desktops and medium elsewhere", () => {
    expect(initialTier("auto", env())).toBe("high");
    expect(initialTier("auto", env({ desktop: false }))).toBe("medium");
    expect(initialTier("auto", env({ cores: 4 }))).toBe("medium");
  });

  it("starts integrated laptop GPUs at medium (full post-processing is too heavy)", () => {
    expect(initialTier("auto", env({ integratedGpu: true }))).toBe("medium");
    expect(initialTier("high", env({ integratedGpu: true }))).toBe("high"); // the user's choice wins
  });

  it("goes low on data-saver or low-memory devices", () => {
    expect(initialTier("auto", env({ saveData: true }))).toBe("low");
    expect(initialTier("auto", env({ memoryGb: 2 }))).toBe("low");
  });

  it("is off for ?no3d=1, no WebGL, or the user's Off setting", () => {
    expect(initialTier("auto", env({ no3dParam: true }))).toBe("off");
    expect(initialTier("high", env({ webgl: false }))).toBe("off");
    expect(initialTier("off", env())).toBe("off");
  });

  it("shows the poster on software-rendered WebGL unless the user picked a tier", () => {
    expect(initialTier("auto", env({ softwareGl: true }))).toBe("off");
    expect(initialTier("medium", env({ softwareGl: true }))).toBe("medium");
  });

  it("respects a manual setting", () => {
    expect(initialTier("low", env())).toBe("low");
  });

  it("starts where this GPU settled last time, but never above its first guess", () => {
    expect(initialTier("auto", env({ integratedGpu: true, learnedTier: "low" }))).toBe("low");
    expect(initialTier("auto", env({ learnedTier: "medium" }))).toBe("medium");
    expect(initialTier("auto", env({ desktop: false, learnedTier: "medium" }))).toBe("medium");
    expect(initialTier("high", env({ learnedTier: "low" }))).toBe("high"); // the user's choice wins
    expect(initialTier("auto", env({ softwareGl: true, learnedTier: "low" }))).toBe("off");
  });

  it("remembers the step-down per GPU", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    expect(learnedTierFor("Intel UHD", storage)).toBeUndefined();
    rememberTier("low", storage, "Intel UHD");
    expect(learnedTierFor("Intel UHD", storage)).toBe("low");
    expect(learnedTierFor("RTX 4050", storage)).toBeUndefined(); // another GPU starts fresh
    store.set("lk-tier-learned", "{not json");
    expect(learnedTierFor("Intel UHD", storage)).toBeUndefined();
  });

  it("steps down but never below low", () => {
    expect(stepDown("high")).toBe("medium");
    expect(stepDown("medium")).toBe("low");
    expect(stepDown("low")).toBe("low");
  });
});

describe("stickyNo3d", () => {
  const store = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };

  it("remembers ?no3d=1 for the session and clears it with ?no3d=0", async () => {
    const { stickyNo3d } = await import("@/components/scene/quality");
    const s = store();
    expect(stickyNo3d(null, s)).toBe(false);
    expect(stickyNo3d("1", s)).toBe(true);
    expect(stickyNo3d(null, s)).toBe(true); // a link without the query keeps 2D
    expect(stickyNo3d("0", s)).toBe(false);
    expect(stickyNo3d(null, s)).toBe(false);
  });
});

describe("mergeParts", () => {
  it("bakes transforms and per-part vertex colours into one geometry", async () => {
    const THREE = await import("three");
    const { mergeParts } = await import("@/components/scene/merge");
    const box = new THREE.BoxGeometry(1, 1, 1); // indexed
    const ico = new THREE.IcosahedronGeometry(0.5, 0); // non-indexed
    const merged = mergeParts([
      { geometry: box, position: [10, 0, 0], color: "#ff0000" },
      { geometry: ico, scale: [2, 2, 2], color: "#0000ff" },
    ]);
    expect(merged.index).toBeNull();
    const count = merged.attributes.position.count;
    expect(count).toBe(36 + ico.attributes.position.count);
    // First vertex comes from the red box moved to x≈10; last from the blue icosahedron.
    expect(merged.attributes.position.getX(0)).toBeGreaterThan(9);
    expect(merged.attributes.color.getX(0)).toBeCloseTo(1);
    expect(merged.attributes.color.getZ(count - 1)).toBeCloseTo(1);
    // Inputs are left untouched (they are shared across parts).
    expect(box.index).not.toBeNull();
  });
});

describe("shadow gate", () => {
  it("re-renders shadows only for the frames something asked for", async () => {
    const { consumeShadowsDirty, markShadowsDirty } = await import("@/components/scene/shadowGate");
    while (consumeShadowsDirty()); // drain the module's start-up state
    expect(consumeShadowsDirty()).toBe(false);
    markShadowsDirty(2);
    markShadowsDirty(1); // a shorter request never cuts a longer one short
    expect([consumeShadowsDirty(), consumeShadowsDirty(), consumeShadowsDirty()]).toEqual([
      true,
      true,
      false,
    ]);
  });
});
