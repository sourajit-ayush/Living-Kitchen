import * as THREE from "three";
import { mulberry32 } from "./placement";

/**
 * Procedural canvas textures so the scene needs no downloads in Phase 2. The plan is to swap
 * in Poly Haven PBR textures (docs/06) once the composition is locked.
 */

const cache = new Map<string, THREE.Texture>();

function canvasTexture(
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
) {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

/** Butcher-block walnut: vertical strips of slightly different tone with fine grain. */
export function woodTexture(variant: "walnut" | "board" = "walnut") {
  return canvasTexture(`wood-${variant}`, 1024, 256, (ctx) => {
    const rand = mulberry32(variant === "walnut" ? 11 : 23);
    const base = variant === "walnut" ? [118, 80, 52] : [196, 150, 102];
    const strips = variant === "walnut" ? 18 : 7;
    const sw = 1024 / strips;
    for (let i = 0; i < strips; i++) {
      const k = 0.85 + rand() * 0.3;
      ctx.fillStyle = `rgb(${base[0] * k},${base[1] * k},${base[2] * k})`;
      ctx.fillRect(i * sw, 0, sw + 1, 256);
      // grain lines
      for (let g = 0; g < 26; g++) {
        const y = rand() * 256;
        ctx.strokeStyle = `rgba(40,22,12,${0.05 + rand() * 0.08})`;
        ctx.lineWidth = 0.6 + rand() * 1.2;
        ctx.beginPath();
        ctx.moveTo(i * sw, y);
        ctx.bezierCurveTo(
          i * sw + sw * 0.3,
          y + rand() * 6 - 3,
          i * sw + sw * 0.7,
          y + rand() * 6 - 3,
          (i + 1) * sw,
          y,
        );
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(30,18,10,0.25)";
      ctx.fillRect(i * sw, 0, 1.2, 256);
    }
    // a little wear: lighter patches
    for (let p = 0; p < 14; p++) {
      const g = ctx.createRadialGradient(
        rand() * 1024,
        rand() * 256,
        0,
        rand() * 1024,
        rand() * 256,
        60 + rand() * 80,
      );
      g.addColorStop(0, "rgba(255,230,190,0.08)");
      g.addColorStop(1, "rgba(255,230,190,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1024, 256);
    }
  });
}

/** Warm cream zellige tiles: hand-made variation per tile, soft grout. */
export function tileTexture() {
  const tex = canvasTexture("zellige", 512, 512, (ctx) => {
    const rand = mulberry32(5);
    ctx.fillStyle = "#d9c7ae";
    ctx.fillRect(0, 0, 512, 512);
    const n = 8;
    const s = 512 / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const k = 0.94 + rand() * 0.08;
        const g = ctx.createLinearGradient(x * s, y * s, x * s + s, y * s + s);
        g.addColorStop(0, `rgb(${250 * k},${236 * k},${214 * k})`);
        g.addColorStop(1, `rgb(${238 * k},${220 * k},${196 * k})`);
        ctx.fillStyle = g;
        ctx.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
        ctx.fillStyle = `rgba(255,255,255,${0.05 + rand() * 0.08})`;
        ctx.fillRect(x * s + 6, y * s + 6, s * 0.4, s * 0.25);
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Golden-hour sky for the window: deep apricot at the horizon, pale gold above, low sun. */
export function skyTexture() {
  return canvasTexture("sky-golden", 256, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#ffe9c4");
    g.addColorStop(0.55, "#ffc983");
    g.addColorStop(1, "#f29a5c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const sun = ctx.createRadialGradient(80, 190, 0, 80, 190, 90);
    sun.addColorStop(0, "rgba(255,250,230,1)");
    sun.addColorStop(0.3, "rgba(255,236,190,0.7)");
    sun.addColorStop(1, "rgba(255,220,160,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, 256, 256);
  });
}

/** Soft vertical light shaft for the fake god rays. */
export function rayTexture() {
  return canvasTexture("ray", 64, 256, (ctx) => {
    const v = ctx.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, "rgba(255,236,200,0.9)");
    v.addColorStop(1, "rgba(255,236,200,0)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 64, 256);
    const h = ctx.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, "rgba(0,0,0,1)");
    h.addColorStop(0.5, "rgba(0,0,0,0)");
    h.addColorStop(1, "rgba(0,0,0,1)");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = h;
    ctx.fillRect(0, 0, 64, 256);
  });
}

/** Small "+N" badge for the overflow basket. */
export function badgeTexture(text: string) {
  return canvasTexture(`badge-${text}`, 128, 64, (ctx) => {
    ctx.fillStyle = "#2b1d14";
    ctx.beginPath();
    ctx.roundRect(4, 4, 120, 56, 28);
    ctx.fill();
    ctx.fillStyle = "#fffbf5";
    ctx.font = "600 34px 'DM Sans',system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 64, 34);
  });
}
