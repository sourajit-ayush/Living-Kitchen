/** Rotating "thinking" lines (docs/02 §8). Sent with SSE progress events. */
export const LOADING_LINES = {
  en: [
    "Tempering the spices…",
    "Asking Nani for advice…",
    "Letting the flavours get friendly…",
    "Stirring clockwise, for luck…",
    "Tasting for salt…",
    "Warming the tawa…",
  ],
  hi: [
    "तड़का लग रहा है…",
    "नानी से सलाह ले रहे हैं…",
    "स्वाद आपस में घुल-मिल रहे हैं…",
    "किस्मत के लिए घड़ी की दिशा में चला रहे हैं…",
    "नमक चख रहे हैं…",
    "तवा गरम हो रहा है…",
  ],
  bn: [
    "ফোড়ন দেওয়া হচ্ছে…",
    "নানির পরামর্শ নেওয়া হচ্ছে…",
    "স্বাদগুলো মিলেমিশে যাচ্ছে…",
    "সৌভাগ্যের জন্য ঘড়ির কাঁটার দিকে নাড়া হচ্ছে…",
    "নুন চেখে দেখা হচ্ছে…",
    "তাওয়া গরম হচ্ছে…",
  ],
} as const;

/** The same, while a drink is being mixed (the glass swirls instead of the pot bubbling). */
export const DRINK_LOADING_LINES = {
  en: [
    "Crushing the ice…",
    "Asking Nani for advice…",
    "Muddling the mint…",
    "Frothing it up…",
    "Tasting for sweetness…",
    "Chilling the glasses…",
  ],
  hi: [
    "बर्फ़ कूट रहे हैं…",
    "नानी से सलाह ले रहे हैं…",
    "पुदीना कूट रहे हैं…",
    "झाग बना रहे हैं…",
    "मिठास चख रहे हैं…",
    "गिलास ठंडे कर रहे हैं…",
  ],
  bn: [
    "বরফ ভাঙা হচ্ছে…",
    "নানির পরামর্শ নেওয়া হচ্ছে…",
    "পুদিনা থেঁতো করা হচ্ছে…",
    "ফেনা তোলা হচ্ছে…",
    "মিষ্টি চেখে দেখা হচ্ছে…",
    "গ্লাস ঠান্ডা করা হচ্ছে…",
  ],
} as const;
