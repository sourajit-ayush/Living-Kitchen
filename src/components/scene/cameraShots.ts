/**
 * Camera shots (docs/03 §5). Each shot has a desktop and a mobile framing: on mobile the canvas is
 * only the top ~45% of the screen (roughly square), so shots pull back and widen the FOV.
 */

export type Pose = {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
};
export type Layout = "desktop" | "mobile";
export type ShotName =
  | "intro"
  | "counter"
  | "counterLeft"
  | "stove"
  | "stoveLeft"
  | "reveal"
  | "cookPot"
  | "cookBoard"
  | "surprise"
  | "pantry"
  | "book"
  | "glass"
  | "glassLeft"
  | "glassReveal"
  | "cookGlass";

/**
 * The drinks glass stands this far from the pot mouth (GLASS_MOUTH − POT_MOUTH in cookSignals;
 * kept as numbers so this file stays free of three.js, and checked by a unit test). Its shots
 * are the pot's shots moved by this offset, so they frame the glass exactly as the pot.
 */
export const GLASS_OFFSET: [number, number, number] = [-0.28, -0.002, 0.38];

const add = (a: [number, number, number]): [number, number, number] => [
  a[0] + GLASS_OFFSET[0],
  a[1] + GLASS_OFFSET[1],
  a[2] + GLASS_OFFSET[2],
];
const atGlass = (shot: Record<Layout, Pose>): Record<Layout, Pose> => ({
  desktop: {
    ...shot.desktop,
    position: add(shot.desktop.position),
    target: add(shot.desktop.target),
  },
  mobile: { ...shot.mobile, position: add(shot.mobile.position), target: add(shot.mobile.target) },
});

const POT_SHOTS: Record<
  Exclude<ShotName, "glass" | "glassLeft" | "glassReveal" | "cookGlass">,
  Record<Layout, Pose>
> = {
  /** Wide view from the window side; the intro dollies from here to `counter`. */
  intro: {
    desktop: { position: [-1.5, 1.45, 2.3], target: [-0.75, 0.75, -0.45], fov: 40 },
    mobile: { position: [-1.3, 1.6, 2.7], target: [-0.7, 0.75, -0.45], fov: 48 },
  },
  /** 3/4 view over the counter, drop zone centred above the bottom dock. */
  counter: {
    desktop: { position: [0.12, 1.75, 2.35], target: [0.08, -0.42, -0.12], fov: 40 },
    mobile: { position: [0.12, 1.55, 2.25], target: [0.08, 0.02, -0.08], fov: 46 },
  },
  /** Results panel open on the right: reframe so the counter sits in the left part of the screen. */
  counterLeft: {
    desktop: { position: [0.72, 1.75, 2.35], target: [0.68, -0.42, -0.12], fov: 40 },
    mobile: { position: [0.12, 1.55, 2.25], target: [0.08, 0.02, -0.08], fov: 46 },
  },
  /**
   * On "Cook": a push-in toward the pot, slightly above, lid in view, centred: the UI steps aside
   * while the pot bubbles (only a small status pill stays, at the bottom).
   */
  stove: {
    desktop: { position: [1.2, 1.02, 1.36], target: [1.02, 0.1, -0.06], fov: 40 },
    mobile: { position: [1.05, 0.78, 0.9], target: [1.02, 0.14, -0.05], fov: 46 },
  },
  /**
   * My Pantry: the wall shelf behind the counter. Desktop frames it left of centre, clear of the
   * page panel on the right; phones show it in the top of the screen.
   */
  pantry: {
    desktop: { position: [0.42, 0.58, 1.12], target: [0.36, 0.26, -0.4], fov: 40 },
    mobile: { position: [0.0, 0.6, 1.2], target: [0.0, 0.3, -0.4], fov: 46 },
  },
  /** Recipe Book: looking down at the book open on the cutting board, left of the page panel. */
  book: {
    desktop: { position: [-0.62, 0.92, 0.82], target: [-0.6, 0.0, 0.02], fov: 40 },
    mobile: { position: [-0.95, 0.86, 0.66], target: [-0.95, 0.02, 0.07], fov: 46 },
  },
  /** A boil-over (error): the full panel is back on the right, so the pot sits left of centre. */
  stoveLeft: {
    desktop: { position: [1.62, 0.78, 0.98], target: [1.322, -0.011, -0.082], fov: 40 },
    mobile: { position: [1.05, 0.78, 0.9], target: [1.02, 0.14, -0.05], fov: 46 },
  },
  /**
   * Cook Mode backgrounds (docs/03 §6.8), centred behind the step text and blurred. Mobile is the
   * full portrait screen here, hence the wider FOV.
   */
  cookPot: {
    desktop: { position: [1.5, 0.82, 0.95], target: [1.02, 0.14, -0.05], fov: 40 },
    mobile: { position: [1.22, 1.0, 1.15], target: [1.02, 0.12, -0.05], fov: 58 },
  },
  cookBoard: {
    desktop: { position: [-0.55, 0.92, 0.9], target: [-0.95, 0.02, 0.06], fov: 40 },
    mobile: { position: [-0.82, 1.1, 1.0], target: [-0.95, 0.02, 0.06], fov: 58 },
  },
  /**
   * Surprise Me (docs/03 §6.6): steep over the lazy-susan so the plates read. The dock steps aside
   * while it spins, so the wheel sits near the centre (left of the ideas card on desktop).
   */
  surprise: {
    desktop: { position: [0.05, 1.62, 1.38], target: [0.05, 0.08, 0.2], fov: 40 },
    mobile: { position: [0.06, 1.12, 1.3], target: [0.05, 0.08, 0.16], fov: 46 },
  },
  /** Recipe ready: pull back and tilt up to follow the cards rising out of the steam. */
  reveal: {
    desktop: { position: [1.95, 1.1, 2.3], target: [1.605, 0.136, -0.086], fov: 40 },
    mobile: { position: [1.05, 0.88, 1.6], target: [1.02, 0.5, -0.05], fov: 50 },
  },
};

export const SHOTS: Record<ShotName, Record<Layout, Pose>> = {
  ...POT_SHOTS,
  /** Drinks: the same push-in, error and reveal framings, centred on the glass. */
  glass: atGlass(POT_SHOTS.stove),
  glassLeft: atGlass(POT_SHOTS.stoveLeft),
  glassReveal: atGlass(POT_SHOTS.reveal),
  cookGlass: atGlass(POT_SHOTS.cookPot),
};

export const INTRO_SECONDS = 6;
export const SHOT_SECONDS = 1.2;

/** Idle "breathing" sway, ±0.5° (docs/03 §5), from summed sines (cheap smooth noise). */
export function swayAngles(t: number): { yaw: number; pitch: number } {
  const deg = Math.PI / 180;
  return {
    yaw: (Math.sin(t * 0.31) * 0.6 + Math.sin(t * 0.17 + 1.1) * 0.4) * 0.5 * deg,
    pitch: (Math.sin(t * 0.23 + 0.4) * 0.6 + Math.sin(t * 0.13) * 0.4) * 0.5 * deg,
  };
}

/** Pointer parallax: pointer in -1..1 → up to ±2° tilt. */
export const PARALLAX_DEG = 2;

/**
 * The shot for a kitchen phase (docs/03 §5): counter while adding, stove while cooking (and when
 * the pot boils over), reveal once recipes rise. Reduced motion never moves the camera beyond the
 * counter framing.
 */
export function shotFor(
  phase: string,
  layout: Layout,
  reducedMotion: boolean,
  /** Cook Mode: the current step's action (chopping happens at the board, the rest at the pot) */
  cookAction: string | null = null,
  /** The Surprise Me wheel is up (only from the idle counter) */
  surprise = false,
  /** The pantry or book page is showing */
  page: "pantry" | "book" | null = null,
  /** Drinks are made in the glass (Cook Mode: only for the steps acted out there) */
  vessel: "pot" | "glass" = "pot",
): ShotName {
  if (page) return page;
  if (cookAction) {
    if (vessel === "glass" && cookAction !== "chop") return "cookGlass";
    return cookAction === "chop" || cookAction === "grind" || cookAction === "plate"
      ? "cookBoard"
      : "cookPot";
  }
  const glassy = vessel === "glass";
  const panelOpen = phase !== "idle";
  const counter = panelOpen && layout === "desktop" ? "counterLeft" : "counter";
  if (reducedMotion) return counter;
  if (surprise && phase === "idle") return "surprise";
  switch (phase) {
    case "cooking":
      return glassy ? "glass" : "stove";
    case "error":
      return glassy ? "glassLeft" : "stoveLeft";
    case "revealing":
    case "results":
    case "recipe":
      return glassy ? "glassReveal" : "reveal";
    default:
      return counter;
  }
}
