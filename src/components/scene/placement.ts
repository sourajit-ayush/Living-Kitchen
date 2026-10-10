/**
 * Drop-zone slot layout (docs/03 §1): a ~1.2 × 0.6 m area in the middle of the counter where new
 * ingredients land. Slots come from a seeded Poisson-disc sampler so objects never stack
 * awkwardly, and they are deterministic so the same slot always lands in the same spot.
 */

export type Slot = [x: number, z: number];

export const DROP_ZONE = { centerX: 0.05, centerZ: -0.05, width: 1.2, depth: 0.6 } as const;
export const MAX_ON_COUNTER = 24;

/** Small deterministic PRNG (mulberry32). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash for per-ingredient variation (colour jitter, yaw, shape tweaks). */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type Zone = { centerX: number; centerZ: number; width: number; depth: number };

/**
 * Poisson-disc slots, sorted centre-out so the first ingredients land in the middle of the
 * counter. Starts at `preferredDist` spacing and tightens 1 cm at a time until `count` fit.
 */
export function poissonSlots(
  count = MAX_ON_COUNTER,
  preferredDist = 0.16,
  seed = 7,
  zone: Zone = DROP_ZONE,
): Slot[] {
  for (let d = preferredDist; d >= 0.1; d -= 0.01) {
    const slots = bridson(count, d, seed, zone);
    if (slots.length >= count) return slots;
  }
  return bridson(count, 0.1, seed, zone);
}

/** Bridson-style Poisson-disc sampling around the zone centre. */
function bridson(count: number, minDist: number, seed: number, zone: Zone): Slot[] {
  const rand = mulberry32(seed);
  const halfW = zone.width / 2;
  const halfD = zone.depth / 2;
  const points: Slot[] = [];
  const active: Slot[] = [];
  const far = (p: Slot) => points.every(([x, z]) => Math.hypot(x - p[0], z - p[1]) >= minDist);

  const first: Slot = [0, 0];
  points.push(first);
  active.push(first);

  while (active.length && points.length < count) {
    const idx = Math.floor(rand() * active.length);
    const [ax, az] = active[idx];
    let placed = false;
    for (let k = 0; k < 30; k++) {
      const angle = rand() * Math.PI * 2;
      const r = minDist * (1 + rand());
      const p: Slot = [ax + Math.cos(angle) * r, az + Math.sin(angle) * r];
      if (Math.abs(p[0]) > halfW || Math.abs(p[1]) > halfD || !far(p)) continue;
      points.push(p);
      active.push(p);
      placed = true;
      break;
    }
    if (!placed) active.splice(idx, 1);
  }

  return points
    .sort((a, b) => Math.hypot(a[0], a[1] * 1.6) - Math.hypot(b[0], b[1] * 1.6))
    .slice(0, count)
    .map(([x, z]) => [zone.centerX + x, zone.centerZ + z]);
}

/**
 * Keep each ingredient in the slot it first landed in. Returns the new key→slot map; keys that
 * no longer exist free their slot, and new keys take the lowest free slot (or none: basket).
 */
export function assignSlots(
  keys: string[],
  previous: ReadonlyMap<string, number>,
  capacity: number,
): Map<string, number> {
  const next = new Map<string, number>();
  for (const key of keys) {
    const slot = previous.get(key);
    if (slot !== undefined && slot < capacity) next.set(key, slot);
  }
  const used = new Set(next.values());
  let free = 0;
  for (const key of keys) {
    if (next.has(key)) continue;
    while (used.has(free)) free++;
    if (free >= capacity) break;
    next.set(key, free);
    used.add(free);
  }
  return next;
}
