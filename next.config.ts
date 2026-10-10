import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const dev = process.env.NODE_ENV !== "production";
const supabase = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "";
  }
})();

/**
 * Content Security Policy (docs/04 §6). Nothing loads from other sites except the project's own
 * Supabase (API, realtime socket, private photos, share cards). Scripts allow 'unsafe-inline'
 * because Next.js streams inline bootstrap scripts; per-request nonces would make every page
 * dynamic (no static kitchen, no ISR). The real XSS defences: React escaping, no raw HTML from the
 * model, and JSON-LD escaped (sharedRecipe.ts). 'wasm-unsafe-eval' is for the physics engine.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${supabase ? ` https://${supabase}` : ""}`,
  "font-src 'self'",
  `connect-src 'self'${supabase ? ` https://${supabase} wss://${supabase}` : ""}${dev ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Voice input needs the microphone; nothing needs the camera API (scans use the file picker).
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A stray package-lock.json in the user's home dir otherwise makes Next guess the wrong root.
  outputFileTracingRoot: __dirname,
  // The e2e tests build into their own folder (NEXT_DIST_DIR=.next-test), so a test build can't
  // overwrite the files a running `pnpm dev` is serving (that showed up as 500 errors).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  experimental: {
    // Import only the icons/components used, not the whole barrel. Next does this for some icon
    // packages by default but not for Phosphor: without it `pnpm dev` compiled ~12k modules per
    // page (85 s for the kitchen), and header links seemed dead while a page compiled.
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
