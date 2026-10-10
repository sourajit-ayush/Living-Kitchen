import { BN_ALIASES, BN_NAMES } from "./ingredientNamesBn";
import { INGREDIENT_MODELS } from "./ingredientModels";

export type IngredientCategory =
  "veg" | "fruit" | "dairy" | "protein" | "grain" | "spice" | "sauce" | "other";

export type Ingredient = {
  id: string;
  names: { en: string; hi: string; bn: string };
  /** Lower-case alternative spellings: Hinglish, US/UK names, irregular plurals */
  aliases: string[];
  category: IngredientCategory;
  emoji: string;
  /** Key of a real model in public/models/ingredients (data/ingredientModels.ts), or null → clay blob */
  model: string | null;
};

/** Clay-blob fallback colours from docs/06-assets.md §2 (+ "sauce", added in Phase 1.3) */
export const CATEGORY_COLORS: Record<IngredientCategory, string> = {
  veg: "#6FA35A",
  fruit: "#F2A03D",
  dairy: "#F4ECDD",
  protein: "#D98B6A",
  grain: "#D9B77A",
  spice: "#C0512E",
  sauce: "#9C3B2A",
  other: "#B8A48E",
};

type Row = [id: string, en: string, hi: string, emoji: string, aliases?: string[]];

// prettier-ignore
const ROWS: Record<IngredientCategory, Row[]> = {
  veg: [
    ["tomato", "Tomato", "टमाटर", "🍅", ["tamatar"]],
    ["onion", "Onion", "प्याज़", "🧅", ["pyaz", "pyaaz", "kanda", "pyaj"]],
    ["potato", "Potato", "आलू", "🥔", ["aloo", "alu"]],
    ["garlic", "Garlic", "लहसुन", "🧄", ["lehsun", "lahsun"]],
    ["ginger", "Ginger", "अदरक", "🫚", ["adrak"]],
    ["green-chilli", "Green chilli", "हरी मिर्च", "🌶️", ["hari mirch", "green chili", "chilli", "chili", "mirchi"]],
    ["capsicum", "Capsicum", "शिमला मिर्च", "🫑", ["bell pepper", "shimla mirch", "green pepper"]],
    ["carrot", "Carrot", "गाजर", "🥕", ["gajar"]],
    ["spinach", "Spinach", "पालक", "🥬", ["palak"]],
    ["cauliflower", "Cauliflower", "फूलगोभी", "🥦", ["gobi", "phool gobi", "gobhi"]],
    ["cabbage", "Cabbage", "पत्तागोभी", "🥬", ["patta gobi", "band gobhi"]],
    ["peas", "Green peas", "मटर", "🫛", ["matar", "pea", "peas"]],
    ["coriander", "Coriander leaves", "हरा धनिया", "🌿", ["dhania", "dhaniya", "cilantro", "coriander"]],
    ["mint", "Mint", "पुदीना", "🌿", ["pudina"]],
    ["cucumber", "Cucumber", "खीरा", "🥒", ["kheera", "khira"]],
    ["mushroom", "Mushroom", "मशरूम", "🍄", []],
    ["brinjal", "Brinjal", "बैंगन", "🍆", ["baingan", "eggplant", "aubergine"]],
    ["okra", "Okra", "भिंडी", "🫛", ["bhindi", "ladyfinger", "lady finger", "ladies finger"]],
    ["corn", "Sweet corn", "भुट्टा", "🌽", ["makai", "bhutta", "sweetcorn", "corn", "maize"]],
    ["beetroot", "Beetroot", "चुकंदर", "🫜", ["chukandar", "beet"]],
    ["radish", "Radish", "मूली", "🫜", ["mooli", "muli"]],
    ["sweet-potato", "Sweet potato", "शकरकंद", "🍠", ["shakarkand"]],
    ["pumpkin", "Pumpkin", "कद्दू", "🎃", ["kaddu", "sitaphal"]],
    ["bottle-gourd", "Bottle gourd", "लौकी", "🥒", ["lauki", "doodhi", "ghiya"]],
    ["bitter-gourd", "Bitter gourd", "करेला", "🥒", ["karela"]],
    ["ridge-gourd", "Ridge gourd", "तोरई", "🥒", ["turai", "tori"]],
    ["french-beans", "French beans", "फ्रेंच बीन्स", "🫛", ["beans", "green beans", "phali"]],
    ["methi", "Fenugreek leaves", "मेथी", "🌿", ["methi leaves", "fenugreek"]],
    ["curry-leaves", "Curry leaves", "करी पत्ता", "🌿", ["kadi patta", "curry patta"]],
    ["spring-onion", "Spring onion", "हरा प्याज़", "🧅", ["scallion", "green onion", "hara pyaz"]],
    ["broccoli", "Broccoli", "ब्रोकली", "🥦", []],
    ["zucchini", "Zucchini", "ज़ुकीनी", "🥒", ["courgette"]],
    ["lettuce", "Lettuce", "सलाद पत्ता", "🥬", []],
    ["drumstick", "Drumstick", "सहजन", "🫛", ["moringa", "sahjan"]],
    ["raw-banana", "Raw banana", "कच्चा केला", "🍌", ["kachha kela", "plantain"]],
    ["jackfruit", "Raw jackfruit", "कटहल", "🍈", ["kathal"]],
    ["colocasia", "Colocasia", "अरबी", "🥔", ["arbi", "taro"]],
    ["yam", "Elephant yam", "सूरन", "🍠", ["suran", "jimikand"]],
    ["raw-mango", "Raw mango", "कच्चा आम", "🥭", ["kairi", "kachha aam", "green mango"]],
    ["sprouts", "Moong sprouts", "अंकुरित मूंग", "🌱", ["sprouts", "bean sprouts", "ankurit"]],
  ],
  fruit: [
    ["lemon", "Lemon", "नींबू", "🍋", ["nimbu", "lime", "neembu"]],
    ["banana", "Banana", "केला", "🍌", ["kela"]],
    ["apple", "Apple", "सेब", "🍎", ["seb"]],
    ["mango", "Mango", "आम", "🥭", ["aam", "mangoes"]],
    ["orange", "Orange", "संतरा", "🍊", ["santra"]],
    ["pineapple", "Pineapple", "अनानास", "🍍", ["ananas"]],
    ["pomegranate", "Pomegranate", "अनार", "🍎", ["anar"]],
    ["grapes", "Grapes", "अंगूर", "🍇", ["angoor"]],
    ["coconut", "Coconut", "नारियल", "🥥", ["nariyal", "grated coconut"]],
    ["avocado", "Avocado", "एवोकाडो", "🥑", []],
    ["strawberry", "Strawberry", "स्ट्रॉबेरी", "🍓", ["strawberries"]],
    ["papaya", "Papaya", "पपीता", "🍈", ["papita"]],
    ["dates", "Dates", "खजूर", "🌴", ["khajur"]],
    ["raisins", "Raisins", "किशमिश", "🍇", ["kishmish"]],
    ["tamarind", "Tamarind", "इमली", "🟤", ["imli"]],
    ["watermelon", "Watermelon", "तरबूज़", "🍉", ["tarbooz"]],
    ["guava", "Guava", "अमरूद", "🍐", ["amrood", "amrud"]],
  ],
  dairy: [
    ["milk", "Milk", "दूध", "🥛", ["doodh", "dudh"]],
    ["ice-cream", "Ice cream", "आइसक्रीम", "🍨", ["icecream", "vanilla ice cream", "kulfi"]],
    ["paneer", "Paneer", "पनीर", "🧀", ["panir", "cottage cheese"]],
    ["curd", "Curd", "दही", "🥣", ["dahi", "yogurt", "yoghurt", "plain yogurt"]],
    ["butter", "Butter", "मक्खन", "🧈", ["makhan", "makkhan"]],
    ["ghee", "Ghee", "घी", "🫙", ["clarified butter"]],
    ["cheese", "Cheese", "चीज़", "🧀", ["cheddar", "processed cheese"]],
    ["mozzarella", "Mozzarella", "मोज़रेला", "🧀", []],
    ["cream", "Fresh cream", "मलाई", "🥛", ["malai", "cream", "heavy cream"]],
    ["buttermilk", "Buttermilk", "छाछ", "🥛", ["chaas", "chhaas", "mattha"]],
    ["khoya", "Khoya", "खोया", "🧀", ["mawa", "khoa"]],
    ["condensed-milk", "Condensed milk", "कंडेंस्ड मिल्क", "🥫", ["milkmaid"]],
  ],
  protein: [
    ["egg", "Egg", "अंडा", "🥚", ["anda", "ande", "अंडे"]],
    ["chicken", "Chicken", "चिकन", "🍗", ["murgh", "murga"]],
    ["mutton", "Mutton", "मटन", "🍖", ["goat", "lamb", "gosht"]],
    ["fish", "Fish", "मछली", "🐟", ["machli", "machhli"]],
    ["prawns", "Prawns", "झींगा", "🦐", ["jhinga", "shrimp"]],
    ["tofu", "Tofu", "टोफू", "⬜", []],
    ["soya-chunks", "Soya chunks", "सोया चंक्स", "🟤", ["soya", "nutrela", "soy chunks"]],
    ["peanuts", "Peanuts", "मूंगफली", "🥜", ["moongphali", "groundnut"]],
    ["cashews", "Cashews", "काजू", "🥜", ["kaju"]],
    ["almonds", "Almonds", "बादाम", "🌰", ["badam"]],
    ["walnuts", "Walnuts", "अखरोट", "🌰", ["akhrot"]],
    ["bacon", "Bacon", "बेकन", "🥓", []],
    ["sausage", "Sausage", "सॉसेज", "🌭", []],
    ["tuna", "Tuna", "टूना", "🐟", []],
  ],
  grain: [
    ["rice", "Rice", "चावल", "🍚", ["chawal", "basmati"]],
    // leftovers (feature: "Leftovers"): already cooked, made into something new
    ["cooked-rice", "Leftover rice", "बचे हुए चावल", "🍚", ["cooked rice", "leftover rice", "baasi chawal", "basi chawal", "bache chawal", "पके चावल", "बासी चावल"]],
    ["leftover-dal", "Leftover dal", "बची हुई दाल", "🥣", ["cooked dal", "bachi dal", "basi dal", "बासी दाल"]],
    ["leftover-roti", "Leftover rotis", "बची रोटियाँ", "🫓", ["leftover roti", "leftover rotis", "basi roti", "baasi roti", "leftover chapati", "बासी रोटी"]],
    ["leftover-sabzi", "Leftover sabzi", "बची सब्ज़ी", "🥘", ["cooked sabzi", "bachi sabzi", "leftover vegetables", "बची हुई सब्ज़ी"]],
    ["leftover-curry", "Leftover curry", "बची करी", "🍛", ["cooked curry", "leftover gravy"]],
    ["leftover-chicken", "Leftover chicken", "बचा चिकन", "🍗", ["cooked chicken", "roast chicken", "chicken curry leftover"]],
    ["leftover-pasta", "Leftover pasta", "बचा पास्ता", "🍝", ["cooked pasta", "cooked noodles", "leftover noodles"]],
    ["stale-bread", "Stale bread", "बासी ब्रेड", "🍞", ["leftover bread", "old bread", "basi bread", "dry bread"]],
    ["atta", "Wheat flour", "आटा", "🌾", ["atta", "whole wheat flour", "gehun ka atta"]],
    ["maida", "All-purpose flour", "मैदा", "🌾", ["all purpose flour", "plain flour", "flour"]],
    ["besan", "Gram flour", "बेसन", "🌾", ["gram flour", "chickpea flour"]],
    ["suji", "Semolina", "सूजी", "🌾", ["sooji", "rava", "semolina"]],
    ["poha", "Poha", "पोहा", "🍚", ["flattened rice", "chivda", "beaten rice"]],
    ["bread", "Bread", "ब्रेड", "🍞", ["pav", "bread slices", "double roti"]],
    ["pasta", "Pasta", "पास्ता", "🍝", ["penne", "spaghetti", "macaroni"]],
    ["noodles", "Noodles", "नूडल्स", "🍜", ["maggi", "hakka noodles"]],
    ["oats", "Oats", "ओट्स", "🥣", ["rolled oats"]],
    ["dal", "Toor dal", "अरहर दाल", "🫘", ["toor dal", "arhar dal", "lentils", "daal", "tur dal", "dal"]],
    ["moong-dal", "Moong dal", "मूंग दाल", "🫘", ["moong", "mung dal", "yellow moong"]],
    ["masoor-dal", "Masoor dal", "मसूर दाल", "🫘", ["masoor", "red lentils"]],
    ["urad-dal", "Urad dal", "उड़द दाल", "🫘", ["urad"]],
    ["chana-dal", "Chana dal", "चना दाल", "🫘", ["split chickpeas"]],
    ["chickpeas", "Chickpeas", "छोले", "🫘", ["chole", "kabuli chana", "chana", "garbanzo"]],
    ["rajma", "Kidney beans", "राजमा", "🫘", ["rajma", "red beans"]],
    ["millet", "Millet", "बाजरा", "🌾", ["bajra", "jowar", "ragi"]],
    ["quinoa", "Quinoa", "किनोआ", "🌾", []],
    ["tortilla", "Tortilla", "टॉर्टिला", "🫓", ["wrap"]],
    ["roti", "Roti", "रोटी", "🫓", ["chapati", "chapatti", "phulka", "leftover roti"]],
    ["vermicelli", "Vermicelli", "सेवई", "🍜", ["seviyan", "sevai"]],
    ["sabudana", "Sago pearls", "साबूदाना", "⚪", ["sabudana", "sago", "tapioca pearls"]],
    ["makhana", "Fox nuts", "मखाना", "⚪", ["makhana", "lotus seeds", "phool makhana"]],
    ["breadcrumbs", "Breadcrumbs", "ब्रेड क्रम्ब्स", "🍞", ["bread crumbs", "panko"]],
  ],
  spice: [
    ["salt", "Salt", "नमक", "🧂", ["namak"]],
    ["turmeric", "Turmeric", "हल्दी", "🟡", ["haldi"]],
    ["cumin", "Cumin seeds", "जीरा", "🟤", ["jeera", "zeera", "cumin"]],
    ["mustard-seeds", "Mustard seeds", "राई", "⚫", ["rai", "sarson", "mustard"]],
    ["red-chilli-powder", "Red chilli powder", "लाल मिर्च", "🌶️", ["lal mirch", "chilli powder", "red chili powder", "kashmiri mirch"]],
    ["coriander-powder", "Coriander powder", "धनिया पाउडर", "🟤", ["dhania powder"]],
    ["garam-masala", "Garam masala", "गरम मसाला", "🟤", []],
    ["hing", "Asafoetida", "हींग", "🟡", ["hing", "heeng"]],
    ["black-pepper", "Black pepper", "काली मिर्च", "⚫", ["kali mirch", "pepper"]],
    ["cardamom", "Cardamom", "इलायची", "🟢", ["elaichi", "ilaichi"]],
    ["cinnamon", "Cinnamon", "दालचीनी", "🟤", ["dalchini"]],
    ["cloves", "Cloves", "लौंग", "🟤", ["laung", "clove"]],
    ["bay-leaf", "Bay leaf", "तेज पत्ता", "🍃", ["tej patta", "bay leaves"]],
    ["kasuri-methi", "Kasuri methi", "कसूरी मेथी", "🍃", ["dried fenugreek"]],
    ["ajwain", "Carom seeds", "अजवाइन", "🟤", ["ajwain", "ajwain seeds"]],
    ["fennel", "Fennel seeds", "सौंफ", "🟢", ["saunf", "fennel"]],
    ["chaat-masala", "Chaat masala", "चाट मसाला", "🟤", []],
    ["sambar-powder", "Sambar powder", "सांबर मसाला", "🟤", ["sambar masala"]],
    ["masala-dabba", "Spice box", "मसाला डब्बा", "🫙", ["masala dabba", "spices"]],
    ["oregano", "Oregano", "ओरिगैनो", "🌿", ["mixed herbs", "italian seasoning"]],
    ["chilli-flakes", "Chilli flakes", "चिली फ्लेक्स", "🌶️", ["red chilli flakes", "chili flakes"]],
    ["basil", "Basil", "तुलसी", "🌿", ["tulsi"]],
    ["sesame", "Sesame seeds", "तिल", "⚪", ["til", "sesame"]],
    ["amchur", "Dry mango powder", "अमचूर", "🟤", ["amchur", "amchoor", "mango powder"]],
    ["saffron", "Saffron", "केसर", "🟠", ["kesar", "zafran"]],
    ["nutmeg", "Nutmeg", "जायफल", "🟤", ["jaiphal"]],
    ["star-anise", "Star anise", "चक्र फूल", "⭐", ["chakra phool", "badiyan"]],
  ],
  sauce: [
    ["ketchup", "Tomato ketchup", "केचप", "🥫", ["ketchup", "tomato sauce"]],
    ["soy-sauce", "Soy sauce", "सोया सॉस", "🫙", ["soya sauce", "dark soy sauce", "light soy sauce"]],
    ["green-chilli-sauce", "Green chilli sauce", "ग्रीन चिली सॉस", "🌶️", ["green chili sauce", "hari mirch sauce"]],
    ["red-chilli-sauce", "Red chilli sauce", "रेड चिली सॉस", "🌶️", ["chilli sauce", "chili sauce", "red chili sauce", "lal mirch sauce"]],
    ["schezwan-sauce", "Schezwan sauce", "शेज़वान सॉस", "🌶️", ["schezwan", "schezwan chutney", "szechuan sauce", "sichuan sauce"]],
    ["hot-sauce", "Hot sauce", "हॉट सॉस", "🌶️", ["sriracha", "tabasco", "chilli hot sauce"]],
    ["sweet-chilli-sauce", "Sweet chilli sauce", "स्वीट चिली सॉस", "🌶️", ["sweet chili sauce", "thai sweet chilli"]],
    ["tomato-chilli-sauce", "Tomato chilli sauce", "टोमैटो चिली सॉस", "🥫", ["hot and sweet sauce", "hot & sweet", "tomato chili sauce"]],
    ["pasta-sauce", "Pasta sauce", "पास्ता सॉस", "🍝", ["pizza sauce", "marinara", "arrabbiata", "red sauce"]],
    ["bbq-sauce", "Barbecue sauce", "बार्बेक्यू सॉस", "🍖", ["bbq sauce", "barbeque sauce", "bbq"]],
    ["oyster-sauce", "Oyster sauce", "ऑयस्टर सॉस", "🦪", []],
    ["fish-sauce", "Fish sauce", "फ़िश सॉस", "🐟", ["nam pla"]],
    ["worcestershire", "Worcestershire sauce", "वूस्टरशायर सॉस", "🫙", ["worcester sauce", "worcestershire"]],
    ["mustard-sauce", "Mustard sauce", "कसुंदी", "🟡", ["kasundi", "mustard paste", "dijon", "dijon mustard", "american mustard"]],
    ["peri-peri-sauce", "Peri-peri sauce", "पेरी-पेरी सॉस", "🌶️", ["peri peri", "piri piri", "peri peri sauce"]],
    ["chilli-oil", "Chilli oil", "चिली ऑयल", "🌶️", ["chili oil", "chilli crisp", "chili crisp"]],
    ["vinegar", "Vinegar", "सिरका", "🫙", ["sirka", "white vinegar", "apple cider vinegar"]],
    ["mayonnaise", "Mayonnaise", "मेयोनीज़", "🫙", ["mayo", "eggless mayo"]],
    ["green-chutney", "Green chutney", "हरी चटनी", "🫙", ["hari chutney", "mint chutney", "pudina chutney"]],
    ["tamarind-chutney", "Tamarind chutney", "इमली की चटनी", "🟤", ["imli chutney", "saunth", "sonth", "meethi chutney", "sweet chutney"]],
  ],
  other: [
    ["tea", "Tea leaves", "चायपत्ती", "🍵", ["chai patti", "chaipatti", "tea powder", "tea leaf", "chai"]],
    ["coffee", "Coffee", "कॉफ़ी", "☕", ["coffee powder", "instant coffee", "kaafi"]],
    ["ice", "Ice cubes", "बर्फ़", "🧊", ["ice cube", "barf", "baraf"]],
    ["soda-water", "Soda water", "सोडा वॉटर", "🫧", ["club soda", "sparkling water", "fizzy water"]],
    ["oil", "Cooking oil", "तेल", "🫗", ["tel", "oil", "vegetable oil", "refined oil", "sunflower oil"]],
    ["mustard-oil", "Mustard oil", "सरसों का तेल", "🫗", ["sarson ka tel"]],
    ["olive-oil", "Olive oil", "जैतून का तेल", "🫒", []],
    ["sugar", "Sugar", "चीनी", "🍬", ["cheeni", "chini", "shakkar"]],
    ["jaggery", "Jaggery", "गुड़", "🟫", ["gur", "gud"]],
    ["honey", "Honey", "शहद", "🍯", ["shahad"]],
    ["water", "Water", "पानी", "💧", ["pani"]],
    ["tomato-puree", "Tomato puree", "टमाटर प्यूरी", "🥫", ["tomato paste"]],
    ["pickle", "Pickle", "अचार", "🫙", ["achar", "achaar"]],
    ["baking-soda", "Baking soda", "खाने का सोडा", "🧂", ["soda", "meetha soda"]],
    ["baking-powder", "Baking powder", "बेकिंग पाउडर", "🧂", []],
    ["cornflour", "Cornflour", "कॉर्नफ्लोर", "🌽", ["corn starch", "cornstarch", "corn flour"]],
    ["cocoa", "Cocoa powder", "कोको पाउडर", "🍫", ["cocoa"]],
    ["chocolate", "Chocolate", "चॉकलेट", "🍫", ["dark chocolate"]],
    ["coconut-milk", "Coconut milk", "नारियल का दूध", "🥥", []],
    ["papad", "Papad", "पापड़", "🫓", ["papadum", "poppadom"]],
    ["eno", "Fruit salt", "ईनो", "🧂", ["eno"]],
    ["peanut-butter", "Peanut butter", "पीनट बटर", "🥜", []],
    ["rose-water", "Rose water", "गुलाब जल", "🌹", ["gulab jal"]],
  ],
};

export const INGREDIENTS: Ingredient[] = (Object.keys(ROWS) as IngredientCategory[]).flatMap(
  (category) =>
    ROWS[category].map(([id, en, hi, emoji, aliases = []]) => ({
      id,
      names: { en, hi, bn: BN_NAMES[id] ?? en },
      aliases: [...aliases, ...(BN_ALIASES[id] ?? [])],
      category,
      emoji,
      model: id in INGREDIENT_MODELS ? id : null,
    })),
);

export const INGREDIENTS_BY_ID: ReadonlyMap<string, Ingredient> = new Map(
  INGREDIENTS.map((i) => [i.id, i]),
);

/** F1 quick-add staples row, in display order */
export const STAPLE_IDS = [
  "salt",
  "oil",
  "onion",
  "garlic",
  "ginger",
  "tomato",
  "green-chilli",
  "turmeric",
  "cumin",
  "rice",
  "atta",
  "egg",
  "milk",
  "butter",
] as const;

/** Quick-add "Sauces" row, in display order */
export const SAUCE_IDS = [
  "ketchup",
  "soy-sauce",
  "green-chilli-sauce",
  "red-chilli-sauce",
  "schezwan-sauce",
  "vinegar",
  "mayonnaise",
  "green-chutney",
  "tamarind-chutney",
  "hot-sauce",
  "sweet-chilli-sauce",
  "pasta-sauce",
] as const;

/** Quick-add "Leftovers" row: already-cooked food the AI turns into something new */
export const LEFTOVER_IDS = [
  "cooked-rice",
  "leftover-dal",
  "leftover-roti",
  "leftover-sabzi",
  "leftover-curry",
  "leftover-chicken",
  "leftover-pasta",
  "stale-bread",
] as const;
const LEFTOVERS: ReadonlySet<string> = new Set(LEFTOVER_IDS);
export const isLeftover = (id: string | null | undefined) => !!id && LEFTOVERS.has(id);

/** Quick-add row when making drinks */
export const DRINK_IDS = [
  "tea",
  "coffee",
  "milk",
  "sugar",
  "ginger",
  "cardamom",
  "lemon",
  "mint",
  "ice",
  "honey",
  "curd",
  "mango",
  "banana",
  "soda-water",
  "ice-cream",
] as const;

/** Assumed basics the AI may always use (docs/04 system prompt) */
export const BASIC_IDS = ["salt", "water", "oil"] as const;
