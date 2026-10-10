import { INGREDIENTS, INGREDIENTS_BY_ID, type Ingredient } from "@/data/ingredients";

/** Lower-case, NFC, drop Devanagari nukta (प्याज़ ≈ प्याज), strip punctuation, collapse spaces. */
export function normalize(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/़/g, "")
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, " ")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularForms(word: string): string[] {
  const forms = [word];
  if (word.endsWith("ies") && word.length > 4) forms.push(`${word.slice(0, -3)}y`);
  if (word.endsWith("oes") && word.length > 4) forms.push(word.slice(0, -2));
  if (word.endsWith("es") && word.length > 3) forms.push(word.slice(0, -2));
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) forms.push(word.slice(0, -1));
  return forms;
}

/** `alias` keys rank below real names, so "pan" suggests Paneer before "pani" (water). */
type Key = { key: string; id: string; alias: boolean };

const KEYS: Key[] = INGREDIENTS.flatMap((ing) => [
  ...[ing.names.en, ing.names.hi, ing.names.bn, ing.id].map((k) => ({
    key: normalize(k),
    id: ing.id,
    alias: false,
  })),
  ...ing.aliases.map((k) => ({ key: normalize(k), id: ing.id, alias: true })),
]);

const EXACT = new Map<string, string>();
for (const { key, id } of KEYS) if (!EXACT.has(key)) EXACT.set(key, id);

const isLatin = (s: string) => /^[a-z0-9 ]+$/.test(s);

/** Optimal-string-alignment distance (Levenshtein + adjacent transpositions). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

function typoBudget(len: number): number {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  return 2;
}

/** Exact name/alias match only (plurals allowed, no typo tolerance). */
export function matchIngredientExact(text: string): Ingredient | null {
  const q = normalize(text);
  for (const form of q ? singularForms(q) : []) {
    const id = EXACT.get(form);
    if (id) return INGREDIENTS_BY_ID.get(id)!;
  }
  return null;
}

/** Resolve free text ("Tomatoes", "palak", "पनीर", "panir") to a dictionary ingredient. */
export function matchIngredient(text: string): Ingredient | null {
  const q = normalize(text);
  if (!q) return null;

  const exact = matchIngredientExact(q);
  if (exact) return exact;

  if (!isLatin(q)) return null;
  const budget = typoBudget(q.length);
  if (budget === 0) return null;

  let best: { id: string; dist: number } | null = null;
  for (const { key, id } of KEYS) {
    if (!isLatin(key) || Math.abs(key.length - q.length) > budget) continue;
    const dist = editDistance(q, key);
    if (dist <= budget && (!best || dist < best.dist)) best = { id, dist };
  }
  return best ? INGREDIENTS_BY_ID.get(best.id)! : null;
}

/** Ranked autocomplete over names and aliases in every language. */
export function searchIngredients(query: string, limit = 8): Ingredient[] {
  const q = normalize(query);
  if (!q) return [];

  const scores = new Map<string, number>();
  const consider = (id: string, score: number) => {
    const prev = scores.get(id);
    if (prev === undefined || score < prev) scores.set(id, score);
  };

  for (const { key, id, alias } of KEYS) {
    const penalty = alias ? 0.5 : 0;
    if (key === q) consider(id, 0);
    else if (key.startsWith(q)) consider(id, 1 + penalty + key.length / 100);
    else if (key.split(" ").some((w) => w.startsWith(q)))
      consider(id, 2 + penalty + key.length / 100);
    else if (q.length >= 3 && key.includes(q)) consider(id, 3 + penalty);
  }

  if (scores.size < limit && isLatin(q) && q.length >= 4) {
    const budget = typoBudget(q.length);
    for (const { key, id } of KEYS) {
      if (!isLatin(key)) continue;
      const prefix = key.slice(0, q.length + 1);
      const dist = Math.min(editDistance(q, key), editDistance(q, prefix));
      if (dist <= budget) consider(id, 4 + dist);
    }
  }

  return [...scores.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, limit)
    .map(([id]) => INGREDIENTS_BY_ID.get(id)!);
}
