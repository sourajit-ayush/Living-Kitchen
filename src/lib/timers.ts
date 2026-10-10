/**
 * Detect cooking durations in step text (F9): "simmer for 10 minutes" → a 10:00 timer chip.
 * English, Hindi and Hinglish: "8–10 min", "1½ hours", "1 hr 15 min", "30 seconds",
 * "half an hour", "10 मिनट", "1 घंटा", "५ मिनट". A range starts the timer at its lower bound
 * (check early; it is easy to add time, impossible to un-burn) and keeps the upper bound.
 */

export type DetectedTimer = {
  /** The exact text that was matched, e.g. "about 3 minutes" minus "about" → "3 minutes". */
  label: string;
  /** Timer length in seconds (the lower bound of a range). */
  seconds: number;
  /** Upper bound of a range, else equal to `seconds`. */
  maxSeconds: number;
  /** Character offsets of `label` in the text, for inline chips. */
  start: number;
  end: number;
};

const WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  "forty-five": 45,
  sixty: 60,
  एक: 1,
  दो: 2,
  तीन: 3,
  चार: 4,
  पाँच: 5,
  पांच: 5,
  छह: 6,
  सात: 7,
  आठ: 8,
  नौ: 9,
  दस: 10,
  पंद्रह: 15,
  बीस: 20,
  तीस: 30,
  এক: 1,
  দুই: 2,
  তিন: 3,
  চার: 4,
  পাঁচ: 5,
  ছয়: 6,
  সাত: 7,
  আট: 8,
  নয়: 9,
  দশ: 10,
  পনেরো: 15,
  কুড়ি: 20,
  তিরিশ: 30,
  ত্রিশ: 30,
};
const FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75 };

const NUM = String.raw`(?:[0-9०-९০-৯]+(?:[.,][0-9०-९০-৯]+)?\s*[½¼¾]?|[½¼¾]|half(?:\s+an?)?|आधा|आधे|আধা|আধ|${Object.keys(
  WORDS,
)
  .sort((x, y) => y.length - x.length)
  .join("|")})`;
const RANGE = String.raw`(${NUM})(?:\s*(?:-|–|—|to|or|से|থেকে)\s*(${NUM}))?`;
// Bengali units take case endings ("৫ মিনিটের জন্য", "১০ মিনিটে"), so those are part of the unit.
const UNIT = String.raw`(hours?|hrs?|घंटे|घंटा|minutes?|mins?|मिनट|seconds?|secs?|सेकंड|सेकेंड|ঘণ্টা(?:র|য়)?|মিনিট(?:ের|ে)?|সেকেন্ড(?:ের|ে)?)`;
// Lookarounds instead of \b: \b does not understand Devanagari or Bengali letters.
const PATTERN = new RegExp(String.raw`(?<![\p{L}\p{N}])${RANGE}\s*${UNIT}(?![\p{L}\p{N}])`, "giu");

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
const BENGALI_DIGITS = "০১২৩৪৫৬৭৮৯";

function toNumber(raw: string): number | null {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
    .replace(/[০-৯]/g, (d) => String(BENGALI_DIGITS.indexOf(d)));
  if (/^half(\s+an?)?$/.test(s) || ["आधा", "आधे", "আধা", "আধ"].includes(s)) return 0.5;
  if (s in WORDS) return WORDS[s];
  const m = s.match(/^(\d+(?:[.,]\d+)?)?\s*([½¼¾])?$/);
  if (!m || (!m[1] && !m[2])) return null;
  return (m[1] ? parseFloat(m[1].replace(",", ".")) : 0) + (m[2] ? FRACTIONS[m[2]] : 0);
}

function unitSeconds(unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith("h") || u.startsWith("घ") || u.startsWith("ঘ")) return 3600;
  if (u.startsWith("s") || u.startsWith("से") || u.startsWith("সে")) return 1;
  return 60;
}

/** Find every duration in `text`, in order. Adjacent "1 hour 15 minutes" become one timer. */
export function detectTimers(text: string): DetectedTimer[] {
  const found: DetectedTimer[] = [];
  for (const m of text.normalize("NFC").matchAll(PATTERN)) {
    const low = toNumber(m[1]);
    const high = m[2] ? toNumber(m[2]) : low;
    if (low === null || high === null || low <= 0) continue;
    const scale = unitSeconds(m[3]);
    const start = m.index ?? 0;
    const timer = {
      label: m[0],
      seconds: Math.round(Math.min(low, high) * scale),
      maxSeconds: Math.round(Math.max(low, high) * scale),
      start,
      end: start + m[0].length,
    };
    // "1 hour 15 minutes" / "1 hr and 15 min": fold into the previous duration.
    const prev = found.at(-1);
    const gap = prev ? text.slice(prev.end, start) : "";
    if (prev && /^\s*(?:,|and|और|আর|এবং)?\s*$/i.test(gap) && prev.seconds > timer.seconds) {
      prev.seconds += timer.seconds;
      prev.maxSeconds += timer.maxSeconds;
      prev.label = text.slice(prev.start, timer.end);
      prev.end = timer.end;
      continue;
    }
    found.push(timer);
  }
  // Sanity: nothing under 5 s or over 12 h is a cooking timer.
  return found.filter((t) => t.seconds >= 5 && t.seconds <= 12 * 3600);
}

/** Timers for a recipe step: from its text, else the model's `timer_minutes`. */
export function stepTimers(step: { text: string; timer_minutes?: number | null }): DetectedTimer[] {
  const detected = detectTimers(step.text);
  if (detected.length || !step.timer_minutes) return detected;
  const seconds = Math.round(step.timer_minutes * 60);
  return [{ label: "", seconds, maxSeconds: seconds, start: -1, end: -1 }];
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}
