import { matchIngredient, matchIngredientExact, normalize } from "./matchIngredient";

export type ParsedIngredient = {
  /** Dictionary id, or null for unknown items (still accepted → clay blob) */
  id: string | null;
  /** Display name: dictionary English name, or the cleaned user text */
  name: string;
  qty?: string;
};

const LEAD_PHRASES = [
  "i have got",
  "i have",
  "i've got",
  "ive got",
  "i got",
  "we have",
  "there is",
  "there are",
  "mere paas",
  "hamare paas",
  "mere pass",
  "मेरे पास",
  "हमारे पास",
  "আমার কাছে",
  "আমাদের কাছে",
  "আমার আছে",
];
const TRAIL_WORDS = ["hai", "hain", "he", "है", "हैं", "আছে"];
const FILLERS = [
  "some",
  "a few",
  "a little",
  "few",
  "little",
  "fresh",
  "a",
  "an",
  "of",
  "thoda",
  "thodi",
  "थोड़ा",
  "थोड़ी",
  "একটু",
  "কিছু",
  "অল্প",
];

const UNIT =
  "kg|kgs|g|gm|gms|gram|grams|ml|l|ltr|litre|litres|liter|liters|cups?|tbsp|tsp|bunch(?:es)?|pieces?|pcs?|cloves?|katori|packets?|packs?|cans?|dozen|slices?|loaf|pinch";
// Bengali units; like the Bengali words below they can't end on \b (see NUM).
const BN_UNIT =
  "গ্রাম|কেজি|লিটার|মিলি|কাপ|চা-চামচ|টেবিল-চামচ|চামচ|আঁটি|কোয়া|প্যাকেট|পিস|টুকরো|বাটি";
// Number words in English, Hindi, Hinglish and Bengali ("do ande", "दो अंडे", "দুটো ডিম"). Words
// must end at a word boundary ("do" must not eat the start of "doodh"); \b doesn't see Devanagari
// or Bengali, hence (?=\s). Bengali counts take a classifier: "২টো", "তিনটে", "একটা".
const NUM =
  "\\d+(?:[.,/]\\d+)?|[०-९]+|[০-৯]+(?:টো|টা|টি|টে)?|[½¼¾⅓⅔]|" +
  "(?:half|one|two|three|four|five|six|seven|eight|nine|ten|dozen|ek|do|teen|chaar|paanch|panch)\\b|" +
  "(?:एक|दो|तीन|चार|पाँच|पांच|छह|सात|आठ|नौ|दस)(?=\\s)|" +
  "(?:একটা|একটি|এক|দুটো|দুটি|দুই|তিনটে|তিনটি|তিন|চারটে|চারটি|চার|পাঁচটা|পাঁচটি|পাঁচ|ছটা|ছয়|সাত|আট|নয়|দশ)(?=\\s)";

/** Spoken Hindi/Hinglish/Bengali counts read better as digits on a chip: "दो" → "2", "দুটো" → "2". */
const HINDI_NUMBERS: Record<string, string> = {
  একটা: "1",
  একটি: "1",
  এক: "1",
  দুটো: "2",
  দুটি: "2",
  দুই: "2",
  তিনটে: "3",
  তিনটি: "3",
  তিন: "3",
  চারটে: "4",
  চারটি: "4",
  চার: "4",
  পাঁচটা: "5",
  পাঁচটি: "5",
  পাঁচ: "5",
  ছটা: "6",
  ছয়: "6",
  সাত: "7",
  আট: "8",
  নয়: "9",
  দশ: "10",
  ek: "1",
  do: "2",
  teen: "3",
  chaar: "4",
  paanch: "5",
  panch: "5",
  एक: "1",
  दो: "2",
  तीन: "3",
  चार: "4",
  पाँच: "5",
  पांच: "5",
  छह: "6",
  सात: "7",
  आठ: "8",
  नौ: "9",
  दस: "10",
};
function toDigits(qty: string): string {
  return qty
    .replace(/^\S+/, (w) => HINDI_NUMBERS[w.toLowerCase()] ?? w)
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966))
    .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x9e6))
    .replace(/^(\d+)(?:টো|টা|টি|টে)/, "$1");
}

const QTY_UNIT = `(?:(?:${UNIT})\\b|(?:${BN_UNIT})(?=\\s|$))`;
const LEADING_QTY = new RegExp(`^((?:${NUM})\\s*${QTY_UNIT}?)\\s*(?:of\\s+)?(.+)$`, "i");
const TRAILING_QTY = new RegExp(`^(.+?)\\s+((?:${NUM})\\s*${QTY_UNIT}?)$`, "i");

/** Hard separators always split; soft ones ("and", "&") only when the phrase isn't one ingredient. */
const HARD_SPLIT = /\s*(?:,|;|\n|।)\s*/;
// \b doesn't see Devanagari or Bengali letters, so those words get explicit letter/mark
// lookarounds ("या" must not split "प्याज़", "আর" must not split "আরও").
const SOFT_SPLIT =
  /\s*(?:&|\+|\band\b|\baur\b|\bor\b|(?<![\p{L}\p{M}])(?:और|तथा|या|আর|এবং|ও|অথবা|বা)(?![\p{L}\p{M}]))\s*/iu;

/** Longest run of words tried as one ingredient when segmenting ("hari mirch", "शिमला मिर्च"). */
const MAX_PHRASE_WORDS = 3;

/**
 * Spoken lists rarely have commas: "aloo pyaaz tamatar", "अंडे पालक". If a phrase isn't one
 * ingredient but its words split cleanly into known ones (each optionally with a quantity), use
 * that split, with the fewest pieces. Otherwise keep the phrase whole (an unknown item).
 */
function segment(phrase: string): string[] {
  const words = phrase.trim().split(/\s+/);
  if (words.length < 2) return [phrase];
  const best: (string[] | null)[] = [[]];
  for (let end = 1; end <= words.length; end++) {
    best[end] = null;
    // A quantity can lead the piece ("2 tomatoes"), so allow a couple of extra words.
    for (let len = 1; len <= Math.min(end, MAX_PHRASE_WORDS + 2); len++) {
      const prev = best[end - len];
      if (!prev) continue;
      const piece = words.slice(end - len, end).join(" ");
      const text = splitQuantity(piece)?.text;
      if (!text || !matchIngredientExact(text)) continue;
      if (!best[end] || prev.length + 1 < best[end]!.length) best[end] = [...prev, piece];
    }
  }
  return best[words.length] ?? [phrase];
}

/** "hot and sweet sauce" stays whole; "eggs and bread" splits. */
function splitFragments(text: string): string[] {
  return text.split(HARD_SPLIT).flatMap((chunk) => {
    const text = splitQuantity(chunk)?.text;
    if (text && matchIngredientExact(text)) return [chunk];
    return chunk.split(SOFT_SPLIT).flatMap((part) => {
      const t = splitQuantity(part)?.text;
      return t && matchIngredientExact(t) ? [part] : segment(part);
    });
  });
}

function stripPhrases(text: string): string {
  let t = text.trim();
  for (const p of LEAD_PHRASES) {
    if (t.toLowerCase().startsWith(`${p} `)) {
      t = t.slice(p.length).trim();
      break;
    }
  }
  for (const w of TRAIL_WORDS) {
    if (t.toLowerCase().endsWith(` ${w}`)) t = t.slice(0, -w.length - 1).trim();
  }
  return t;
}

function stripFillers(text: string): string {
  let t = text;
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of FILLERS) {
      if (t.toLowerCase().startsWith(`${f} `)) {
        t = t.slice(f.length + 1).trim();
        changed = true;
      }
    }
  }
  return t;
}

/** "200g paneer" → { text: "paneer", qty: "200g" }; fillers and punctuation stripped. */
function splitQuantity(fragment: string): { text: string; qty?: string } | null {
  let text = stripFillers(fragment.trim().replace(/[.!?]+$/, ""));
  if (!text) return null;

  let qty: string | undefined;
  const lead = text.match(LEADING_QTY);
  if (lead && /\p{L}/u.test(lead[2])) {
    qty = toDigits(lead[1].replace(/\s+/g, " ").trim());
    text = lead[2];
  } else {
    const trail = text.match(TRAILING_QTY);
    if (trail && /\p{L}/u.test(trail[1])) {
      qty = toDigits(trail[2].replace(/\s+/g, " ").trim());
      text = trail[1];
    }
  }

  const cleaned = normalize(stripFillers(text));
  return cleaned ? { text: cleaned, ...(qty ? { qty } : {}) } : null;
}

/** Parse one chip-sized fragment like "200g paneer" or "eggs 3". */
export function parseOne(fragment: string): ParsedIngredient | null {
  const split = splitQuantity(fragment);
  if (!split) return null;
  const { text: cleaned, qty } = split;

  const match = matchIngredient(cleaned);
  const name = match ? match.names.en : cleaned.replace(/^\p{L}/u, (c) => c.toUpperCase());
  return { id: match?.id ?? null, name, ...(qty ? { qty } : {}) };
}

/** Text or voice transcript → list of ingredients. Duplicates are merged (last quantity wins). */
export function parseIngredients(input: string): ParsedIngredient[] {
  const parts = splitFragments(stripPhrases(input.normalize("NFC")));
  const out = new Map<string, ParsedIngredient>();
  for (const part of parts) {
    const parsed = parseOne(part);
    if (!parsed) continue;
    const key = parsed.id ?? normalize(parsed.name);
    const prev = out.get(key);
    out.set(key, prev ? { ...prev, ...(parsed.qty ? { qty: parsed.qty } : {}) } : parsed);
  }
  return [...out.values()];
}
