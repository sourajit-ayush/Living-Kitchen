import { INGREDIENTS_BY_ID } from "@/data/ingredients";
import type { Recipe } from "@/lib/ai/schema";
import { fontStack, wrap } from "./canvasText";

/**
 * Share cards (R5), drawn in the browser so Hindi (Devanagari) shapes correctly and the cards
 * use the site's own fonts: the counter at golden hour with the recipe's ingredients on it, the
 * dish title in Fraunces, time and servings, the ingredient list and the site's name.
 *
 * - og 1200×630: the link preview (WhatsApp, iMessage, X, Facebook…), stored with the share.
 * - feed 1080×1350 and story 1080×1920: pictures for the share sheet and downloads.
 */
export type CardFormat = "og" | "feed" | "story";
export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  feed: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
};

export type CardWords = {
  minutes: (n: number) => string;
  serves: (n: number) => string;
  more: (n: number) => string;
  footer: string;
  host: string;
  difficulty: string;
};

const PAPER = "#FFF6EB";
const INK = "#2B1D14";
const MUTED = "#6B5B4E";
const ACCENT = "#C8432A";

let poster: Promise<HTMLImageElement> | null = null;
/** The counter at golden hour (the same still the page shows before the 3D loads). */
function loadPoster(): Promise<HTMLImageElement> {
  poster ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = "/hero-poster.webp";
  });
  return poster;
}

function cover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) * 0.35, sw, sh, x, y, w, h);
}

/** Emoji "on the counter": the recipe's own ingredients, as little cream discs. */
function counterChips(
  ctx: CanvasRenderingContext2D,
  recipe: Recipe,
  x: number,
  y: number,
  size: number,
  maxW: number,
) {
  const emojis = recipe.ingredients
    .filter((i) => i.status !== "basic")
    .map((i) => (i.ingredient_id && INGREDIENTS_BY_ID.get(i.ingredient_id)?.emoji) || null)
    .filter((e): e is string => !!e)
    .filter((e, i, all) => all.indexOf(e) === i);
  const count = Math.min(emojis.length, Math.floor(maxW / (size * 1.18)));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < count; i++) {
    const cx = x + size / 2 + i * size * 1.18;
    ctx.fillStyle = "rgba(255, 248, 238, 0.92)";
    ctx.beginPath();
    ctx.arc(cx, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${size * 0.56}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;
    ctx.fillText(emojis[i], cx, y + size * 0.04);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function amount(i: Recipe["ingredients"][number]) {
  return i.quantity !== null ? `${i.quantity} ${i.unit}`.replace(/ piece$/, "") : "";
}

/** Paint one card. Fonts should already be loaded (see `loadCardFonts`). */
export function paintCard(
  canvas: HTMLCanvasElement,
  recipe: Recipe,
  format: CardFormat,
  words: CardWords,
  photo: HTMLImageElement | null,
) {
  const { width: W, height: H } = CARD_SIZES[format];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const display = fontStack("--font-display", "Georgia, serif");
  const body = fontStack("--font-body", "system-ui, sans-serif");
  const hand = fontStack("--font-hand", "cursive");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // Layout per format: the picture of the counter, then the words.
  const landscape = format === "og";
  const pic = landscape
    ? { x: 0, y: 0, w: 500, h: H }
    : { x: 0, y: 0, w: W, h: format === "story" ? 860 : 540 };
  if (photo) cover(ctx, photo, pic.x, pic.y, pic.w, pic.h);
  else {
    ctx.fillStyle = "#E9C9A0";
    ctx.fillRect(pic.x, pic.y, pic.w, pic.h);
  }
  // soft warm fade into the paper
  const fade = landscape
    ? ctx.createLinearGradient(pic.w - 120, 0, pic.w, 0)
    : ctx.createLinearGradient(0, pic.h - 160, 0, pic.h);
  fade.addColorStop(0, "rgba(255, 246, 235, 0)");
  fade.addColorStop(1, PAPER);
  ctx.fillStyle = fade;
  if (landscape) ctx.fillRect(pic.w - 120, 0, 120, H);
  else ctx.fillRect(0, pic.h - 160, W, 160);
  const chip = landscape ? 62 : format === "story" ? 96 : 82;
  counterChips(
    ctx,
    recipe,
    pic.x + 36,
    landscape ? H - 70 : pic.h - chip * 0.9,
    chip,
    pic.w - 72 - (landscape ? 90 : 0),
  );

  const x = landscape ? pic.w + 20 : 72;
  const maxW = W - x - (landscape ? 56 : 72);
  let y = landscape ? 70 : pic.h + 40;
  const scale = format === "story" ? 1.25 : 1;

  ctx.fillStyle = ACCENT;
  ctx.font = `600 ${Math.round(22 * scale)}px ${body}`;
  ctx.fillText(recipe.cuisine.toUpperCase(), x, y, maxW);
  y += Math.round(16 * scale);

  ctx.fillStyle = INK;
  const titleSize = Math.round((landscape ? 56 : 76) * scale);
  ctx.font = `600 ${titleSize}px ${display}`;
  for (const line of wrap(ctx, recipe.title, maxW, landscape ? 2 : 3)) {
    y += Math.round(titleSize * 1.08);
    ctx.fillText(line, x, y);
  }

  y += Math.round(20 * scale);
  ctx.fillStyle = MUTED;
  const tagSize = Math.round((landscape ? 25 : 32) * scale);
  ctx.font = `400 ${tagSize}px ${body}`;
  for (const line of wrap(ctx, recipe.tagline, maxW, 2)) {
    y += Math.round(tagSize * 1.35);
    ctx.fillText(line, x, y);
  }

  y += Math.round(44 * scale);
  ctx.fillStyle = "#5A3E2B";
  ctx.font = `600 ${Math.round((landscape ? 24 : 30) * scale)}px ${body}`;
  ctx.fillText(
    [
      words.minutes(recipe.prep_minutes + recipe.cook_minutes),
      words.serves(recipe.servings),
      words.difficulty,
    ].join("  ·  "),
    x,
    y,
    maxW,
  );

  // Ingredients: one column on the link card, two on the tall ones.
  const list = recipe.ingredients.filter((i) => i.status !== "basic");
  const cols = landscape ? 1 : 2;
  const rows = landscape ? 4 : format === "story" ? 8 : 5;
  const shown = list.slice(0, rows * cols);
  const lineH = Math.round((landscape ? 34 : 44) * scale);
  const colW = maxW / cols;
  const itemSize = Math.round((landscape ? 23 : 28) * scale);
  y += Math.round(26 * scale);
  shown.forEach((ing, i) => {
    const col = Math.floor(i / rows);
    const row = i % rows;
    const ix = x + col * colW;
    const iy = y + (row + 1) * lineH;
    ctx.fillStyle = ACCENT;
    ctx.font = `600 ${itemSize}px ${body}`;
    ctx.fillText("•", ix, iy);
    ctx.fillStyle = INK;
    ctx.font = `400 ${itemSize}px ${body}`;
    const a = amount(ing);
    const label = a ? `${ing.name} · ${a}` : ing.name;
    ctx.fillText(label, ix + itemSize * 0.9, iy, colW - itemSize * 1.4);
  });
  if (list.length > shown.length) {
    ctx.fillStyle = MUTED;
    ctx.font = `500 ${itemSize}px ${body}`;
    const row = Math.min(rows, Math.ceil(shown.length / cols));
    ctx.fillText(words.more(list.length - shown.length), x, y + (row + 1) * lineH + 6, maxW);
  }

  // Footer: the kitchen's name, handwritten, and where to find it.
  const fy = H - (landscape ? 40 : 64 * scale);
  ctx.fillStyle = "#4E7A3A";
  ctx.font = `600 ${Math.round((landscape ? 32 : 42) * scale)}px ${hand}`;
  ctx.fillText(words.footer, x, fy, maxW * 0.62);
  ctx.fillStyle = MUTED;
  ctx.font = `500 ${Math.round((landscape ? 20 : 26) * scale)}px ${body}`;
  ctx.textAlign = "right";
  ctx.fillText(words.host, W - (landscape ? 56 : 72), fy, maxW * 0.36);
  ctx.textAlign = "left";
}

/** Load the faces this recipe's text needs (incl. Devanagari), and the poster. */
export async function loadCardFonts(recipe: Recipe, words: CardWords) {
  const fonts = document.fonts;
  const text = [recipe.title, recipe.tagline, recipe.cuisine, words.footer, words.difficulty]
    .concat(recipe.ingredients.map((i) => i.name))
    .join(" ");
  if (fonts) {
    await Promise.all([
      fonts.load(`600 56px ${fontStack("--font-display", "serif")}`, text),
      fonts.load(`400 28px ${fontStack("--font-body", "sans-serif")}`, text),
      fonts.load(`600 28px ${fontStack("--font-body", "sans-serif")}`, text),
      fonts.load(`600 40px ${fontStack("--font-hand", "cursive")}`, words.footer),
    ]).catch(() => undefined);
  }
  return loadPoster().catch(() => null);
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.86): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode failed"))),
      "image/jpeg",
      quality,
    ),
  );
}
