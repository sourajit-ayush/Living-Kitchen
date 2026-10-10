import { AISLES, type Aisle } from "./pantry";

type Item = { name: string; qty?: string; aisle: Aisle; checked: boolean };

/** The list as plain text, aisle by aisle (for WhatsApp, notes, a message to whoever's shopping). */
export function listAsText(
  items: Item[],
  title: string,
  aisleName: (aisle: Aisle) => string,
): string {
  const lines = [title];
  for (const aisle of AISLES) {
    const rows = items.filter((i) => i.aisle === aisle && !i.checked);
    if (!rows.length) continue;
    lines.push("", aisleName(aisle));
    for (const i of rows) lines.push(`• ${i.name}${i.qty ? ` (${i.qty})` : ""}`);
  }
  return lines.join("\n");
}

const AISLE_EMOJI: Record<Aisle, string> = {
  produce: "🥬",
  dairy: "🥛",
  protein: "🥚",
  grains: "🌾",
  spices: "🌶️",
  sauces: "🫙",
  other: "🛒",
};

/**
 * The list for WhatsApp: a bold title with the count, then each aisle as a bold heading with an
 * emoji, so whoever does the shopping can walk the shop aisle by aisle. Ticked items are left out.
 */
export function listAsWhatsApp(
  items: Item[],
  title: string,
  countLabel: string,
  aisleName: (aisle: Aisle) => string,
): string {
  const lines = [`*🛒 ${title}* (${countLabel})`];
  for (const aisle of AISLES) {
    const rows = items.filter((i) => i.aisle === aisle && !i.checked);
    if (!rows.length) continue;
    lines.push("", `*${AISLE_EMOJI[aisle]} ${aisleName(aisle)}*`);
    for (const i of rows) lines.push(`• ${i.name}${i.qty ? ` (${i.qty})` : ""}`);
  }
  return lines.join("\n");
}

/** A WhatsApp link that opens the app (or web) with the text ready to send to anyone. */
export function whatsappTextUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
