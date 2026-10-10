import type { IngredientCategory } from "@/data/ingredients";
import { matchIngredient } from "./matchIngredient";

/** Shopping-list aisles (R8), in walking order through an Indian kirana / supermarket. */
export const AISLES = [
  "produce",
  "dairy",
  "protein",
  "grains",
  "spices",
  "sauces",
  "other",
] as const;
export type Aisle = (typeof AISLES)[number];

const AISLE_BY_CATEGORY: Record<IngredientCategory, Aisle> = {
  veg: "produce",
  fruit: "produce",
  dairy: "dairy",
  protein: "protein",
  grain: "grains",
  spice: "spices",
  sauce: "sauces",
  other: "other",
};

export function aisleFor(name: string): Aisle {
  const category = matchIngredient(name)?.category;
  return category ? AISLE_BY_CATEGORY[category] : "other";
}

/** Pantry groups (R1: "Spices, Grains, Dairy, Veg, etc."). */
export const PANTRY_GROUPS: IngredientCategory[] = [
  "spice",
  "grain",
  "dairy",
  "veg",
  "fruit",
  "protein",
  "sauce",
  "other",
];

/** "YYYY-MM-DD" in the device's own time zone (an expiry date is a calendar day, not an instant). */
export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days from `today` to `date` (both "YYYY-MM-DD"): 0 = today, 1 = tomorrow, -1 = yesterday. */
export function daysUntil(date: string, today = localDate()): number {
  const [y1, m1, d1] = today.split("-").map(Number);
  const [y2, m2, d2] = date.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Use-It-Up (R4): within this many days, a pantry item counts as expiring soon. */
export const EXPIRING_DAYS = 2;

/** Pantry items expiring soon (or already past), soonest first. */
export function expiringSoon<T extends { expiresOn: string | null }>(
  items: T[],
  today = localDate(),
  within = EXPIRING_DAYS,
): (T & { days: number })[] {
  return items
    .filter((i): i is T & { expiresOn: string } => !!i.expiresOn)
    .map((i) => ({ ...i, days: daysUntil(i.expiresOn, today) }))
    .filter((i) => i.days <= within && i.days >= -3)
    .sort((a, b) => a.days - b.days);
}
