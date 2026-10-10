import * as THREE from "three";
import { fontStack, wrap } from "@/lib/canvasText";

export { fontStack, wrap };

export type CardFace = {
  badge: string;
  badgeKind: "best_match" | "almost_there" | "wildcard";
  title: string;
  tagline: string;
  meta: string;
};

export const CARD_W = 512;
export const CARD_H = 690;

const BADGE: Record<CardFace["badgeKind"], { bg: string; fg: string }> = {
  best_match: { bg: "#4F7A3A", fg: "#ffffff" },
  almost_there: { bg: "#F6E3B0", fg: "#3B2A1D" },
  wildcard: { bg: "#3B2A1D", fg: "#FFF6EB" },
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Paint one recipe card (cream glass card, badge, title, tagline, meta) into a texture. */
export function paintCard(canvas: HTMLCanvasElement, face: CardFace) {
  const ctx = canvas.getContext("2d")!;
  const display = fontStack("--font-display", "Georgia, serif");
  const body = fontStack("--font-body", "system-ui, sans-serif");
  ctx.clearRect(0, 0, CARD_W, CARD_H);

  // card with a soft drop shadow
  ctx.save();
  ctx.shadowColor = "rgba(59, 42, 29, 0.25)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  roundRect(ctx, 16, 12, CARD_W - 32, CARD_H - 40, 36);
  ctx.fillStyle = "#FFF6EB";
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(139, 106, 79, 0.25)";
  ctx.lineWidth = 2;
  roundRect(ctx, 16, 12, CARD_W - 32, CARD_H - 40, 36);
  ctx.stroke();

  const x = 52;
  let y = 60;
  // badge
  ctx.font = `600 24px ${body}`;
  const badgeW = Math.min(CARD_W - 2 * x, ctx.measureText(face.badge).width + 36);
  const colors = BADGE[face.badgeKind];
  roundRect(ctx, x, y, badgeW, 42, 21);
  ctx.fillStyle = colors.bg;
  ctx.fill();
  ctx.fillStyle = colors.fg;
  ctx.textBaseline = "middle";
  ctx.fillText(face.badge, x + 18, y + 22, badgeW - 36);
  y += 82;

  // title
  ctx.fillStyle = "#2B1D14";
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 50px ${display}`;
  for (const line of wrap(ctx, face.title, CARD_W - 2 * x, 3)) {
    y += 56;
    ctx.fillText(line, x, y);
  }
  y += 28;

  // tagline
  ctx.fillStyle = "#6B5B4E";
  ctx.font = `400 27px ${body}`;
  for (const line of wrap(ctx, face.tagline, CARD_W - 2 * x, 4)) {
    y += 38;
    ctx.fillText(line, x, y);
  }

  // meta, pinned to the bottom
  ctx.fillStyle = "#8B6A4F";
  ctx.font = `500 25px ${body}`;
  ctx.fillText(face.meta, x, CARD_H - 72, CARD_W - 2 * x);
}

/** A texture for a card, repainted once the page fonts have loaded. */
export function cardTexture(face: CardFace): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  paintCard(canvas, face);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  // Load exactly the faces this text needs (e.g. Devanagari for Hindi titles), then repaint.
  const fonts = document.fonts;
  if (fonts) {
    const display = fontStack("--font-display", "Georgia, serif");
    const body = fontStack("--font-body", "system-ui, sans-serif");
    void Promise.all([
      fonts.load(`600 50px ${display}`, face.title),
      fonts.load(`400 27px ${body}`, face.tagline + face.badge + face.meta),
    ])
      .catch(() => undefined)
      .then(() => {
        paintCard(canvas, face);
        texture.needsUpdate = true;
      });
  }
  return texture;
}
