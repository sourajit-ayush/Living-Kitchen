/**
 * Real 3D models for common ingredients (design idea 8): Kenney "Food Kit" 2.0, CC0
 * (public/CREDITS.md). Each file is one small mesh (8–15 kB) that shares one 10 kB colour palette,
 * served from public/models/ingredients/<id>.glb and loaded only when that ingredient lands on
 * the counter. Everything else keeps the clay blob (project rule 7 in the README).
 *
 * `source` is the Kenney file name; `size` is the longest side in metres on the counter
 * (real size × ~1.3, like the clay blobs, so things read at a glance).
 */
export type IngredientModel = { source: string; size: number };

export const INGREDIENT_MODELS: Record<string, IngredientModel> = {
  // veg
  tomato: { source: "tomato", size: 0.11 },
  onion: { source: "onion", size: 0.11 },
  carrot: { source: "carrot", size: 0.17 },
  capsicum: { source: "paprika", size: 0.12 },
  cabbage: { source: "cabbage", size: 0.15 },
  cauliflower: { source: "cauliflower", size: 0.15 },
  broccoli: { source: "broccoli", size: 0.14 },
  mushroom: { source: "mushroom", size: 0.09 },
  brinjal: { source: "eggplant", size: 0.16 },
  corn: { source: "corn", size: 0.18 },
  beetroot: { source: "beet", size: 0.12 },
  radish: { source: "radish", size: 0.15 },
  pumpkin: { source: "pumpkin-basic", size: 0.17 },
  "spring-onion": { source: "leek", size: 0.2 },
  // fruit
  lemon: { source: "lemon", size: 0.09 },
  banana: { source: "banana", size: 0.17 },
  apple: { source: "apple", size: 0.1 },
  orange: { source: "orange", size: 0.1 },
  pineapple: { source: "pineapple", size: 0.2 },
  grapes: { source: "grapes", size: 0.13 },
  coconut: { source: "coconut", size: 0.13 },
  avocado: { source: "avocado", size: 0.11 },
  strawberry: { source: "strawberry", size: 0.07 },
  watermelon: { source: "watermelon", size: 0.2 },
  // dairy and protein
  milk: { source: "carton", size: 0.17 },
  cheese: { source: "cheese", size: 0.13 },
  egg: { source: "egg", size: 0.07 },
  "ice-cream": { source: "ice-cream", size: 0.12 },
  fish: { source: "fish", size: 0.2 },
  mutton: { source: "meat-raw", size: 0.14 },
  sausage: { source: "sausage", size: 0.14 },
  bacon: { source: "bacon-raw", size: 0.15 },
  // grains
  bread: { source: "loaf", size: 0.16 },
  // pantry, sauces, drinks
  ketchup: { source: "bottle-ketchup", size: 0.17 },
  "mustard-sauce": { source: "bottle-musterd", size: 0.17 },
  oil: { source: "bottle-oil", size: 0.2 },
  "soy-sauce": { source: "soy", size: 0.12 },
  honey: { source: "honey", size: 0.11 },
  "peanut-butter": { source: "peanut-butter", size: 0.11 },
  chocolate: { source: "chocolate", size: 0.14 },
  salt: { source: "shaker-salt", size: 0.1 },
  "black-pepper": { source: "shaker-pepper", size: 0.1 },
  "soda-water": { source: "soda-bottle", size: 0.18 },
};

export const MODEL_BASE = "/models/ingredients";

export function modelUrl(id: string): string | null {
  return INGREDIENT_MODELS[id] ? `${MODEL_BASE}/${id}.glb` : null;
}
