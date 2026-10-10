// `pnpm dev`: runs `next dev`, then visits every page once in the background so each one is
// compiled before you click it. Without this, the first click on a header link waits for that
// page to compile (seconds) and looks like a dead button.
import { spawn } from "node:child_process";

const port = process.env.PORT ?? "3000";
const PAGES = ["/en", "/en/list", "/en/pantry", "/en/book", "/en/settings", "/en/signin", "/hi"];

const next = spawn(`pnpm exec next dev -p ${port} ${process.argv.slice(2).join(" ")}`, {
  stdio: ["inherit", "pipe", "inherit"],
  shell: true,
});

let warmed = false;
next.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (!warmed && /Ready in/.test(String(chunk))) {
    warmed = true;
    void warm();
  }
});
next.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => next.kill(signal));

async function warm() {
  const started = Date.now();
  for (const page of PAGES) {
    try {
      await fetch(`http://localhost:${port}${page}`);
    } catch {
      // the server is still starting or was stopped: nothing to warm
    }
  }
  console.log(
    `  ✓ Pages ready (${((Date.now() - started) / 1000).toFixed(0)} s): links respond at once now`,
  );
}
