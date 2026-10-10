import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The project keys live in .env.local (never printed).
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: the suite skips itself
}

/**
 * Row-level-security tests against the real Supabase project (pnpm test:rls). Kept out of the
 * normal unit run: they need the project keys and the network.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests-rls/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
