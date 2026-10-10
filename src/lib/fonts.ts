import {
  Caveat,
  DM_Sans,
  Fraunces,
  Noto_Sans_Bengali,
  Noto_Sans_Devanagari,
  Noto_Serif_Bengali,
  Noto_Serif_Devanagari,
} from "next/font/google";
import localFont from "next/font/local";

// Headings: optical size + weight only (65 kB). The SOFT/WONK axes doubled the file (118 kB) and
// only the hero uses them, so the hero gets its own pinned instance below.
export const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

export const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

// The handwritten accent: one weight (47 kB, was 73 kB for the 400–700 range), and not preloaded:
// it never sits in the first paint's critical path, so it shouldn't compete with the poster.
export const caveat = Caveat({
  subsets: ["latin"],
  weight: "400",
  preload: false,
  variable: "--font-caveat",
  display: "swap",
});

/**
 * The hero line: a static Fraunces instance (opsz 72, weight 600, SOFT 100, WONK 1), 17 kB, from
 * Google Fonts under the SIL OFL (src/fonts/OFL.txt). Same look as the variable axes it replaces.
 */
export const frauncesHero = localFont({
  src: "../fonts/fraunces-hero-latin.woff2",
  weight: "600",
  style: "normal",
  variable: "--font-fraunces-hero",
  display: "swap",
});

// Fraunces / DM Sans have no Devanagari glyphs. These are only downloaded when Hindi text renders
// (unicode-range), so they are not preloaded.
export const devanagariSans = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-devanagari-sans",
  display: "swap",
  preload: false,
});

export const devanagariSerif = Noto_Serif_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-devanagari-serif",
  display: "swap",
  preload: false,
});

// The same for Bengali (Bangla) text.
export const bengaliSans = Noto_Sans_Bengali({
  subsets: ["bengali"],
  variable: "--font-bengali-sans",
  display: "swap",
  preload: false,
});

export const bengaliSerif = Noto_Serif_Bengali({
  subsets: ["bengali"],
  variable: "--font-bengali-serif",
  display: "swap",
  preload: false,
});

export const fontVariables = [
  fraunces,
  frauncesHero,
  dmSans,
  caveat,
  devanagariSans,
  devanagariSerif,
  bengaliSans,
  bengaliSerif,
]
  .map((f) => f.variable)
  .join(" ");
