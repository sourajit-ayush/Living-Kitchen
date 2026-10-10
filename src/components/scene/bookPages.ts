import * as THREE from "three";
import type { BookEntry } from "@/store/useBook";
import { fontStack, wrap } from "./cardTexture";
import type { Locale } from "@/i18n/routing";

export const PAGE_PX_W = 768;
export const PAGE_PX_H = 1056;

const PAPER = "#FBF5EA";
const INK = "#2B1D14";
const MUTED = "#6B5B4E";
const ACCENT = "#C8432A";

const WORDS = {
  en: {
    ingredients: "Ingredients",
    method: "Method",
    empty: "Your recipe book",
    emptyHint: "Save a recipe with the heart and it will be written in here.",
    minutes: "min",
    servings: "servings",
  },
  hi: {
    ingredients: "सामग्री",
    method: "विधि",
    empty: "आपकी रेसिपी बुक",
    emptyHint: "दिल दबाकर रेसिपी सहेजें, वो यहाँ लिख दी जाएगी।",
    minutes: "मिनट",
    servings: "लोग",
  },
  bn: {
    ingredients: "উপকরণ",
    method: "প্রণালী",
    empty: "আপনার রেসিপির খাতা",
    emptyHint: "হার্টে ট্যাপ করে রেসিপি সেভ করুন, এখানে লেখা হয়ে যাবে।",
    minutes: "মিনিট",
    servings: "জন",
  },
} satisfies Record<Locale, Record<string, string>>;

export type PageContent =
  | { kind: "left"; entry: BookEntry; index: number; count: number }
  | { kind: "right"; entry: BookEntry }
  | { kind: "blank"; locale: Locale; side: "left" | "right" };

/** Stable identity of a page's contents (texture cache key). */
export function pageId(p: PageContent): string {
  if (p.kind === "blank") return `blank-${p.locale}-${p.side}`;
  const e = p.entry;
  return `${p.kind}-${e.key}-${e.updatedAt}${p.kind === "left" ? `-${p.index}/${p.count}` : ""}`;
}

function paper(ctx: CanvasRenderingContext2D, side: "left" | "right") {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, PAGE_PX_W, PAGE_PX_H);
  // A soft shadow toward the spine, like a real gutter.
  const g =
    side === "left"
      ? ctx.createLinearGradient(PAGE_PX_W, 0, PAGE_PX_W - 90, 0)
      : ctx.createLinearGradient(0, 0, 90, 0);
  g.addColorStop(0, "rgba(90, 60, 30, 0.22)");
  g.addColorStop(1, "rgba(90, 60, 30, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PAGE_PX_W, PAGE_PX_H);
}

/** Paint one page of the book: the recipe's story on the left, its ingredients and method on the right. */
export function paintPage(canvas: HTMLCanvasElement, page: PageContent) {
  const ctx = canvas.getContext("2d")!;
  const display = fontStack("--font-display", "Georgia, serif");
  const body = fontStack("--font-body", "system-ui, sans-serif");
  const hand = fontStack("--font-hand", "cursive");
  const x = 70;
  const maxW = PAGE_PX_W - 2 * x;

  if (page.kind === "blank") {
    paper(ctx, page.side);
    if (page.side === "right") {
      const w = WORDS[page.locale];
      ctx.fillStyle = INK;
      ctx.font = `600 58px ${display}`;
      let y = 300;
      for (const line of wrap(ctx, w.empty, maxW, 2)) ctx.fillText(line, x, (y += 70));
      ctx.fillStyle = MUTED;
      ctx.font = `400 36px ${hand}`;
      y += 30;
      for (const line of wrap(ctx, w.emptyHint, maxW, 4)) ctx.fillText(line, x, (y += 50));
    }
    return;
  }

  const { recipe } = page.entry;
  const w = WORDS[recipe.locale];
  paper(ctx, page.kind);
  ctx.textBaseline = "alphabetic";

  if (page.kind === "left") {
    const e = page.entry;
    let y = 120;
    ctx.fillStyle = ACCENT;
    ctx.font = `600 26px ${body}`;
    ctx.fillText(recipe.cuisine.toUpperCase(), x, y, maxW);
    ctx.fillStyle = INK;
    ctx.font = `600 64px ${display}`;
    y += 20;
    for (const line of wrap(ctx, recipe.title, maxW, 3)) ctx.fillText(line, x, (y += 74));
    ctx.fillStyle = MUTED;
    ctx.font = `400 32px ${body}`;
    y += 24;
    for (const line of wrap(ctx, recipe.tagline, maxW, 4)) ctx.fillText(line, x, (y += 44));
    y += 50;
    ctx.fillStyle = "#8B6A4F";
    ctx.font = `500 30px ${body}`;
    ctx.fillText(
      `${recipe.prep_minutes + recipe.cook_minutes} ${w.minutes} · ${recipe.servings} ${w.servings}`,
      x,
      y,
      maxW,
    );
    if (e.rating) {
      y += 70;
      ctx.fillStyle = "#F4B23E";
      ctx.font = `48px ${body}`;
      ctx.fillText("★".repeat(e.rating) + "☆".repeat(5 - e.rating), x, y);
    }
    if (e.notes) {
      y += 70;
      ctx.fillStyle = "#4E7A3A";
      ctx.font = `400 40px ${hand}`;
      for (const line of wrap(ctx, e.notes, maxW, 6)) ctx.fillText(line, x, (y += 50));
    }
    ctx.fillStyle = MUTED;
    ctx.font = `400 26px ${body}`;
    ctx.fillText(`${page.index + 1} / ${page.count}`, x, PAGE_PX_H - 70);
    return;
  }

  // right: ingredients, then the method as far as it fits
  let y = 110;
  ctx.fillStyle = INK;
  ctx.font = `600 40px ${display}`;
  ctx.fillText(w.ingredients, x, y);
  ctx.font = `400 28px ${body}`;
  y += 14;
  for (const ing of recipe.ingredients.slice(0, 11)) {
    const amount = ing.quantity !== null ? `${ing.quantity} ${ing.unit}` : "";
    ctx.fillStyle = INK;
    ctx.fillText(`• ${ing.name}`, x, (y += 40), maxW - 160);
    ctx.fillStyle = MUTED;
    ctx.textAlign = "right";
    ctx.fillText(amount, PAGE_PX_W - x, y, 150);
    ctx.textAlign = "left";
  }
  y += 70;
  ctx.fillStyle = INK;
  ctx.font = `600 40px ${display}`;
  ctx.fillText(w.method, x, y);
  ctx.font = `400 27px ${body}`;
  ctx.fillStyle = INK;
  for (const step of recipe.steps) {
    const lines = wrap(ctx, `${step.n}. ${step.text}`, maxW, 3);
    if (y + 16 + lines.length * 36 > PAGE_PX_H - 60) break;
    y += 16;
    for (const line of lines) ctx.fillText(line, x, (y += 36));
  }
}

/** A page texture, repainted once the fonts it needs have loaded. */
export function pageTexture(page: PageContent): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_PX_W;
  canvas.height = PAGE_PX_H;
  paintPage(canvas, page);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const fonts = document.fonts;
  if (fonts && page.kind !== "blank") {
    const text = page.entry.recipe.title + page.entry.recipe.tagline + page.entry.notes;
    void Promise.all([
      fonts.load(`600 64px ${fontStack("--font-display", "serif")}`, text),
      fonts.load(`400 32px ${fontStack("--font-body", "sans-serif")}`, text),
      fonts.load(`400 40px ${fontStack("--font-hand", "cursive")}`, page.entry.notes || "a"),
    ])
      .catch(() => undefined)
      .then(() => {
        paintPage(canvas, page);
        texture.needsUpdate = true;
      });
  }
  return texture;
}
