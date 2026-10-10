import * as THREE from "three";

/**
 * Shared, mutable cook state for the Cook sequence (docs/03 §6.3). The director
 * (useCookSequence) writes it with GSAP; the pot, ingredients, steam and cards read it every
 * frame, so the animation never goes through React renders.
 */

/** Pot animation channels, all 0..1. */
export const pot = {
  /** 0 = lid on, 1 = hinged fully back */
  lid: 0,
  /** liquid surface rise as ingredients go in */
  liquid: 0,
  /** bubble intensity (the thinking loop) */
  bubbles: 0,
  /** extra flame on top of the idle simmer */
  flame: 0,
};

/** Where hopping ingredients land: just inside the pot rim (world space, metres). */
export const POT_MOUTH = new THREE.Vector3(1.02, 0.2, -0.05);

/**
 * Drinks are mixed in a tall glass instead of the pot: front-left of the stove, outside the
 * ingredient drop zone and clear of the props.
 */
export const GLASS_POSITION: [number, number, number] = [0.74, 0.008, 0.33]; // on the linen towel
export const GLASS_HEIGHT = 0.17;
export const GLASS_MOUTH = new THREE.Vector3(
  GLASS_POSITION[0],
  GLASS_POSITION[1] + GLASS_HEIGHT + 0.02,
  GLASS_POSITION[2],
);

export type Vessel = "pot" | "glass";

/** Glass animation channels, all 0..1 (written by the director with GSAP, read every frame). */
export const glass = {
  /** 0 = hidden (scaled to nothing), 1 = standing on the counter */
  show: 0,
  /** how full it is */
  liquid: 0,
  /** fizz and swirl while the AI thinks */
  fizz: 0,
  /** the straw, once the drink is ready */
  straw: 0,
};

export const HOP_SECONDS = 0.6;
export const HOP_STAGGER = 0.06;
export const HOP_PEAK = 0.5;

/**
 * "Ingredient rain" (docs/01 F2): when several items arrive at once (a fridge scan, a spoken or
 * pasted list) they drop one after another instead of all in the same frame.
 */
export const RAIN_STAGGER = 0.14;

/** Drop delays (seconds) for items arriving together; the first lands right away. */
export function rainDelays(newKeys: string[], stagger = RAIN_STAGGER): Map<string, number> {
  return new Map(newKeys.length < 2 ? [] : newKeys.map((k, i) => [k, i * stagger]));
}

/**
 * Hop schedule. `startAt` is the scene clock time the first hop begins (-1 = none); each
 * ingredient's delay is its rank by distance to the pot × HOP_STAGGER. `popGeneration` increases
 * on "Start over", which makes everything in the pot pop back out onto the counter. `keys` are
 * the ingredients being cooked: one that mounts late (physics still loading when Cook was
 * pressed) joins the end of the queue instead of being left on the counter.
 */
export const cook = {
  startAt: -1,
  rank: new Map<string, number>(),
  keys: new Set<string>(),
  popGeneration: 0,
  /** What is being used: the pot (food) or the glass (drinks). */
  vessel: "pot" as Vessel,
  /** Its mouth: where ingredients hop, splashes fly, cards rise and the camera focuses. */
  target: POT_MOUTH.clone(),
};

/** Point the cook sequence at the pot or the glass. */
export function setVessel(vessel: Vessel) {
  cook.vessel = vessel;
  cook.target.copy(vessel === "glass" ? GLASS_MOUTH : POT_MOUTH);
}

/**
 * Last known position of each ingredient (and whether it is in the pot), kept after unmount so a
 * removed item's puff-away copy appears where it was (or not at all if it was in the pot).
 */
export const lastSeen = new Map<string, { x: number; y: number; z: number; inPot: boolean }>();

/** Live ingredient positions, registered by Ingredient3D so the director can rank them. */
export const bodies = new Map<string, () => { x: number; y: number; z: number }>();

/** Rank ingredients by distance to the pot, nearest first (docs/03 §6.3 step 2). */
export function hopRanks(
  positions: Iterable<[string, { x: number; z: number }]>,
  pot: { x: number; z: number } = POT_MOUTH,
): Map<string, number> {
  const sorted = [...positions].sort(
    ([, a], [, b]) => Math.hypot(a.x - pot.x, a.z - pot.z) - Math.hypot(b.x - pot.x, b.z - pot.z),
  );
  return new Map(sorted.map(([key], i) => [key, i]));
}

type V3 = { x: number; y: number; z: number };

/**
 * Point on a quadratic bezier arc from `from` to `to` whose apex sits `peak` metres above the
 * higher end. `u` in 0..1.
 */
export function arcPoint(from: V3, to: V3, peak: number, u: number, out = new THREE.Vector3()) {
  const apex = Math.max(from.y, to.y) + peak;
  // Quadratic bezier at u = 0.5 is ¼p0 + ½c + ¼p2, so solve for the control point's height.
  const cx = (from.x + to.x) / 2;
  const cy = 2 * apex - (from.y + to.y) / 2;
  const cz = (from.z + to.z) / 2;
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const c = u * u;
  return out.set(
    a * from.x + b * cx + c * to.x,
    a * from.y + b * cy + c * to.y,
    a * from.z + b * cz + c * to.z,
  );
}

/** Initial velocity that carries a body from `from` to `to` in `seconds` under gravity `g`. */
export function launchVelocity(from: V3, to: V3, seconds: number, g = 9.81) {
  return {
    x: (to.x - from.x) / seconds,
    y: (to.y - from.y + 0.5 * g * seconds * seconds) / seconds,
    z: (to.z - from.z) / seconds,
  };
}

/** Steam density for a cook phase; while cooking it follows the SSE progress (docs/03 §6.4). */
export function steamFor(phase: string, progress: number): number {
  switch (phase) {
    case "cooking":
      return 0.35 + 0.65 * Math.min(1, Math.max(0, progress));
    case "revealing":
      return 1.2;
    case "results":
    case "recipe":
      return 0.5;
    case "error":
      return 0.45;
    default:
      return 0.2;
  }
}

/** Fan-out slots for the recipe cards above the pot: [x offset, y, z offset, roll]. */
export function cardFan(count: number): [number, number, number, number][] {
  const spread = 0.26;
  return Array.from({ length: count }, (_, i) => {
    const k = count === 1 ? 0 : i - (count - 1) / 2;
    return [k * spread, 0.45 - Math.abs(k) * 0.03, Math.abs(k) * -0.04, -k * 0.09];
  });
}

export type PotLook = {
  lid: number;
  bubbles: number;
  flame: number;
  liquid: number;
  steam: number;
};

/**
 * Cook Mode backgrounds (docs/03 §6.8): how the pot looks while a step of each action is on
 * screen. Boiling bubbles hard under steam, frying runs the flame high, resting is calm and
 * covered. Board actions (chop, grind, plate) leave a gentle simmer behind.
 */
export function potLookFor(action: string): PotLook {
  const simmer = { lid: 1, bubbles: 0.2, flame: 0.3, liquid: 0.7, steam: 0.4 };
  switch (action) {
    case "boil":
      return { lid: 1, bubbles: 0.95, flame: 0.75, liquid: 0.8, steam: 1 };
    case "fry":
      return { lid: 1, bubbles: 0.55, flame: 0.9, liquid: 0.5, steam: 0.6 };
    case "stir":
    case "mix":
      return { lid: 1, bubbles: 0.4, flame: 0.5, liquid: 0.7, steam: 0.55 };
    case "rest":
      return { lid: 0, bubbles: 0.08, flame: 0.05, liquid: 0.7, steam: 0.3 };
    case "bake":
      return { ...simmer, flame: 0.6 };
    default:
      return simmer;
  }
}
