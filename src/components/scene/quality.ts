import type { GpuProbeResult } from "./gpuProbe.worker";

/** Quality tiers from docs/03 §7. "off" renders the static poster only. */
export const QUALITY_TIERS = ["high", "medium", "low", "off"] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];
export type QualitySetting = "auto" | QualityTier;

export type TierConfig = {
  dpr: number | [number, number];
  /** 0 = no shadow map (ContactShadows only) */
  shadowMapSize: number;
  maxBodies: number;
  steamSprites: number;
  godRays: boolean;
  dust: number;
};

export const TIERS: Record<Exclude<QualityTier, "off">, TierConfig> = {
  high: {
    dpr: [1, 2],
    shadowMapSize: 2048,
    maxBodies: 24,
    steamSprites: 5,
    godRays: true,
    dust: 60,
  },
  medium: {
    dpr: 1.25,
    shadowMapSize: 1024,
    maxBodies: 16,
    steamSprites: 3,
    godRays: true,
    dust: 25,
  },
  low: { dpr: 1, shadowMapSize: 0, maxBodies: 10, steamSprites: 2, godRays: false, dust: 0 },
};

export function stepDown(tier: QualityTier): QualityTier {
  return tier === "high" ? "medium" : tier === "medium" ? "low" : tier;
}

export type Environment = {
  no3dParam: boolean;
  webgl: boolean;
  /**
   * WebGL runs on the CPU (SwiftShader, llvmpipe, a blocklisted GPU), as in headless Chrome,
   * Lighthouse / PageSpeed Insights and some old phones. The scene would cost seconds of main
   * thread there, so "auto" shows the poster instead.
   */
  softwareGl: boolean;
  /** An integrated laptop GPU (Intel UHD/Iris): full post-processing is too heavy for "high". */
  integratedGpu: boolean;
  /** pointer: fine and a desktop-sized viewport */
  desktop: boolean;
  cores: number;
  /** navigator.deviceMemory in GB, when the browser exposes it */
  memoryGb?: number;
  saveData: boolean;
  /** "auto" only: the tier this GPU stepped down to on an earlier visit (see rememberTier). */
  learnedTier?: QualityTier;
};

/** The tier to start at before PerformanceMonitor has any measurements. */
export function initialTier(setting: QualitySetting, env: Environment): QualityTier {
  if (env.no3dParam || !env.webgl || setting === "off") return "off";
  if (setting !== "auto") return setting;
  if (env.softwareGl) return "off";
  if (env.saveData) return "low";
  if (env.memoryGb !== undefined && env.memoryGb <= 2) return "low";
  const guess: QualityTier =
    env.desktop && env.cores >= 8 && !env.integratedGpu ? "high" : "medium";
  // Start where this GPU settled last time, rather than stuttering until it steps down again.
  return env.learnedTier && rank(env.learnedTier) > rank(guess) ? env.learnedTier : guess;
}

const rank = (t: QualityTier) => QUALITY_TIERS.indexOf(t);
const LEARNED_KEY = "lk-tier-learned";
let currentGpu = "";

/**
 * "auto" stepped down on this GPU: remember it, so the next visit starts there. Keyed by the GPU
 * name, so switching Chrome to another graphics card starts fresh.
 */
export function rememberTier(
  tier: QualityTier,
  storage: Pick<Storage, "setItem"> = localStorage,
  gpu = currentGpu,
) {
  try {
    storage.setItem(LEARNED_KEY, JSON.stringify({ gpu, tier }));
  } catch {
    // private mode or storage full: just re-learn next time
  }
}

export function learnedTierFor(
  gpu: string,
  storage: Pick<Storage, "getItem"> = localStorage,
): QualityTier | undefined {
  try {
    const v = JSON.parse(storage.getItem(LEARNED_KEY) ?? "null") as { gpu?: string; tier?: string };
    if (v?.gpu === gpu && (v.tier === "medium" || v.tier === "low")) return v.tier;
  } catch {
    // unreadable: ignore
  }
  return undefined;
}

/**
 * `?no3d=1` sticks for the browser session (so in-app links that drop the query keep 2D);
 * `?no3d=0` turns 3D back on.
 */
export function stickyNo3d(
  param: string | null,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = sessionStorage,
): boolean {
  try {
    if (param === "1") storage.setItem("lk-no3d", "1");
    else if (param === "0") storage.removeItem("lk-no3d");
    return storage.getItem("lk-no3d") === "1";
  } catch {
    return param === "1";
  }
}

/**
 * Read the browser environment (client only). The WebGL probe runs in a worker where possible and
 * is skipped entirely when 3D is off anyway.
 */
export async function readEnvironment(setting: QualitySetting = "auto"): Promise<Environment> {
  const params = new URLSearchParams(window.location.search);
  const no3dParam = stickyNo3d(params.get("no3d"));
  const { webgl, softwareGl, integratedGpu, renderer } =
    no3dParam || setting === "off" ? NO_GL : await probeWebgl();
  currentGpu = renderer;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return {
    no3dParam,
    webgl,
    softwareGl,
    integratedGpu,
    desktop: window.matchMedia("(pointer: fine) and (min-width: 1024px)").matches,
    cores: nav.hardwareConcurrency ?? 4,
    memoryGb: nav.deviceMemory,
    saveData: !!nav.connection?.saveData,
    learnedTier: webgl ? learnedTierFor(renderer) : undefined,
  };
}

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

type Probe = { webgl: boolean; softwareGl: boolean; integratedGpu: boolean; renderer: string };
const NO_GL: Probe = { webgl: false, softwareGl: false, integratedGpu: false, renderer: "" };
const INTEGRATED_RENDERER = /intel(?!.*\barc\b)/i; // Intel Arc is a discrete GPU

function fromProbe(r: GpuProbeResult): Probe | null {
  if (!r.webgl) return null;
  return {
    webgl: true,
    softwareGl: !r.strict || SOFTWARE_RENDERER.test(r.renderer),
    integratedGpu: INTEGRATED_RENDERER.test(r.renderer),
    renderer: r.renderer,
  };
}

/** Is WebGL available at all, and is it hardware accelerated? */
async function probeWebgl(): Promise<Probe> {
  if (typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined") {
    const fromWorker = await new Promise<Probe | null>((resolve) => {
      let worker: Worker | undefined;
      const done = (p: Probe | null) => {
        worker?.terminate();
        resolve(p);
      };
      const timer = setTimeout(() => done(null), 4000);
      try {
        worker = new Worker(new URL("./gpuProbe.worker.ts", import.meta.url));
        worker.onmessage = (e: MessageEvent<GpuProbeResult>) => {
          clearTimeout(timer);
          done(fromProbe(e.data));
        };
        worker.onerror = () => {
          clearTimeout(timer);
          done(null);
        };
        worker.postMessage(null);
      } catch {
        clearTimeout(timer);
        done(null);
      }
    });
    if (fromWorker) return fromWorker;
  }
  return probeOnMainThread();
}

/** Fallback for browsers without WebGL on OffscreenCanvas. Blocks while the context starts up. */
function probeOnMainThread(): Probe {
  type GL = WebGLRenderingContext | WebGL2RenderingContext;
  const context = (attrs?: WebGLContextAttributes): GL | null => {
    const canvas = document.createElement("canvas");
    return (canvas.getContext("webgl2", attrs) ?? canvas.getContext("webgl", attrs)) as GL | null;
  };
  try {
    const strict = context({ failIfMajorPerformanceCaveat: true });
    const gl = strict ?? context();
    if (!gl) return NO_GL;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return fromProbe({ webgl: true, strict: !!strict, renderer })!;
  } catch {
    return NO_GL;
  }
}
