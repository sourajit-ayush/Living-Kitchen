import "server-only";
import { claudeStructured } from "./claude";
import { geminiStructured } from "./gemini";
import { buildSurprisePrompt, SURPRISE_PROMPT } from "./prompts";
import { aiProvider, isMockMode } from "./provider";
import { SurpriseIdeasSchema, type SurpriseIdea, type SurpriseRequest } from "./schema";

const MOCK_IDEAS: Record<SurpriseRequest["locale"], SurpriseIdea[]> = {
  en: [
    {
      title: "Palak Paneer Bhurji",
      emoji: "🥬",
      oneLiner: "Scrambled paneer with wilted spinach, ready in 15.",
    },
    {
      title: "Masala Omelette",
      emoji: "🍳",
      oneLiner: "Fluffy, green-chilli flecked and on the table fast.",
    },
    {
      title: "Tomato Rasam",
      emoji: "🍲",
      oneLiner: "Peppery, tangy and soothing in a little cup.",
    },
    { title: "Jeera Rice", emoji: "🍚", oneLiner: "Cumin-scented rice that goes with everything." },
    {
      title: "Paneer Tikka Skewers",
      emoji: "🍢",
      oneLiner: "Charred edges, smoky spice, a squeeze of lemon.",
    },
    {
      title: "Aloo Paratha",
      emoji: "🫓",
      oneLiner: "Golden flatbread stuffed with spiced potato.",
    },
    {
      title: "Masoor Dal Tadka",
      emoji: "🥣",
      oneLiner: "Everyday red lentils with a sizzling tempering.",
    },
    {
      title: "Spinach Quesadilla",
      emoji: "🌮",
      oneLiner: "A playful desi-Mexican snack with melty cheese.",
    },
  ],
  hi: [
    {
      title: "पालक पनीर भुर्जी",
      emoji: "🥬",
      oneLiner: "पालक के साथ भुना पनीर, 15 मिनट में तैयार।",
    },
    { title: "मसाला ऑमलेट", emoji: "🍳", oneLiner: "हरी मिर्च वाला फूला-फूला ऑमलेट।" },
    { title: "टमाटर रसम", emoji: "🍲", oneLiner: "काली मिर्च वाला खट्टा, सुकून भरा रसम।" },
    { title: "जीरा राइस", emoji: "🍚", oneLiner: "जीरे की खुशबू वाले चावल, हर चीज़ के साथ।" },
    { title: "पनीर टिक्का", emoji: "🍢", oneLiner: "धुएँदार मसाले और नींबू की बूँदें।" },
    { title: "आलू पराठा", emoji: "🫓", oneLiner: "मसालेदार आलू से भरा सुनहरा पराठा।" },
    { title: "मसूर दाल तड़का", emoji: "🥣", oneLiner: "रोज़ की लाल दाल, छौंक के साथ।" },
    { title: "पालक क्वेसाडिया", emoji: "🌮", oneLiner: "देसी-मैक्सिकन मज़ेदार नाश्ता।" },
  ],
  bn: [
    { title: "পালং পনির ভুর্জি", emoji: "🥬", oneLiner: "পালং দিয়ে ঝুরো পনির, ১৫ মিনিটে তৈরি।" },
    { title: "মশলা অমলেট", emoji: "🍳", oneLiner: "কাঁচালঙ্কা দেওয়া ফুলকো অমলেট।" },
    { title: "টমেটোর রসম", emoji: "🍲", oneLiner: "গোলমরিচ দেওয়া টক, আরামের রসম।" },
    { title: "জিরে ভাত", emoji: "🍚", oneLiner: "জিরের গন্ধে ভরা ভাত, সবকিছুর সঙ্গে চলে।" },
    { title: "পনির টিক্কা", emoji: "🍢", oneLiner: "ধোঁয়াটে মশলা আর লেবুর ছিটে।" },
    { title: "আলুর পরোটা", emoji: "🫓", oneLiner: "মশলাদার আলুর পুর ভরা সোনালি পরোটা।" },
    { title: "মুসুর ডাল", emoji: "🥣", oneLiner: "রোজকার লাল ডাল, গরম ফোড়ন দিয়ে।" },
    { title: "পালং কেসাডিয়া", emoji: "🌮", oneLiner: "দেশি-মেক্সিকান মজার জলখাবার।" },
  ],
};

const FOOD_EMOJI = /\p{Extended_Pictographic}/u;

/** Model ideas → wheel plates: exactly one emoji each (a plate as the fallback). */
export function tidyIdeas(ideas: SurpriseIdea[]): SurpriseIdea[] {
  return ideas.map((idea) => ({
    ...idea,
    emoji: [...idea.emoji].find((c) => FOOD_EMOJI.test(c)) ?? "🍽️",
  }));
}

/** Drinks on the wheel in mock mode (the e2e suite and local development). */
const MOCK_DRINK_IDEAS: Record<SurpriseRequest["locale"], SurpriseIdea[]> = {
  en: [
    { title: "Masala Chai", emoji: "🍵", oneLiner: "Ginger and cardamom simmered into milky tea." },
    { title: "Mango Lassi", emoji: "🥭", oneLiner: "Thick, cold and sunny, blended with curd." },
    { title: "Virgin Mojito", emoji: "🍹", oneLiner: "Mint, lime and fizz over plenty of ice." },
    { title: "Cold Coffee", emoji: "🧋", oneLiner: "Frothy, chilled and café-sweet." },
    { title: "Nimbu Pani", emoji: "🍋", oneLiner: "Sweet, salty lemonade with a pinch of jeera." },
    { title: "Banana Shake", emoji: "🍌", oneLiner: "Creamy and filling, ready in two minutes." },
    { title: "Masala Chaas", emoji: "🥛", oneLiner: "Spiced buttermilk to cool down a hot day." },
    { title: "Haldi Doodh", emoji: "🌙", oneLiner: "Warm turmeric milk for a cosy night." },
  ],
  hi: [
    { title: "मसाला चाय", emoji: "🍵", oneLiner: "अदरक और इलायची वाली दूध की चाय।" },
    { title: "आम की लस्सी", emoji: "🥭", oneLiner: "दही के साथ गाढ़ी, ठंडी और मीठी।" },
    {
      title: "वर्जिन मोहितो",
      emoji: "🍹",
      oneLiner: "पुदीना, नींबू और सोडा, ढेर सारी बर्फ़ के साथ।",
    },
    { title: "कोल्ड कॉफ़ी", emoji: "🧋", oneLiner: "झागदार, ठंडी और कैफ़े जैसी मीठी।" },
    { title: "नींबू पानी", emoji: "🍋", oneLiner: "चुटकी भर जीरे वाला खट्टा-मीठा शरबत।" },
    { title: "केले का शेक", emoji: "🍌", oneLiner: "गाढ़ा और पेट भरने वाला, दो मिनट में।" },
    { title: "मसाला छाछ", emoji: "🥛", oneLiner: "गर्मी में ठंडक देने वाली मसालेदार छाछ।" },
    { title: "हल्दी दूध", emoji: "🌙", oneLiner: "आरामदायक रात के लिए गरम हल्दी वाला दूध।" },
  ],
  bn: [
    { title: "মশলা চা", emoji: "🍵", oneLiner: "আদা আর এলাচ দিয়ে ফোটানো দুধ-চা।" },
    { title: "আম লস্যি", emoji: "🥭", oneLiner: "দই দিয়ে ঘন, ঠান্ডা আর মিষ্টি।" },
    { title: "ভার্জিন মোহিতো", emoji: "🍹", oneLiner: "পুদিনা, লেবু আর সোডা, অনেকটা বরফ দিয়ে।" },
    { title: "কোল্ড কফি", emoji: "🧋", oneLiner: "ফেনা-ওঠা, ঠান্ডা আর ক্যাফের মতো মিষ্টি।" },
    { title: "লেবুর শরবত", emoji: "🍋", oneLiner: "এক চিমটে জিরে দেওয়া টক-মিষ্টি শরবত।" },
    { title: "কলার শেক", emoji: "🍌", oneLiner: "ঘন আর পেট-ভরা, দু'মিনিটে তৈরি।" },
    { title: "মশলা ঘোল", emoji: "🥛", oneLiner: "গরমের দিনে ঠান্ডা করা মশলাদার ঘোল।" },
    { title: "হলুদ দুধ", emoji: "🌙", oneLiner: "আরামের রাতের জন্য গরম হলুদ-দুধ।" },
  ],
};

/** Eight dish ideas for the Surprise Me wheel (docs/04 §4 POST /api/surprise). */
export async function surpriseIdeas(
  req: SurpriseRequest,
  signal?: AbortSignal,
): Promise<SurpriseIdea[]> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 500));
    return (req.category === "drink" ? MOCK_DRINK_IDEAS : MOCK_IDEAS)[req.locale];
  }
  const prompt = buildSurprisePrompt(req);
  const { ideas } =
    aiProvider() === "gemini"
      ? await geminiStructured([{ text: prompt }], SurpriseIdeasSchema, SURPRISE_PROMPT, signal)
      : await claudeStructured(
          [{ type: "text", text: prompt }],
          SurpriseIdeasSchema,
          SURPRISE_PROMPT,
          signal,
        );
  return tidyIdeas(ideas);
}
