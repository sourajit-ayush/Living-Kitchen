/** Unit systems for the F8 toggle: Metric / Indian cups & katori / US. */
export const UNIT_SYSTEMS = ["metric", "indian", "us"] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

/** Millilitres per volume unit. Cups are the Indian/metric 240 ml cup; a katori is ~150 ml. */
export const ML_PER: Record<string, number> = {
  ml: 1,
  l: 1000,
  tsp: 5,
  tbsp: 15,
  cup: 240,
  katori: 150,
  "fl oz": 29.57,
};

/** Grams per weight unit. */
export const G_PER: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.35,
  lb: 453.6,
};

/** Units that are counted, not measured: never converted between systems. */
export const COUNT_UNITS = new Set(["piece", "clove", "bunch", "pinch"]);

/** Accepts the model's spelling variants ("grams", "cups", "Tbsp") and returns a canonical unit. */
export function canonicalUnit(unit: string): string {
  const u = unit.trim().toLowerCase().replace(/\.$/, "");
  const map: Record<string, string> = {
    gm: "g",
    gms: "g",
    gram: "g",
    grams: "g",
    kgs: "kg",
    kilogram: "kg",
    kilograms: "kg",
    millilitre: "ml",
    milliliter: "ml",
    millilitres: "ml",
    milliliters: "ml",
    litre: "l",
    liter: "l",
    litres: "l",
    liters: "l",
    ltr: "l",
    teaspoon: "tsp",
    teaspoons: "tsp",
    tsps: "tsp",
    tablespoon: "tbsp",
    tablespoons: "tbsp",
    tbsps: "tbsp",
    tbs: "tbsp",
    cups: "cup",
    katoris: "katori",
    bowl: "katori",
    pieces: "piece",
    pc: "piece",
    pcs: "piece",
    whole: "piece",
    nos: "piece",
    cloves: "clove",
    bunches: "bunch",
    pinches: "pinch",
    "to taste": "to-taste",
    "as needed": "to-taste",
  };
  return map[u] ?? u;
}
