/**
 * Surprise Me wheel maths (docs/03 §6.6), shared by the 3D lazy-susan and the DOM list so both
 * land on the same dish at the same moment. Plate i sits at angle i·step; the wheel's rotation θ
 * turns it, and the plate nearest angle 0 (the front, facing the cook) is the selected one.
 */

export const PLATES = 8;
export const STEP = (Math.PI * 2) / PLATES;
/** Spin length; the wheel decelerates the whole way (ease-out). */
export const SPIN_MS = 4200;
/** The landed dish floats for this long before cooking starts. */
export const LANDED_HOLD_MS = 1600;
/** Full turns before settling: enough to feel like a real spin. */
export const SPIN_TURNS = 3;

export type SpinPlan = { from: number; to: number; durationMs: number };

/** A spin that ends exactly with `target` at the front after at least `turns` full turns. */
export function planSpin(
  target: number,
  from = 0,
  turns = SPIN_TURNS,
  durationMs = SPIN_MS,
): SpinPlan {
  const rest = -target * STEP; // rotation at which `target` faces the front
  const base = from + turns * Math.PI * 2;
  // The smallest angle ≥ base that is ≡ rest (mod 2π).
  const k = Math.ceil((base - rest) / (Math.PI * 2));
  return { from, to: rest + k * Math.PI * 2, durationMs };
}

/** Ease-out quart: fast start, long, gentle deceleration. */
export const easeOutQuart = (u: number) => 1 - (1 - u) ** 4;

export function angleAt(plan: SpinPlan, elapsedMs: number): number {
  if (plan.durationMs <= 0) return plan.to;
  const u = Math.min(1, Math.max(0, elapsedMs / plan.durationMs));
  return plan.from + (plan.to - plan.from) * easeOutQuart(u);
}

/** The plate at the front for a wheel rotation θ. */
export function plateAtFront(theta: number, plates = PLATES): number {
  const i = Math.round(-theta / ((Math.PI * 2) / plates));
  return ((i % plates) + plates) % plates;
}
