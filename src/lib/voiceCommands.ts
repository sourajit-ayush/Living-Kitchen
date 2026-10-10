/**
 * Hands-free Cook Mode commands (F9): "next", "back", "repeat", "start timer", plus "stop timer"
 * and "ingredients". English, Hindi, Hinglish and Bengali, as speech recognition returns them (it may
 * transcribe Hinglish in either script). Matching is on whole words, and the last command in a
 * phrase wins ("no wait, go back" → back).
 */

export type VoiceCommand =
  | "next"
  | "back"
  | "repeat"
  | "startTimer"
  | "stopTimer"
  | "ingredients"
  | "timeLeft"
  | "whatsNext"
  | "help";

const PHRASES: [VoiceCommand, string[]][] = [
  [
    "timeLeft",
    [
      "how much time",
      "how long left",
      "time left",
      "time remaining",
      "how much longer",
      "kitna time",
      "kitna samay",
      "kitni der",
      "कितना समय",
      "कितना टाइम",
      "कितनी देर",
      "কত সময় বাকি",
      "কতক্ষণ বাকি",
      "কত সময় আছে",
    ],
  ],
  [
    "whatsNext",
    [
      "what s next",
      "what is next",
      "what comes next",
      "next kya hai",
      "aage kya hai",
      "आगे क्या है",
      "अगला क्या है",
      "এরপর কী",
      "এর পর কী",
      "পরের ধাপ কী",
    ],
  ],
  [
    "help",
    [
      "help",
      "what can i say",
      "commands",
      "madad",
      "मदद",
      "क्या बोल सकते हैं",
      "সাহায্য",
      "কী বলতে পারি",
    ],
  ],
  // multi-word phrases first, so "start timer" isn't read as a bare "timer"
  [
    "stopTimer",
    [
      "stop timer",
      "stop the timer",
      "pause timer",
      "timer band",
      "timer roko",
      "टाइमर बंद",
      "टाइमर रोको",
      "টাইমার বন্ধ",
      "টাইমার থামাও",
    ],
  ],
  [
    "startTimer",
    [
      "start timer",
      "start the timer",
      "set timer",
      "set a timer",
      "timer start",
      "timer shuru",
      "टाइमर शुरू",
      "टाइमर चालू",
      "টাইমার চালাও",
      "টাইমার শুরু",
      "টাইমার চালু",
      "timer",
      "टाइमर",
      "টাইমার",
    ],
  ],
  [
    "ingredients",
    ["ingredients", "ingredient list", "what do i need", "saamagri", "samagri", "सामग्री", "উপকরণ"],
  ],
  [
    "repeat",
    [
      "repeat",
      "again",
      "say again",
      "read again",
      "dobara",
      "phir se",
      "दोबारा",
      "फिर से",
      "আবার বলো",
      "আরেকবার",
      "আবার",
    ],
  ],
  [
    "next",
    [
      "next",
      "next step",
      "go on",
      "continue",
      "done",
      "aage",
      "agla",
      "आगे",
      "अगला",
      "পরের",
      "পরেরটা",
      "এগোও",
      "হয়ে গেছে",
    ],
  ],
  [
    "back",
    [
      "back",
      "go back",
      "previous",
      "previous step",
      "peeche",
      "pichla",
      "wapas",
      "पीछे",
      "पिछला",
      "वापस",
      "আগের",
      "আগেরটা",
      "পিছনে",
      "ফিরে যাও",
    ],
  ],
];

function normalise(transcript: string): string {
  return ` ${transcript
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/** The command in a recognised phrase, or null. */
export function parseVoiceCommand(transcript: string): VoiceCommand | null {
  const text = normalise(transcript);
  let best: { command: VoiceCommand; at: number } | null = null;
  const taken: [number, number][] = [];
  for (const [command, phrases] of PHRASES) {
    for (const phrase of phrases) {
      const needle = ` ${phrase} `;
      let from = 0;
      for (;;) {
        const at = text.indexOf(needle, from);
        if (at < 0) break;
        from = at + 1;
        const end = at + needle.length;
        // a longer phrase already claimed these words ("start timer" vs "timer")
        if (taken.some(([s, e]) => at < e && end > s)) continue;
        taken.push([at, end]);
        if (!best || at > best.at) best = { command, at };
      }
    }
  }
  return best?.command ?? null;
}

/** What the cook asked for: a plain command, a timer of a given length, or a jump to a step. */
export type VoiceIntent =
  | { type: "command"; command: VoiceCommand }
  | { type: "timer"; seconds: number }
  | { type: "goTo"; step: number };

const NUMBER_WORDS: Record<string, number> = {
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
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  forty_five: 45,
  sixty: 60,
  a: 1,
  an: 1,
  half: 0.5,
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  panch: 5,
  chhe: 6,
  saat: 7,
  aath: 8,
  nau: 9,
  das: 10,
  pandrah: 15,
  bees: 20,
  tees: 30,
  एक: 1,
  दो: 2,
  तीन: 3,
  चार: 4,
  पांच: 5,
  पाँच: 5,
  छह: 6,
  छः: 6,
  सात: 7,
  आठ: 8,
  नौ: 9,
  दस: 10,
  पंद्रह: 15,
  बीस: 20,
  तीस: 30,
  आधा: 0.5,
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
  আধ: 0.5,
  আধা: 0.5,
};

/** The first number in the words, as digits ("5", "५", "৫") or a number word. */
function firstNumber(words: string[]): { value: number; at: number } | null {
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
      .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
      .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
    if (/^\d+(\.\d+)?$/.test(w)) return { value: Number(w), at: i };
    if (w in NUMBER_WORDS && !(w === "a" || w === "an" || w === "do")) {
      return { value: NUMBER_WORDS[w], at: i };
    }
    // "a minute", "do minute" only right before a time unit
    if (
      (w === "a" || w === "an" || w === "do") &&
      /^(minute|minutes|min|मिनट)$/.test(words[i + 1] ?? "")
    ) {
      return { value: NUMBER_WORDS[w], at: i };
    }
  }
  return null;
}

// Bengali units carry case endings: "৫ মিনিটের টাইমার", "ধাপ ৩-এ যাও".
const MINUTE = /^(minute|minutes|min|mins|मिनट|মিনিট|মিনিটের|মিনিটে)$/;
const SECOND = /^(second|seconds|sec|secs|सेकंड|सेकेंड|সেকেন্ড|সেকেন্ডের)$/;
const HOUR = /^(hour|hours|घंटा|घंटे|ঘণ্টা|ঘণ্টার)$/;
const STEP = /^(step|स्टेप|चरण|ধাপ|ধাপে)$/;

/**
 * Commands with a number in them, then the plain ones: "set a timer for 5 minutes",
 * "5 मिनट का टाइमर", "timer for 90 seconds" → a timer; "go to step 3", "स्टेप 3" → that step.
 */
export function parseVoiceIntent(transcript: string): VoiceIntent | null {
  const words = normalise(transcript).trim().split(" ").filter(Boolean);
  const mentionsTimer = words.some((w) => ["timer", "टाइमर", "টাইমার", "alarm"].includes(w));
  const n = firstNumber(words);
  if (n && n.value > 0) {
    const unit = words
      .slice(n.at + 1, n.at + 3)
      .find((w) => MINUTE.test(w) || SECOND.test(w) || HOUR.test(w));
    if (
      unit &&
      (mentionsTimer || words.some((w) => w === "for" || w === "का" || w === "ka" || w === "set"))
    ) {
      const seconds = Math.round(n.value * (SECOND.test(unit) ? 1 : HOUR.test(unit) ? 3600 : 60));
      if (seconds >= 5 && seconds <= 6 * 3600) return { type: "timer", seconds };
    }
    if (!mentionsTimer && words.some((w) => STEP.test(w)) && Number.isInteger(n.value)) {
      return { type: "goTo", step: n.value };
    }
  }
  const command = parseVoiceCommand(transcript);
  return command ? { type: "command", command } : null;
}
