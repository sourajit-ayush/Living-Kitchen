import { normalize } from "@/lib/matchIngredient";

export type Substitute = { name: string; note: string; source?: "ai" | "local" };

/**
 * Offline substitution rules (F7), keyed by ingredient id from data/ingredients.ts.
 * Notes are English for now; Phase 7 moves them to the i18n catalogue.
 */
export const LOCAL_SUBSTITUTIONS: Record<string, Substitute[]> = {
  buttermilk: [
    { name: "Milk + lemon juice", note: "1 cup milk + 1 tbsp lemon juice. Rest 10 min." },
  ],
  curd: [
    { name: "Buttermilk", note: "Use 1½× the amount and cook a little longer to thicken." },
    {
      name: "Milk + lemon juice",
      note: "1 cup milk + 1 tbsp lemon, rested 10 min, for marinades.",
    },
  ],
  cream: [
    { name: "Milk + butter", note: "¾ cup milk + ¼ cup melted butter per cup of cream." },
    {
      name: "Cashew paste",
      note: "Soak 10 cashews in hot water 10 min, blend with a splash of water.",
    },
  ],
  paneer: [
    { name: "Firm tofu", note: "Press 10 min, then use 1:1. Add a squeeze of lemon." },
    {
      name: "Boiled potato",
      note: "Cube and pan-fry until golden; changes texture but works in gravies.",
    },
  ],
  egg: [
    {
      name: "Flax egg",
      note: "1 tbsp ground flaxseed + 3 tbsp water, rest 5 min. For baking only.",
    },
    {
      name: "Besan batter",
      note: "3 tbsp besan + 3 tbsp water per egg, for omelette-style dishes.",
    },
  ],
  butter: [
    { name: "Ghee", note: "Use ¾ the amount." },
    { name: "Cooking oil", note: "Use ¾ the amount; you lose some richness." },
  ],
  ghee: [{ name: "Butter", note: "Use 1¼× the amount and keep the heat lower." }],
  milk: [
    { name: "Coconut milk", note: "1:1, best in curries and desserts." },
    { name: "Water + milk powder", note: "1 cup water + 3 tbsp milk powder." },
  ],
  tomato: [
    { name: "Tomato puree", note: "2 tbsp puree per tomato." },
    { name: "Tomato ketchup", note: "1 tbsp per tomato; reduce sugar elsewhere." },
  ],
  "tomato-puree": [{ name: "Tomato", note: "1 fresh tomato, blended, per 2 tbsp puree." }],
  onion: [
    { name: "Spring onion", note: "3 stalks per onion; add the greens at the end." },
    { name: "Hing", note: "A pinch in hot oil for savoury depth (Jain-friendly)." },
  ],
  garlic: [{ name: "Hing", note: "A pinch per 3 cloves, added to hot oil (Jain-friendly)." }],
  ginger: [{ name: "Dry ginger powder", note: "¼ tsp per 1-inch piece." }],
  lemon: [
    { name: "Vinegar", note: "½ tsp per tsp of lemon juice." },
    { name: "Amchur", note: "½ tsp dry mango powder per tsp of lemon juice." },
    { name: "Tamarind", note: "½ tsp tamarind paste, diluted, per tsp of lemon juice." },
  ],
  tamarind: [
    { name: "Lemon juice", note: "1 tsp lemon + a pinch of jaggery per tsp tamarind paste." },
  ],
  "green-chilli": [{ name: "Red chilli powder", note: "¼ tsp per green chilli." }],
  coriander: [{ name: "Mint", note: "Use half the amount; brighter flavour." }],
  "kasuri-methi": [
    { name: "Fresh methi", note: "1 tbsp chopped fresh methi per tsp kasuri methi." },
  ],
  "garam-masala": [
    {
      name: "Cumin + pepper + cinnamon",
      note: "½ tsp cumin powder + pinch each of pepper and cinnamon.",
    },
  ],
  sugar: [
    { name: "Jaggery", note: "Use 1¼× the amount, grated." },
    { name: "Honey", note: "Use ¾ the amount; reduce other liquids slightly." },
  ],
  jaggery: [{ name: "Brown sugar", note: "1:1." }],
  maida: [{ name: "Atta", note: "1:1; denser result. Add 1 tbsp extra liquid per cup." }],
  atta: [
    { name: "Maida", note: "1:1; softer, less fibre." },
    { name: "Leftover rotis", note: "For wraps and quesadillas, skip the dough entirely." },
  ],
  besan: [{ name: "Rice flour", note: "1:1 for crisp batters; less nutty." }],
  suji: [{ name: "Poha (ground)", note: "1:1, pulsed to a coarse powder." }],
  rice: [{ name: "Broken wheat (dalia)", note: "1:1; add 5 min to the cooking time." }],
  "baking-soda": [
    { name: "Fruit salt (Eno)", note: "Use 1½× the amount, added right before cooking." },
  ],
  "baking-powder": [
    { name: "Baking soda + curd", note: "¼ tsp soda + ½ cup curd per 1 tsp baking powder." },
  ],
  cornflour: [{ name: "Maida", note: "Use 2× the amount for thickening." }],
  "soy-sauce": [
    { name: "Salt + vinegar", note: "A pinch of salt + ½ tsp vinegar per tsp of soy sauce." },
  ],
  ketchup: [
    { name: "Tomato puree + sugar", note: "1 tbsp puree + ½ tsp sugar + a few drops of vinegar." },
  ],
  "green-chilli-sauce": [
    {
      name: "Green chilli + vinegar",
      note: "1 chopped green chilli + 1 tsp vinegar + a pinch of sugar per tbsp.",
    },
  ],
  "red-chilli-sauce": [
    { name: "Ketchup + chilli powder", note: "1 tbsp ketchup + ¼ tsp red chilli powder." },
    { name: "Hot sauce", note: "Use half the amount; it's hotter and tangier." },
  ],
  "schezwan-sauce": [
    {
      name: "Red chilli sauce + garlic",
      note: "1 tbsp red chilli sauce + 1 grated garlic clove + a dash of soy sauce.",
    },
  ],
  "hot-sauce": [
    { name: "Red chilli sauce + vinegar", note: "1 tbsp red chilli sauce + ½ tsp vinegar." },
  ],
  "sweet-chilli-sauce": [
    {
      name: "Ketchup + chilli flakes + honey",
      note: "1 tbsp ketchup + ¼ tsp chilli flakes + ½ tsp honey.",
    },
  ],
  "tomato-chilli-sauce": [{ name: "Ketchup + red chilli sauce", note: "Mix 2:1." }],
  "pasta-sauce": [
    {
      name: "Tomatoes + oregano",
      note: "Cook 2 chopped tomatoes with garlic, oregano and salt until thick, about 10 min.",
    },
  ],
  "bbq-sauce": [
    {
      name: "Ketchup + jaggery + soy sauce",
      note: "2 tbsp ketchup + 1 tsp jaggery + 1 tsp soy sauce + a pinch of smoked paprika.",
    },
  ],
  "oyster-sauce": [
    { name: "Soy sauce + sugar", note: "1 tbsp soy sauce + ½ tsp sugar (vegetarian-friendly)." },
  ],
  "fish-sauce": [
    {
      name: "Soy sauce + lemon",
      note: "1 tbsp soy sauce + a squeeze of lemon (vegetarian-friendly).",
    },
  ],
  worcestershire: [
    {
      name: "Soy sauce + tamarind",
      note: "1 tsp soy sauce + ½ tsp tamarind paste + a pinch of sugar.",
    },
  ],
  "mustard-sauce": [
    {
      name: "Mustard seeds paste",
      note: "Grind 1 tsp mustard seeds with vinegar, salt and a pinch of turmeric.",
    },
  ],
  "tamarind-chutney": [
    {
      name: "Tamarind + jaggery",
      note: "1 tbsp tamarind paste + 1 tbsp jaggery, simmered with cumin and chilli.",
    },
  ],
  "peri-peri-sauce": [
    {
      name: "Hot sauce + garlic + lemon",
      note: "1 tbsp hot sauce + 1 grated garlic clove + a squeeze of lemon.",
    },
  ],
  "chilli-oil": [
    {
      name: "Chilli flakes in hot oil",
      note: "Pour 2 tbsp smoking-hot oil over 1 tsp chilli flakes and garlic.",
    },
  ],
  mayonnaise: [{ name: "Hung curd", note: "1:1, with a pinch of salt and a few drops of lemon." }],
  vinegar: [{ name: "Lemon juice", note: "1:1." }],
  cheese: [{ name: "Paneer", note: "Grated, 1:1; won't melt the same way." }],
  mozzarella: [{ name: "Processed cheese", note: "1:1." }],
  oil: [{ name: "Ghee", note: "1:1; richer flavour." }],
  "mustard-oil": [{ name: "Cooking oil", note: "1:1 + a pinch of mustard seeds for the bite." }],
  chicken: [
    { name: "Paneer", note: "Same weight; cook for less time." },
    { name: "Soya chunks", note: "Use ⅓ the weight, soaked in hot water 10 min." },
  ],
  bread: [{ name: "Rotis", note: "Toast leftover rotis on a tawa." }],
  pasta: [{ name: "Noodles", note: "1:1; reduce boiling time." }],
};

export function localSubstitutes(ingredientId: string | null | undefined): Substitute[] {
  if (!ingredientId) return [];
  return (LOCAL_SUBSTITUTIONS[ingredientId] ?? []).map((s) => ({ ...s, source: "local" }));
}

/** AI substitutes first (recipe-specific), then local rules, de-duplicated by name. */
export function getSubstitutes(
  ingredientId: string | null | undefined,
  aiSubstitutes: { name: string; note: string }[] = [],
): Substitute[] {
  const out: Substitute[] = [];
  const seen = new Set<string>();
  for (const s of [
    ...aiSubstitutes.map((s) => ({ ...s, source: "ai" as const })),
    ...localSubstitutes(ingredientId),
  ]) {
    const key = normalize(s.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
