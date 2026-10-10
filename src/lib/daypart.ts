/**
 * Day/Night kitchen (R9): the scene's lighting follows the local time, or a manual choice.
 * Morning is cool and bright, golden hour (4–7 pm) is the default look, night is a pendant lamp
 * and a candle.
 */
export const DAYPARTS = ["morning", "golden", "night"] as const;
export type Daypart = (typeof DAYPARTS)[number];
export type DaypartSetting = "auto" | Daypart;

/** Local hour → part of day: night 7 pm–5 am, golden hour 4–7 pm, morning (and day) otherwise. */
export function daypartAt(hour: number): Daypart {
  if (hour >= 19 || hour < 5) return "night";
  if (hour >= 16) return "golden";
  return "morning";
}

export function effectiveDaypart(setting: DaypartSetting, date = new Date()): Daypart {
  return setting === "auto" ? daypartAt(date.getHours()) : setting;
}

export type LightingLook = {
  sunColor: string;
  sunIntensity: number;
  /** Sun position: elevation from the window side */
  sunPosition: [number, number, number];
  skyColor: string;
  groundColor: string;
  hemiIntensity: number;
  envIntensity: number;
  background: string;
  /** Multiplies the window's sky picture (night = deep blue) */
  windowTint: string;
  moon: number;
  lamp: number;
  candle: number;
  rays: number;
};

/** docs/03 §3 "Time of day". Tweened between over 1.2 s. */
export const LOOKS: Record<Daypart, LightingLook> = {
  morning: {
    sunColor: "#FFF1DC",
    sunIntensity: 2.4,
    sunPosition: [-2.2, 1.95, -1.5], // ~35° elevation
    skyColor: "#EAF0FA",
    groundColor: "#8B6A4F",
    hemiIntensity: 0.95,
    envIntensity: 1.05,
    background: "#F3EBE0",
    windowTint: "#FFFFFF",
    moon: 0,
    lamp: 0,
    candle: 0,
    rays: 0.55,
  },
  golden: {
    sunColor: "#FFC98A",
    sunIntensity: 2.2,
    sunPosition: [-2.6, 1.05, -1.6], // ~17°
    skyColor: "#FFE9CF",
    groundColor: "#8B6A4F",
    hemiIntensity: 0.75,
    envIntensity: 0.9,
    background: "#F1DFC6",
    windowTint: "#FFFFFF",
    moon: 0,
    lamp: 0,
    candle: 0,
    rays: 1,
  },
  night: {
    sunColor: "#9FB4E0",
    sunIntensity: 0,
    sunPosition: [-2.6, 1.05, -1.6],
    skyColor: "#3A3550",
    groundColor: "#2B1D14",
    hemiIntensity: 0.22,
    envIntensity: 0.22,
    background: "#1C140E",
    windowTint: "#26324F",
    moon: 1,
    lamp: 1,
    candle: 1,
    rays: 0,
  },
};

/** Ease the look from `a` to `b` (u in 0..1). Colours mix in sRGB, which reads fine for lighting. */
export function mixLooks(a: LightingLook, b: LightingLook, u: number): LightingLook {
  // Exact at the ends (no float drift: the final look is the target itself).
  const n = (x: number, y: number) => (u <= 0 ? x : u >= 1 ? y : x + (y - x) * u);
  const c = (x: string, y: string) => {
    const p = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
    const [r1, g1, b1] = p(x);
    const [r2, g2, b2] = p(y);
    const h = (v: number) => Math.round(v).toString(16).padStart(2, "0");
    return `#${h(n(r1, r2))}${h(n(g1, g2))}${h(n(b1, b2))}`;
  };
  return {
    sunColor: c(a.sunColor, b.sunColor),
    sunIntensity: n(a.sunIntensity, b.sunIntensity),
    sunPosition: a.sunPosition.map((v, i) => n(v, b.sunPosition[i])) as [number, number, number],
    skyColor: c(a.skyColor, b.skyColor),
    groundColor: c(a.groundColor, b.groundColor),
    hemiIntensity: n(a.hemiIntensity, b.hemiIntensity),
    envIntensity: n(a.envIntensity, b.envIntensity),
    background: c(a.background, b.background),
    windowTint: c(a.windowTint, b.windowTint),
    moon: n(a.moon, b.moon),
    lamp: n(a.lamp, b.lamp),
    candle: n(a.candle, b.candle),
    rays: n(a.rays, b.rays),
  };
}
