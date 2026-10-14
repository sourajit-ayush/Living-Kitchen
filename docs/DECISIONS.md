# Decisions log

Newest at the bottom of each phase. Format: **decision**, then why.

## Phase 0: Scaffold & foundations (2026-09-30)

1. **Next.js pinned to 15.5.x** (`create-next-app@15.5.26`, webpack dev server, no Turbopack). The project spec says "Next.js 15"; the latest create-next-app is newer, so we pin to stay on spec.
2. **Scaffolded in a temp dir and copied in**, because create-next-app refuses a non-empty folder. The spec's `docs/` and `reference/` are untouched.
3. **next-intl pinned to `~4.4.0`.** From 4.5, next-intl's config plugin eagerly imports `@swc/core` (for its optional message extractor). This `@swc/core` build refuses to load its native binary when any cache-folder ancestor grants modify rights to another group (`BUILTIN\Users` on the Desktop, an AppContainer SID on `%LOCALAPPDATA%`), so `next build` fails on this machine. 4.4 has every API we use (`defineRouting`, `createNavigation`, `hasLocale`, provider auto-inheriting messages). Revisit when upgrading; do not "fix" by changing folder ACLs.
4. **Messages live at `src/i18n/{en,hi}.json`** (per 04-architecture), with `routing.ts`, `navigation.ts`, `request.ts` beside them. All routes are locale-prefixed (`/en`, `/hi`); `/` redirects via middleware based on `Accept-Language`, defaulting to `en`.
5. **Devanagari fonts added:** Noto Sans Devanagari (body fallback) and Noto Serif Devanagari (display fallback), `preload: false`. Fraunces, DM Sans and Caveat have no Devanagari glyphs, so Hindi would otherwise fall back to a random system font. `unicode-range` means English pages never download them.
6. **Tokens:** `src/styles/tokens.css` is a verbatim copy of `reference/tokens.css`, kept in sync by a unit test and excluded from Prettier. `globals.css` overrides only `--font-display/--font-body/--font-hand` so they point at next/font's hashed families. Tailwind v4 `@theme inline` maps tokens to utilities: `bg-cream-50`, `text-ink`, `text-ink-muted`, `bg-primary`, `rounded-card`, `shadow-warm`, `shadow-pill`, `font-display`, `font-hand`. Semantic colours reference the CSS variables, so `[data-kitchen="night"]` works automatically.
7. **The type scale is implemented as Tailwind utilities** (`type-hero`, `type-h1`, `type-h2`, `type-h3`, `type-body`, `type-meta`) plus `glass` and `tabular`. The desktop sizes switch at 1024px.
8. **Focus ring: 2px walnut outline plus a saffron halo.** A saffron-only ring on cream is about 1.9:1, below the WCAG 3:1 non-text contrast minimum.
9. **Hero poster placeholder:** a CSS warm-gradient background until the Phase 2 scene can be rendered to `public/hero-poster.webp`.
10. **Testing:** Vitest (jsdom, `tests/**`) and Playwright (`e2e/**`, desktop Chrome plus Pixel 7, runs against a production build on port 3100). axe (WCAG 2 A/AA) runs in the smoke test as the per-phase stand-in for Lighthouse accessibility.
11. **pnpm 12 build-script allowlist** (`pnpm-workspace.yaml` → `allowBuilds`): `unrs-resolver` and `@parcel/watcher` only.
12. **`outputFileTracingRoot: __dirname`**, because a stray `C:\Users\Ayush\package-lock.json` made Next infer the wrong workspace root.
13. **`.env.local` created from `.env.example`** with `NEXT_PUBLIC_MOCK_AI=1`. `.gitignore` ignores `.env*` except `.env.example`.

## Phase 1: Recipe engine (2026-10-06)

### AI layer
1. **Structured outputs instead of a forced `return_recipes` tool.** docs/04 §5 says to force `tool_choice`, but Claude Sonnet 5.5 (the `ANTHROPIC_MODEL` default in `.env.example`) returns a 400 on forced tool use. We send `output_config.format = zodOutputFormat(RecipeSetSchema)`. The schema is generated from the same Zod schema we validate with, so it can't drift. The response is `{recipes: [best_match, almost_there, wildcard]}`.
2. **Zod validation stays authoritative.** The SDK moves constraints the API doesn't support (enums, min/max, lengths, patterns) into field descriptions, so the API won't strictly enforce them. `RecipeSetSchema.safeParse` checks everything, including exactly one recipe per kind and unique ids. On failure we retry once, append-only: the model's turn plus a user message listing the Zod issues. A second failure becomes the `invalid_output` error state.
3. **Request settings:** `effort: "low"` (aiming for under 8 s at p50; recipes don't need deep reasoning), `max_tokens: 32000`, streaming, a cached system prompt, and `fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta, so a safety-classifier decline is retried on a fallback model server-side. A `refusal` that survives the fallback maps to the `refused` error.
4. **SSE progress is a blend.** The route sends a synthetic easing curve every 1.2 s, each tick carrying a rotating loading line, and the real progress (streamed characters / about 9,000 expected) overrides it when ahead. Progress never reaches 1 before `done`. **Recipes are emitted after the whole JSON validates**, not one at a time while it streams; partial-JSON parsing isn't worth it until the Phase 3 reveal needs it.
5. **The system prompt treats user text as data**, adds diet definitions for vegan/vegetarian/eggetarian, a unit whitelist, status rules (`have`/`basic`/`missing`/`optional`) and the dictionary id list, so `ingredient_id` maps to our 3D models.
6. **Mock mode** is on when `NEXT_PUBLIC_MOCK_AI=1` *or* no `ANTHROPIC_API_KEY` is set. It streams the 3 fixtures (`src/lib/ai/fixtures/*.json`, built around spinach, paneer, onion and tomato) over about 2.5 s, and **re-tags have/missing against what you actually typed** so the UI behaves realistically. An ingredient named **"boil over"** triggers the error path deterministically, for UI work and e2e. Fixtures are English only, so Hindi mode still shows English recipes in mock mode.
7. **Rate limiting:** an in-memory sliding window (20 per hour per IP, from `x-forwarded-for`). It is skipped in mock mode, and Phase 8 swaps the store to Upstash so the limit holds across serverless instances. Request bodies are capped at 32 KB and validated with `.strict()` Zod (max 40 ingredients, max 60 characters each). The 24 h response cache from docs/04 §5 is also deferred to Phase 8 (it needs Redis/KV).
8. `server-only` guards `lib/ai/claude.ts` and `lib/ai/generate.ts`, so the SDK and API key can never reach a client bundle.

### Data & logic
9. **Dictionary: 158 ingredients** (spec says about 150 now, 400+ later) with English and Hindi names, Hinglish/US/UK aliases, category, emoji and `model` (set for the 40 MVP models from docs/06, null means clay blob).
10. **Matching:** NFC plus a nukta-insensitive normalise (प्याज़ ≈ प्याज), plural stripping, exact match on names and aliases, then edit distance with a typo budget by length (0 for ≤3 characters, 1 for ≤6, 2 otherwise). In autocomplete, names rank above aliases ("pan" suggests Paneer before "pani"/water).
11. **The parser** splits on `, ; & + and aur or और तथा या`, strips "I have / mere paas … hai" framing and fillers ("some", "a few", "thoda"), and reads quantities before or after the name ("200g paneer", "milk 500 ml"). Unknown items are kept with their own text.
12. **Default unit system is "Cups & katori" (Indian).** India is the launch market and the model writes in that style, so recipes show as written by default. Metric turns cups and katori into ml; US turns grams into oz/lb and ml into cups/spoons. Weight ↔ volume is never converted (no density table). Rounding follows F8: ¼ steps for spoons and cups, whole eggs/cloves/pinches, other pieces to ½, and g/ml to 1/5/10/50 depending on size.
13. **Substitutions:** AI substitutes come first (recipe-specific), then the offline rules table (`data/substitutions.ts`, 37 ingredients), de-duplicated by name. Notes are English until Phase 7. Choosing a swap replaces the displayed name and shows the note with an Undo.
14. **Shopping list** (`useList`, localStorage) already collects "Need" items. The `/list` page comes in Phase 6.

### UI
15. **State:** three Zustand stores (`useKitchen` persists ingredients only; `usePrefs`; `useList`), all with `skipHydration`, rehydrated in `<Providers>` after mount to avoid hydration mismatches. The meal follows the clock unless the user picks one (`mealOverride`).
16. **Layout before the 3D work:** desktop has the hero and dock on the left and a sticky glass results panel on the right (`min(560px, 44vw)`). Mobile stacks them and scrolls the panel into view. The Phase 2 bottom sheet replaces this on mobile.
17. **Accessibility choices:** a full ARIA combobox (listbox options, `aria-activedescendant`); chips, staples and the expiring toggle use `aria-pressed`; a polite live region announces adds and removals; focus moves to "Fresh out of the pot", the recipe title, or the error heading; the 2D donut has a full text equivalent.
18. **Contrast fixes against the design spec:** white on tomato-500 is 3.6:1, so the **Cook** label is 24px (large text, 3:1 is enough) and smaller primary buttons use tomato-600 (4.6:1). Step numbers sit **on a saffron disc in walnut** instead of being saffron text (1.8:1 on cream).
19. **Bundle:** enum constants were split out of `schema.ts` into `lib/ai/constants.ts` so Zod stays server-side, and framer-motion uses `LazyMotion` + `m` (`domAnimation`). First-load JS for `/[locale]` went from 240 kB to **190 kB**. The chips' `layout` animation was dropped as a result (it needs `domMax`).
20. **Not in Phase 1:** the heart/Save, Share and "Start Cook Mode" buttons (Phases 4, 6 and 7) and the Pantry toggle (Phase 6). Timer chips in steps only display for now.

## Phase 1.1: Free AI provider (Gemini) (2026-10-06)

1. **Added Google Gemini as a second provider, at the user's request** (they want a free API key; the Anthropic API has no free tier). This departs from the planned stack, and the user explicitly approved it. Claude stays fully wired up: `AI_PROVIDER=gemini | anthropic` in `.env.local` picks the provider, and the default when unset is `anthropic`, per the spec.
2. **Model `gemini-3.8-flash`** (overridable via `GEMINI_MODEL`). It's the newest Flash on Google's free tier (checked against the pricing page on 2026-10-06) and accepts text and images, so it covers the Phase 5 fridge scan too. **On the free tier, Google may use prompts to improve its products**, which is noted in `.env.example`. A paid Gemini key or Claude avoids that.
3. **Structured output via `responseJsonSchema`.** The schema is generated from the same Zod `RecipeSetSchema` (`z.toJSONSchema`) and passed through `sanitizeForGemini()`, which keeps only the keywords the SDK documents as supported. Unlike the Claude path, Gemini enforces enums and array bounds server-side. Zod validation and the single append-only retry stay authoritative for both providers through the shared `parseRecipeSet()`.
4. **`thinkingLevel: LOW`** (Gemini 3.x uses levels, not budgets; thinking can't be fully disabled), to stay near the 8 s target. `maxOutputTokens: 16384`.
5. **Error mapping:** 429 means the free quota is exhausted, which becomes `rate_limited` (UI: "Give the kitchen a few minutes to cool down"); 400/401/403 become `config`; a safety, prohibited-content or recitation stop, or a blocked prompt, becomes `refused`. Claude's 429 now also maps to `rate_limited`.
6. **Mock mode** applies when `NEXT_PUBLIC_MOCK_AI=1` *or* the selected provider has no key, so a missing key never sends a broken request.
7. pnpm build scripts for `@google/genai` (a no-op echo) and `protobufjs` (a version check) are denied in `pnpm-workspace.yaml`. Neither is needed.
8. Tests: the Gemini generator is unit-tested against a mocked SDK (streaming progress, the 3 recipes, retry with role order user→model→user, giving up after two failures, 429/400/safety mapping). A live call needs the user's key.
9. **Live testing with the user's key (2026-10-06):**
   - Google AI Pro doesn't include API access by itself. Its $10/month Cloud credits can fund the Gemini API once activated in the Google Developer Program and linked to the key's billing project, which also moves usage to paid-tier data terms. We recommended a $10 budget alert.
   - `gemini-3.8-flash`, `3.7-flash` and `3.6-flash` returned **503 "high demand"** on most calls (6 of 7 for 3.8). The SDK sometimes surfaces this mid-stream as `Incomplete JSON segment at the end`, which first reached the UI as a generic error.
   - **Retry plan:** main model → fallback model immediately → main model again after 1 s. Retried: 500/502/503/504 and broken streams. Not retried: 429 quota, 400/401/403 key or config errors, safety blocks. All configurable via `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL`.
   - **Default model changed to `gemini-3.5-flash-lite`, with `gemini-3.8-flash` as the fallback.** Measured: lite answered in about 3 s (raw) and 10–14 s through the app with full recipes; 3.8-flash took about 4 s when available but was usually overloaded. Lite recipe quality was good in English and Hindi (diet, time, cookware and missing items all respected). Swap them back once 3.8-flash is stable.
   - **Prompt fixes found live:** `uses_up` must list *only* `[EXPIRING SOON]` items (the model listed everything), and ingredient `name` must be human-readable in the locale ("Green chilli", not "green-chilli"); ids go in `ingredient_id`.
   - Known gap: end-to-end latency is still about 10–14 s, above the 8 s p50 target. Phase 3's pot animation makes the wait feel intentional; recipe-by-recipe streaming would cut perceived wait further if needed.
10. **After a user-reported "pot boiled over" (2026-10-06):** 9 of 9 follow-up live runs with the same and varied inputs succeeded with no retries, so the failure was a transient overload (or a server started before the model switch). Hardening:
   - The call plan now alternates **main → fallback → main (after 1 s) → fallback (after 2 s)**.
   - Every failed generation logs `[generate] failed → <code>: <message>` on the server.
   - The error screen shows **code-specific copy** (busy, lumpy output, refused, config, bad request, quota) and a small `Error code: …` line, so users can report what happened.

## Phase 1.2: Re-cook on language switch (2026-10-06)

1. **Switching language re-cooks automatically** when recipes are cooking, showing, or open (user request). `useKitchen` remembers `requestLocale`; `ResultsArea` calls `syncLocale(locale)` on locale change, which runs a fresh `cook(newLocale)` with the same ingredients and preferences. An in-flight request in the old language is aborted first.
2. **It's a fresh cook, not "3 new ideas"** (no `exclude`), so the user gets comparable dishes in the new language rather than deliberately different ones. The AI doesn't guarantee identical dishes. If that matters later, we can send the previous titles as "translate these dishes" instead.
3. **Not triggered** on an idle counter (only chips, which are localised client-side), on the error screen (the user chooses to retry), or after "Start over". Repeated calls for the same language are no-ops, so React strict-mode double effects can't fire two requests.
4. An open recipe closes and the user lands on the new results list. Each switch costs one generation from the user's Gemini quota.
5. Titles and taglines are now `.trim()`-ed by the schema. A live Hindi response had a leading space.

## Phase 1.3: Sauces & condiments (2026-10-06)

1. **New `sauce` ingredient category** (clay-blob colour `#9C3B2A`, a deep chilli red; docs/06 only lists seven categories). The user couldn't find sauces: the dictionary had just soy sauce and ketchup, and ketchup carried a bare `"sauce"` alias, so "hot sauce" suggested soy sauce.
2. **Dictionary: 173 items (+15 sauces):** green/red chilli, schezwan, hot sauce (sriracha, tabasco), sweet chilli, tomato chilli ("hot & sweet"), pasta/pizza, BBQ, oyster, fish, Worcestershire, mustard/kasundi, peri-peri, chilli oil, tamarind (imli) chutney. Ketchup, soy sauce, vinegar, mayonnaise and green chutney moved into `sauce`. The ambiguous `"sauce"` alias was removed.
3. **Quick add has a Staples / Sauces switch** (native radios, styled as a segmented control) with 12 common sauces. It resets to Staples on reload and isn't persisted.
4. **Offline substitutions** for every new sauce, mostly ketchup/soy/chilli-based home fixes, and vegetarian-friendly swaps for oyster and fish sauce.
5. **Parser:** commas and semicolons always split, but "and", "&" and "aur" only split when the whole phrase *isn't* an exact dictionary name. So "hot and sweet sauce" stays one item, while "salt and pepper" still becomes two. Typo-tolerant matching is deliberately not used for this check.

## Phase 2: The Living Kitchen scene (2026-10-06)

### Scene & assets
1. **Primitives first, no downloads.** As the build plan allows, the counter, backsplash, window, stove, pot, board and props are primitives with **procedural canvas textures** (butcher-block wood, zellige tiles, golden sky, light-shaft gradient). The environment is drei `<Environment>` with `<Lightformer>`s, with no HDRI file. Swapping in Poly Haven/Kenney assets (docs/06) later only changes geometry/materials, not positions (`POT_POSITION`, `BOARD_POSITION`, `WINDOW_POSITION`).
2. **Every ingredient is a clay blob for now** (rule 7 fallback): a shape per category (round veg/fruit, rounded block dairy/grain, capsule protein, lidded jar spice, bottle sauce, pebble other), tinted with the category colour and jittered by a hash of the ingredient key so the same item always looks the same. `model` ids from the dictionary are ready for glTF swaps.
3. **Scene additions beyond the doc:** shaker cabinet doors with brass knobs and a terracotta floor (so the no-UI poster doesn't show a blank lower half), a "+N" overflow basket, and the `sauce` clay colour (Phase 1.3).

### Behaviour
4. **Drop:** spawn 1.2 m above a Poisson-disc slot with random yaw/tilt; rapier convex-hull collider, restitution 0.25, friction 0.8. First contact triggers a squash-stretch (0.8/1.15 → damped rebound) and a wood-dust puff. After sleeping for 1.5 s the body becomes **fixed**.
5. **Slots:** 24 Poisson-disc slots in the 1.2 × 0.6 m drop zone. 16 cm spacing only fits 20, so the sampler tightens 1 cm at a time (it settles at about 14 cm). Slots are **sticky per ingredient** (removing one frees its slot for the next item), and items beyond the tier capacity (24/16/10) go into the basket.
6. **Remove:** the object stays mounted until its 220 ms back-in shrink and flour puff finish. **Reduced motion:** no camera moves, sway or parallax; items are created fixed in place and fade in; no puffs.
7. **Chip ↔ 3D highlight:** hovering or focusing a chip outlines its object (drei `<Outlines>`, 3 px saffron), hovering an object rings its chip, and clicking an object focuses its chip's first button. One shared `useScene.highlighted`.
8. **Camera:** `intro` (window view) dollies to `counter` over 6 s, `power2.inOut`. Shot changes take 1.2 s `power3.inOut`; with the results panel open on desktop, `counterLeft` frames the counter to the left. Idle sway is ±0.5° and pointer parallax ±2° (fine pointers only). Shots were tuned so the drop zone sits above the bottom dock. *File named `cameraShots.ts`, not `cameraRig.ts` as in docs/04: Windows treats it as the same name as `CameraRig.tsx`.*

### Performance
9. **Draw-call budget, measured with `gl.info.render.calls` on the high tier and 2048 shadows:** 35 for the empty kitchen and **85 with a full counter** (24 ingredients plus basket). Getting there:
   - all emoji labels share **one instanced mesh** with a runtime emoji atlas (24 calls → 1);
   - jars and bottles are merged single meshes;
   - static props are baked into a few vertex-coloured merged meshes (backdrop, matte props, metal props, pot body, lid, knife) via `mergeParts()`, as docs/03 §1 asks (63 → 35 base);
   - tiny details don't cast shadows;
   - the backdrop only *receives* shadows, since the sun comes from behind the wall.
   An e2e test enforces fewer than 100 calls.
10. **Tiers:** starting tier by heuristic (desktop with fine pointer and 8+ cores → high; data-saver or ≤2 GB → low; otherwise medium). `PerformanceMonitor` steps down below about 45 fps and never steps up automatically; `onFallback` goes to low. The user setting is persisted in `lk-quality` (Settings UI in Phase 7). Rendering pauses when the tab is hidden or the canvas is off-screen.
11. **Shadows:** three r18x removed `PCFSoftShadowMap`, so we use `shadows="percentage"` (PCF).
12. **Loading:** `KitchenScene` is `next/dynamic({ ssr: false })` and its chunk is only requested after `load` + `requestIdleCallback`. The poster shows immediately and the canvas cross-fades in once 3 frames have rendered. Initial JS is **201 kB** (budget 250).
13. **Hero poster:** rendered from the scene itself (UI hidden, a few ingredients) with headless Chromium and converted with `sharp`: `public/hero-poster.webp` (1600×1000, 34 KB) and `public/hero-poster-mobile.webp` (**900×900**, 17 KB). The mobile canvas area is roughly square, so a square crop beats the doc's 900×1200. Served via `next/image` (`priority`, `unoptimized`). **Regenerate after visual scene changes.**
14. **Known gap, a Phase 8 item:** with 3D on, mobile Lighthouse Performance is about **47** (76 with `?no3d=1`). LCP and FCP are unchanged by 3D (4.7 s / 3.0 s); the cost is **about 6 s of TBT** from 3D startup *as measured on a software GPU*. Fixes to make:
    (a) the non-compat rapier build with streaming WASM instead of the 815 kB-gzip base64 compat chunk;
    (b) `renderer.compileAsync` / parallel shader compile before reveal;
    (c) spreading set-up over several frames;
    (d) the general hydration and render-delay work behind the 2D LCP (3 s render delay).
    Accessibility, Best Practices and SEO are 100.

### Layout & testing
15. **Desktop:** canvas full-bleed. Hero top-left with a cream wash, fading out once the counter has items or a panel is open. Dock floats bottom-centre (single-row scrolling quick-add, capped chip list) and shifts left of the results panel (`min(560px, 44vw)`), which slides in from the right. **Mobile:** canvas in the top 45%; **bottom sheet** with peek, half and full snap points, draggable by its handle, and the handle is also a button that cycles snaps. Results, recipe and error snap it to full; cooking snaps it to half. On desktop the sheet is `display: contents`, so one component tree serves both layouts with no JS layout switch.
16. **`?no3d=1` is sticky for the session** (in-app links drop query strings) and `?no3d=0` clears it. `?debug=1` shows an FPS / tier / draw-call overlay for checking fps targets on real devices. `window.__lkGl` exposes read-only renderer stats.
17. **Ingredient input `maxLength` raised from 120 to 1000.** Pasting a long list was silently truncated, which we found while testing a full counter.
18. **e2e:** Phase 0/1 UI specs run with `?no3d=1`; `phase2.spec.ts` runs the real canvas on SwiftShader (`--use-angle=swiftshader --enable-unsafe-swiftshader`). Workers are capped at 3, because parallel software-GPU rendering starved the CPU and caused timeouts.
19. **Not verified here:** real-GPU frame rate (60 fps desktop, 30+ fps on mid-range Android). My browser pane is hidden, so it never fires ResizeObserver and R3F never sizes the canvas (a tooling artefact, not an app bug), and headless runs use a software GPU. To check, use `?debug=1` on real devices.

## Phase 2.1: Performance fixes (2026-10-06)
Closes the two Phase 2 gaps: mobile Lighthouse (47) and unmeasured real-GPU frame rate. Phase 2 items 14 and 19 are superseded by this section.

### How it was measured
- **Real GPUs, headless:** Playwright Chromium with `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist` drives this laptop's NVIDIA RTX 4050; the Chrome channel uses its Intel UHD integrated GPU. A "mid-range Android" stand-in is the Intel GPU plus 4× CPU throttle at 412×915 @2.625. It's an approximation: real phone GPUs fill pixels more slowly.
- **Lighthouse 12, mobile, simulated throttling,** median of 3 runs, against the production build. It was run two ways: on SwiftShader (what PageSpeed Insights sees, since it has no GPU) and on the real GPU.

### Results
| | Before | After |
|---|---|---|
| Lighthouse mobile, no GPU (PSI) | 47 (TBT ~1.5–9.8 s) | **85** (FCP 2.3 s, LCP 3.9 s, TBT ~70–110 ms) |
| Lighthouse mobile, real GPU, 3D running | 40 (TBT 21.5 s) | 73–80 (TBT ~300–500 ms) |
| Lighthouse desktop (proper desktop throttling) | n/a | **99** |
| Accessibility / Best practices / SEO | 100 | 100 |
| Time to 3D ready: RTX 4050 / Intel / Android stand-in | 5.6 / 7.0 / 8.0 s | 1.9 / 1.9 / 2.6 s |
| fps RTX 4050 (empty / dropping / 14 items) | 60 / 56 / 60 | 60 / 57 / 60 |
| fps Intel UHD, high tier | 36 / 33 / 44 | 101 / 70 / 76 |
| fps Android stand-in, auto (medium) | 43 / 9 / 38 | 113 / 43 / 47 |
| Longest main-thread task during 3D start (real GPU) | ~2.5 s | 37 ms |
| Initial JS | 201 kB | 196 kB |

### Changes
1. **Shadows only re-render while something moves** (`shadowGate.ts`). The sun's shadow map (`shadowMap.autoUpdate = false`) and the contact shadows used to redraw every frame. Now falling, squashing and leaving ingredients, plus the basket, mark them dirty, and one settled frame is rendered after. This was the biggest fps win on integrated GPUs. **Phase 3 rule:** anything that moves a shadow caster, such as the lid lift or ingredients hopping into the pot, must call `markShadowsDirty()` each frame it moves.
2. **No WebGL on software GPUs in "auto"** (`quality.ts`). Headless Chrome, Lighthouse and PageSpeed Insights render WebGL on the CPU, where the scene cost seconds of main thread, so they get the poster. The check uses the renderer string (SwiftShader, llvmpipe, …) plus `failIfMajorPerformanceCaveat`. A manual quality setting overrides it, which is how the e2e suite still tests the canvas.
3. **The GPU probe runs in a worker** (`gpuProbe.worker.ts`, OffscreenCanvas). A first WebGL context blocks the calling thread while the GPU process starts, which was a 460 ms main-thread task in Lighthouse. If a browser lacks WebGL on OffscreenCanvas, the probe falls back to the main thread. The tier decision now happens at idle time, just before the 3D chunk loads, and is skipped entirely for `?no3d=1`.
4. **Physics loads on intent** (`PhysicsLayer.tsx`, lazy). rapier (835 kB gzip WASM) and all colliders are split out of the set. They load when the ingredient box is focused or the first ingredient exists, so the empty kitchen never downloads it.
5. **No synchronous shader compiles** (`sceneWarmup.ts`). Nothing renders (`frameloop="never"`) until warm-up finishes. The warm-up:
   - waits on a GPU fence, so the first sync WebGL query doesn't wait about 140 ms;
   - uploads textures;
   - pre-compiles three's PMREM shaders (`pmremWarmup.ts`, about 0.6 s on Windows/ANGLE otherwise);
   - bakes the environment;
   - compiles every object's shaders with `compileAsync` (KHR_parallel_shader_compile), all in ~8 ms slices.

   `checkShaderErrors` is off in production, because reading info logs forces a wait. The first `getExtension` calls are made in `onCreated`.
6. **drei's `<Environment>` and `<ContactShadows>` are replaced with local versions** (`BakedEnvironment.tsx`, `ContactShadowLayer.tsx`, adapted from drei, MIT). drei renders the environment cube in a mount effect before any shader is ready, and compiles contact-shadow shaders mid-frame. The local versions bake and warm on our schedule. Contact shadows now draw only shadow-casting meshes (a dedicated layer), so there is one depth-shader variant to warm. Visual output is unchanged (checked side by side on the real GPU).
7. **The set mounts in a React transition** (`Staged`). R3F uses a concurrent root, so building the kitchen yields to input.
8. **Smaller first paint:**
   - The poster is one art-directed `<picture>` with `fetchpriority="high"`. The two `next/image` "priority" images preloaded both stills on every device: phones paid for the 35 KB desktop poster, desktops for the mobile one.
   - The "हि" language label uses system fonts on English pages, which avoids a 121 KB Devanagari web-font download.
   - `next/image` is gone from the page (−5 kB JS).

### Known limits
- Mobile LCP is 3.9 s in Lighthouse's simulation. Most of it is "render delay": Lighthouse's model counts the ~200 kB of hydration JS and ~230 kB of fonts requested before first paint. Fraunces with its SOFT/WONK/opsz axes is 121 KB, and the design uses those axes. Trimming font axes or subsetting further is a Phase 8 lever if 85 isn't enough.
- The real-GPU Lighthouse score swings 73–80 between runs, from scene-start tasks in the 30–40 ms range that Lighthouse multiplies by 4.
- e2e: the counter assertions wait up to 20 s (physics is now lazy, and software GL under three workers is slow). The axe test runs with reduced motion, so it never catches a fade mid-way.

## Phase 3: The Cook sequence (2026-10-06)

### What happens
Cook → the camera pushes in on the stove, the lid hinges back and the flame rises. Ingredients hop into the pot, nearest first, along bezier arcs (kinematic bodies, 60 ms stagger, a spin), each landing with a splash. While the AI thinks, bubbles, steam density and the flame follow the SSE progress. When the recipes arrive, the steam brightens (bloom spike) and three recipe cards rise out of it and fan out (depth of field on "high"); then the DOM results panel takes over. Choosing a recipe flies its card at the camera while the others sink back into the steam. "Start over" closes the lid and the ingredients pop back out onto their own spots. An API error "boils over" (steam burst, foam splashes) next to the existing retry state.

### Decisions
1. **Architecture.**
   - The **director** (`useCookSequence.ts`) watches the store and drives mutable signals (`cookSignals.ts`: pot lid, liquid, bubbles and flame; the hop schedule). The pot, ingredients, steam and cards read those signals every frame, so animation never goes through React renders. The pure maths (hop ranking, arcs, launch velocity, steam density, card fan, camera shot per phase) is unit-tested in `tests/cook-logic.test.ts`.
   - **A new `revealing` phase in the store.** When live 3D cards exist (`useScene.reveal3d`), a finished cook goes `revealing` → `results`. The scene calls `finishReveal()` after about 1.7 s, and a **4 s safety timeout** guarantees the DOM results can never get stuck (paused or off-screen canvas). With `?no3d=1`, reduced motion, or no cards mounted, results show directly. During the reveal the panel keeps the cooking card with "Plating up…" (same key, so no remount flash).
2. **Cards are R3F planes with a painted canvas texture**, not drei `<Html>`. That means no DOM inside the canvas, 3 draw calls, and the page's own fonts (read from the CSS variables, loaded per text so Hindi titles get Devanagari). The canvas stays `aria-hidden`; the same recipes are always in the DOM. The cards write depth (with an alpha cutoff for the rounded corners) so depth of field keeps them sharp.
3. **Camera shots** `stove` and `reveal` were added. On desktop the results panel covers the right ~44%, so both frame the pot left of centre and above the dock; the targets were solved numerically by projecting the pot and cards to screen pixels. Mobile frames the pot in the top 45%. Reduced motion keeps the counter framing (no camera moves).
4. **Reduced motion:** no hops (items fade out into the pot), no 3D reveal (results appear directly), no camera moves. Start over fades items back in place.
5. **Sound** (`lib/sound.ts`) is synthesised with Web Audio rather than Howler and audio files:
   - Sounds: thunk on landing (pitch by size), plop into the pot, sizzle on Cook, a bubbling loop that densifies with progress, a ding on reveal, a boil-over rumble.
   - No downloads at all. It's off by default, with a header toggle (`aria-pressed`) persisted in `lk-sound`, and a remembered "on" resumes on the first gesture.
   - Howler stays installed for real recorded sounds later.
6. **Post-processing** (`Effects.tsx`) uses `@react-three/postprocessing`, with `postprocessing` added as a direct dependency (same version) for its enums:
   - **High:** bloom (5 mip levels), depth of field animated by bokeh scale (always in the pass; adding or removing an effect rebuilds the merged shader), ACES tone mapping (moved into the composer), slight warm grade, vignette, grain 0.03, 4× MSAA.
   - **Medium:** bloom + tone mapping + vignette, 2× MSAA.
   - **Low:** no composer.
   - **N8AO was skipped:** it's too heavy for the integrated GPUs that "high" can land on, and the scene already has a soft PCF shadow map plus contact shadows.
7. **Shader warm-up extended:**
   - With a composer, scene programs are compiled for an off-screen target (program keys depend on the output target). Without that, all of them recompiled on frame one: about 1.3 s of stalls.
   - The composer's own materials are found by walking its passes and effects, and compiled with `compileAsync`.
   - Card and particle materials are pre-created (instance colour attributes up front; a hidden card placeholder).
   - Result: no long tasks between Cook and results. One ~33 ms `EffectMaterial` compile remains at load (postprocessing rebuilds that shader when the composer first sizes itself).
8. **Shadow gate fixes:**
   - Bodies that never fall asleep (one rocking on a neighbour) kept shadows re-rendering at 60 fps forever. Bodies are now fixed when barely moving 4 s after landing, and in any case 8 s after their drop.
   - While things move, the sun's shadow map and the contact shadows alternate frames (30 Hz each).
9. **Draw calls are now counted per frame** (`gl.info.autoReset = false`, reset first in each frame). The old per-render counter only saw the last post-processing pass. Honest numbers on "high":
   - **settled: 65** (14 items) / **76** (full counter);
   - **while a full counter of 24 falls at once: ~104–111 for up to 8 s** (one shadow pass on top of the frame).
   - "Medium" and "low" stay under 100 throughout. The basket's filler balls were merged into one mesh. The e2e test asserts the **settled** frame is under 100 and guards the transient peak at under 120. Getting the transient under 100 too would need cached static shadows or instanced steam: a Phase 8 item.
10. **Tier fixes:**
    - The PerformanceMonitor's lower bound was relative to the best fps seen, so a GPU slow from frame one never stepped down (Intel UHD sat at 20 fps on "high"). It's now a fixed 45 fps (docs/03 §7).
    - Integrated Intel GPUs (not Arc) start at "medium" (`integratedGpu` from the renderer string).
11. **Layout jank removed:**
    - The mobile bottom sheet animated `top` (CLS ~0.36 per snap); it now moves with `transform` at full height, with bottom padding so everything stays reachable.
    - The Cook pill reserves the width of "Cooking…" (both labels share a grid cell), so the dock row never reflows. On mobile, Cook is a full-width primary button.
    - Whole-flow CLS: **0.0013 mobile / 0.0004 desktop**.
12. **Bugs found and fixed on the way:**
    - Removed ingredients puffed away at drop height (1.2 m) instead of where they sat.
    - Ingredients whose physics finished loading after Cook was pressed were never put in the pot; they now join the end of the hop queue.
13. **Testing:**
    - `e2e/phase3.spec.ts`: the full flow, boil-over with retry, sounds off by default and remembered, and reduced motion.
    - 3D logic tests pin the "low" tier (no post-processing) to keep software rendering fast; the draw-call budget test uses "high" at a small viewport.
    - Workers are now 2 (3 starved each other once post-processing landed).
    - Video recording inside the e2e run timed out writing files on software GL, so **the DoD video is recorded on the real GPU** with Playwright (`docs/videos/phase3-cook-flow-{desktop,mobile}.webm`).
    - 149 unit and 51 e2e tests pass (twice in a row).
14. **Measured (real GPUs, production build):** RTX 4050 60 fps on "high" throughout; phone stand-in ("medium") 50–79 fps; Intel UHD steps down to "low" at 114–136 fps. Lighthouse unchanged: mobile 85, desktop 100, a11y/BP/SEO 100. Initial JS 197 kB.

## Phase 4: Cook Mode (2026-10-06)

### What it is
"Start Cook Mode" in the recipe view opens `/[locale]/cook/[id]`: full screen, one step at a time in big type (28 px+, cream on a dark scrim) over the blurred, dimmed kitchen.
- **Moving between steps:** swipe, ← → / Page keys, buttons, or voice. A wooden spoon fills with saffron as progress (a real `progressbar`).
- **Timers:** inline chips for the durations written in each step, which run side by side with a dock.
- **Ingredients:** a pull-up checklist, scaled to the servings and units chosen.
- **Hands-free:** the screen stays on; voice commands "next / back / repeat / start timer / stop timer / ingredients" work in English, Hindi and Hinglish; steps are read aloud while voice is on.
- **Background:** the kitchen acts out the step (knife chopping, wooden spoon stirring, boiling, sizzling, resting under the lid).

### Decisions
1. **Recipes for Cook Mode live on the device** (`useCookbook`, localStorage, the 10 most recent). Results were memory-only, so a reload or a shared link would lose them. Each entry keeps the servings, units, ticked ingredients and current step. If an id isn't on the device, the page explains that and links back to the kitchen. Accounts and saved recipes (Phase 6) will add a server source, and the PWA (Phase 8) makes this work offline.
2. **The kitchen scene moved into the locale layout.** Entering Cook Mode no longer tears down WebGL: the same scene glides to the board or the pot, blurs (CSS `blur(6px) brightness(.42)`, scaled 1.06 to hide soft edges) and renders **at 30 fps on demand**. That's about half the GPU and battery for a screen kept on for 20+ minutes. The quality monitor is paused there, because the deliberate 30 fps would read as a slow GPU.
3. **Step backgrounds (docs/03 §6.8):**
   - `potLookFor(action)` (tested) sets the lid, bubbles, flame, liquid and steam per action.
   - The camera uses `cookBoard` for chop / grind / plate and `cookPot` for everything else; both are centred, and mobile uses a portrait-friendly field of view.
   - The knife rocks on its handle, a merged wooden spoon circles in the pot, and frying spits oil droplets.
   - Leaving Cook Mode restores the kitchen's look for the current phase.
4. **`detectTimers`** (`lib/timers.ts`, tested):
   - Covers English, Hindi and Hinglish, Devanagari digits, number words, ½, "half an hour", and compounds like "1 hr 15 min".
   - Every duration in a step becomes its own chip, in place in the sentence.
   - **Ranges start at the lower bound** and keep the upper one ("8–10 min" → 8:00): check early, you can always add a minute.
   - The model's `timer_minutes` is the fallback when the text has no duration.
   - Matches under 5 s or over 12 h are ignored.
5. **Timers** (`useTimers`, tested) store absolute end times, so they keep counting between steps and across reloads. Several run at once. The dock shows each one's step, time, pause/resume, +1 min and dismiss, and tapping a dock timer jumps to its step. One shared 4 Hz clock ticks only while something runs.
   - When a timer finishes, it plays a soft triple ding, vibrates, announces through a live region, and pulses its chip.
   - **The alarm rings even with ambient kitchen sounds off**, because the user explicitly set that timer. Audio is unlocked by the tap that starts the timer.
   - Timers ring while Cook Mode is open; they keep time elsewhere and show as done on return.
6. **Voice:**
   - **Recognition:** Web Speech recognition in en-IN or hi-IN, continuous, restarted after silence. `parseVoiceCommand` (tested) matches whole words, longest phrase first, and the last command in a phrase wins.
   - **Reading aloud:** speech synthesis reads each new step while voice is on.
   - **Echo handling:** while reading, a phrase that is part of the text being read counts as the app hearing itself. Anything else is a command and **interrupts the reading**. The first version ignored all input while reading, which made "next" useless on long steps; the e2e test caught it.
   - **Fallback:** without support, the mic button isn't shown; if permission is denied, a status line says so.
7. **Wake Lock:** requested on entry and re-requested when the tab becomes visible again (browsers drop it when hidden), with a small "screen stays on" badge. If it's unsupported or refused, nothing else changes.
8. **Accessibility:**
   - **Screen readers:** step changes are announced by a live region while focus stays on the control used; there's an `h1`, and an `h2` per step; the canvas stays `aria-hidden`.
   - **Labels:** every icon button is labelled; timer chips describe their action and time ("Pause the 3 minutes timer, 2:41 left").
   - **Layout:** the site header steps aside in Cook Mode (`body:has([data-cook-mode])`).
   - **Axe:** a clean pass in e2e.
9. **Smaller fixes on the way:**
   - The dock's timer list uses `useShallow`; zustand v5 loops on new arrays.
   - A finished timer glows instead of scaling, so its buttons hold still.
   - Coming back from Cook Mode opens the mobile sheet fully when a recipe is showing.
10. **Testing:**
    - Unit tests for timers, timer maths, voice commands and pot looks.
    - `e2e/phase4.spec.ts` (7 scenarios × desktop/mobile):
      - **Navigation:** buttons, keys, swipe, a 28 px+ check, resume after reload, finish.
      - **Timers:** Playwright's clock with `fastForward`; `runFor` replayed every 250 ms tick and starved the page.
      - **The drawer.**
      - **Hands-free voice:** an injected fake `SpeechRecognition` that the test "speaks" into, including Hindi.
      - **Edge cases:** an unknown recipe, axe, and the 3D background switching mode.
11. **Measured (real GPU, production build):**
    - In Cook Mode the background renders at **30 fps** while the UI runs at 60, on desktop ("high") and phone ("medium").
    - **No long tasks** on entering Cook Mode or across step changes.
    - Lighthouse is unchanged with the scene in the layout: mobile 85, desktop 100, a11y/BP/SEO 100.
    - Initial JS: kitchen 200 kB, Cook Mode 194 kB.
    - 168 unit tests and 65 e2e tests pass (twice in a row).
12. **Not verified here:**
    - Real microphones and speakers: recognition accuracy, echo in a noisy kitchen, how the alarm sounds.
    - Wake Lock on an actual phone (headless browsers don't hold one).
    - Vibration (only phones have it).
    The e2e suite drives all of these through stand-ins.

## Phase 5: Input superpowers (2026-10-07)

### What it is
- **Voice input (F3):** a mic button beside the ingredient field. Say "I have eggs, spinach and cheese" (or "मेरे पास अंडे, पालक और पनीर है") and the chips drop in while you talk.
- **Fridge scan (F2):** "Scan fridge" takes a photo or picks one, shrinks it on the device, asks the AI what's in it, and shows a review sheet of toggleable chips. "Add" drops them in as a staggered **ingredient rain**.
- **Surprise Me (R3):** asks the AI for 8 dish ideas from what's on the counter; a wooden **lazy-susan** rises out of the counter, spins with a long deceleration and lands on one, whose plate floats up; then that dish is cooked.

### Decisions
1. **Same providers as recipes:** `/api/scan` and `/api/surprise` go through Gemini (the configured free provider) or Claude, with a mock for `NEXT_PUBLIC_MOCK_AI=1`. Both use one non-streamed structured call (`geminiStructured` / `claudeStructured`) with the same overload plan, **Zod validation and one retry carrying the validation errors** (golden rule 4). Keys stay server-side; both routes are rate limited per IP (scan 15/h, ideas 30/h) and answer with friendly JSON errors.
2. **The photo is never stored.** It is resized on the device to 1024 px on the long side (`createImageBitmap` with EXIF orientation, re-encoded as JPEG, which also **drops location metadata**), held in memory for the one model call, never written or logged. The sheet says so in plain words.
   - **Server checks:** 4 MB cap; the real type is **sniffed from the first bytes** (JPEG/PNG/WebP), so an SVG or other file renamed `.jpg` is refused with a 415.
   - **No `capture` attribute** on the file input: phones then offer both the camera and the photo library (the spec says camera on mobile, but a photo already taken of the fridge is just as useful). Desktop gets the file picker.
3. **Review sheet:** names are matched to the ingredient dictionary (so "palak" and "spinach" merge, with emoji), duplicates keep the highest confidence, guesses under 25% are dropped, and **70%+ starts ticked** (`toReviewItems`, tested). Confidence shows as "94% sure" or "not sure". With 3 or fewer finds it asks "Anything else?" (the F2 acceptance line), with none it suggests better light, and errors offer "Try again".
4. **Ingredient rain:** items that arrive together (a scan, a spoken or pasted list) are held out of the physics world and dropped one after another, 0.14 s apart (`rainDelays`, tested). A single item still drops at once. Reduced motion: they simply appear, as before.
5. **Voice:**
   - **Recognition** is continuous with interim results; each phrase is added as soon as it is final, and listening ends after a pause or on Stop. It starts in the UI language (en-IN / hi-IN); an **EN / हिं switch** while listening restarts it in the other language, for cooks who think in Hindi on the English page or the other way round.
   - **Parsing got smarter for speech**, because transcripts rarely have commas: a phrase that isn't one ingredient but **splits cleanly into known ones** is split ("aloo pyaaz tamatar", "अंडे पालक", "2 tomatoes 200 g paneer hari mirch"); unknown phrases stay whole ("dragon fruit"). Hindi and Hinglish counts become digits ("दो अंडे" → 2, "teen tamatar" → 3, "३" → 3).
   - **Bug fixed on the way:** Hindi "या" (or) split "प्याज़" in two, because `\b` doesn't see Devanagari letters. The Hindi conjunctions now use explicit letter lookarounds.
   - **Unsupported browsers** (Firefox): the spec says "hide the button and show a tooltip". The mic stays as a quiet, dashed, `aria-disabled` button whose tooltip and label explain why, so keyboard and screen-reader users learn it too. Blocked microphone, silence, and "heard you but no ingredients" each get their own message.
6. **Surprise Me:**
   - **One spin plan drives both views:** the store picks the dish and a plan (`planSpin`, ease-out quart, 3+ turns, 4.2 s, tested to always land on the pick); the 3D wheel and the DOM list both read it, so the highlight hops in step with the plates. The DOM list is the readable, accessible version and works with 3D off.
   - **The dish is cooked as the request's `wish`.** The prompt makes it best_match when the ingredients allow, otherwise almost_there; the other two recipes stay as usual, so Surprise Me still teaches what else the counter can do.
   - **Layout:** on desktop the panel sits on the right instead of growing the dock over the wheel, and a dedicated `surprise` camera shot puts the wheel high in the frame. On phones the panel is in the sheet and scrolls into view.
   - **Reduced motion:** no spin, it lands at once and holds the pick for 1.6 s before cooking.
   - **Draw calls:** stand, disc + 7 plates (merged), one emoji strip (all eight emoji in one texture), and the chosen plate (2): 5 in total, plus shadows. The wheel is mounted, hidden, from the start, so its shaders compile in the start-up warm-up instead of stalling the first spin.
7. **Hindi ideas from the lite model sometimes came back garbled** (one nonsense title eight times; a word repeated through a title). The ideas schema now rejects repeated titles and repeated-word titles, so such an answer gets the one retry. A missing emoji is only decoration and falls back to 🍽️ rather than failing the request.
8. **Sample photos** (`tests/fixtures/images`): a bright fridge, a pantry counter, and a dark, blurry fridge. Downloading stock photos needed permission, so they are rendered scenes of food on shelves; drop real photos in the same folder to try them.
9. **Rain on slow phones:** adding from the scan sheet first measured one 200 ms task on the phone stand-in (the dialog closing and five physics bodies being created together). The sheet now closes first and the rain starts in the next task: the worst task is about 120 ms, the same as typing five items at once.
10. **Accessibility:** a scan chip's "78% sure" was 4.43:1 on green (axe caught it) and is now full white; the "Scan fridge" button's accessible name is its visible text (Lighthouse "label in name"), with the longer description as a tooltip.
11. **Testing:**
    - Unit tests (`tests/inputSuperpowers.test.ts`): spoken lists in English, Hinglish and Hindi, number words, the review list, resizing maths, type sniffing, strict schemas (including the garbled-answer cases), the spin plan, and rain delays.
    - `e2e/phase5.spec.ts` (10 scenarios × desktop/mobile): scan → review → rain onto the 3D counter; Surprise Me with the 3D wheel rising and the landed dish sent as the `wish`; voice in English, a mid-listen switch to Hindi, and the Hindi page; unsupported and blocked microphones; a dark photo with few unsure finds, an upstream error and retry; a non-photo file; reduced motion without 3D; axe on the sheet and the panel; API input validation.
12. **Measured:**
    - **Live Gemini on the sample photos** (DoD): bright fridge → 17 items (egg, cheese, milk, butter, tomato, capsicum, carrot, onion, lemon, apple, banana, cucumber, chilli, garlic, ginger, potato, plus "coriander" for the leafy greens); pantry → 13 (rice, rajma, salt, honey, onion, garlic, bread, peanut, olive, noodle, sweet corn, coconut, chocolate); dark and blurry → 8, with lower confidence and two plausible misreads (tomato as beetroot, spinach as cabbage).
    - **Real GPU, production build:** during the rain and the spin, 59–60 fps on the RTX ("high", at most 74 draw calls) and 68–74 fps on the phone stand-in (Intel with 4× CPU throttle, "medium", at most 61).
    - Lighthouse: mobile 84 (85 before; within run-to-run noise), desktop 100, a11y/BP/SEO 100.
    - Initial JS: kitchen 211 kB (was 200), Cook Mode 195 kB; both under 250.
    - 187 unit tests and 85 e2e tests pass (3 skipped by design); the full suite passed twice in a row after one race in the new 3D Surprise test was removed.
13. **Not verified here:** real microphones (accuracy, accents, noise), a real phone camera (HEIC photos, which Safari converts to JPEG on upload), and the scan on real fridge photos rather than the rendered samples.

### Phase 5.1: The UI steps aside for the 3D moments (2026-10-07)
Feedback: the dock and the side panel stayed in front of the pot and the wheel while they animated.
- **`useStage()`** is on while ingredients tumble into the pot, the recipes rise, or the Surprise Me wheel fetches, spins and lands.
- **Desktop:** the dock slides below the screen edge and fades. It is `invisible` too, so it can't take focus or be read while hidden. It comes back when the recipes (or an error) are ready. While cooking, the big side panel is replaced by a **small progress pill** at the bottom (the loading line, the bar, Cancel). The Surprise Me ideas card on the right stays, because it is the readable version of the wheel.
- **Camera:** with the panel gone, the cooking shot centres the pot with the open lid and steam in frame, and the wheel shot centres the wheel. A boil-over error brings the full panel back, so it keeps the old left-of-centre stove framing (`stoveLeft`).
- **Phones:** the sheet already drops to half height while cooking so the pot shows above it. Starting Surprise Me now also lowers a fully open sheet.
- **Not changed:** the dock and panel stay while you read results or a recipe, since that is when you need them (to edit ingredients or cook).
- **Test:** an e2e check that the dock is hidden and only the compact pill shows during the show, and both return with the results. Full suite: 86 passed, 4 skipped, twice in a row.
- **Dev-server 500s (fixed):** the e2e production build wrote into the same `.next` folder that a running `pnpm dev` serves from, which broke the dev server with "Internal Server Error" until it was restarted. Test builds now go to `.next-test` (`NEXT_DIST_DIR`, set in `playwright.config.ts`; ignored by git, ESLint and Prettier), so `pnpm dev` keeps working while tests build.

## Phase 6: Accounts, Pantry, Book, List (2026-10-07)

### What it is
- **Accounts:** email magic-link sign-in (Supabase Auth). Google and phone OTP were left out by choice: Google needs a Google Cloud OAuth client, and phone OTP needs a paid SMS provider.
- **Sync:** the pantry, recipe book and shopping list live on the device for guests and sync with the account when signed in, live between devices.
- **My Pantry (R1):** a page of staples grouped by category, a "Use my pantry" switch (on the page and in the dock), "Save to pantry" on every counter chip, and a **3D shelf** of jars on the backsplash.
- **Use-It-Up (R4):** optional expiry dates in the pantry, a nudge on the kitchen ("Your Paneer expires tomorrow. Here are 3 ideas to use it up.") that cooks with it, expiring items sent to the AI to use up, and a **pulsing saffron glow** on expiring ingredients in 3D.
- **Recipe Book (R2):** a heart with an herb-confetti burst on every recipe; a book page with collections ("Weeknight", "Guests", custom), star ratings, notes and a "Made it!" photo (accounts only); the accessible grid is the default, with a **3D flip book** on the cutting board that turns its pages (page-curl shader) to the recipe the grid is on.
- **Shopping list (R8):** a page grouped by aisle, tick off, clear ticked, add by hand, share as text (share sheet, or copy).
- **Navigation:** header links (a menu sheet on phones) and a sync status.

### Decisions
1. **Supabase in the cloud (free tier), no local stack:** this machine has no Docker. Migrations are plain SQL in `supabase/migrations`, applied by `pnpm db:migrate` (a small `pg` runner that records what ran in a private `lk_meta` schema, each file in a transaction).
2. **Security, row by row:** every table has RLS; the four synced tables allow a user to read and write only their own rows, profiles too. "Made it!" photos go to a **private** bucket, in a folder per user, with the same rule. A saved recipe can only point at a recipe its owner can see (a trigger). Columns have length and shape checks, so a bad client can't store junk. Recipe JSON read back from the database is validated with Zod again (golden rule 4).
3. **`recipes.is_public` defaults to false**, not true as docs/04 sketches: saving a recipe shouldn't publish it. Phase 7's share button will set it, and public recipes are readable by anyone (tested).
4. **Sync model:**
   - **Stable keys:** every row has a key that is the same on every device (an ingredient id, a normalised name, or for recipes the slug plus a content fingerprint, so the same recipe saved on two devices is one entry).
   - **Conflicts:** last writer wins per row, and **the server's clock decides**: after a push the device adopts the server's `updated_at`.
   - **Deletions** are tombstones (`deleted_at`), so a removal reaches other devices; tombstones are forgotten after 30 days.
   - **Sign-in merge:** pull, merge with the device (a guest's data joins the account), push the device's winners. While signed in: changes are pushed 0.8 s after they happen; another device's changes arrive by **Supabase Realtime**, plus a pull on focus and on reconnect as a safety net.
   - **Sign out** takes the account's data off the device (shared phones and family laptops).
   - The merge rules are pure functions with unit tests (`mergeByKey`, `changedSince`, row mapping).
5. **Guests download none of it:** `supabase-js` (~50 kB) and the sync engine load only when a session exists on the device or someone signs in. The magic link uses PKCE and is exchanged in the browser on `/auth/callback`; no server session code was needed.
6. **"Use my pantry"** sends the pantry as staples, and pantry items expiring within 2 days as **ingredients marked expiring**, so the AI prioritises them and the cards say "Uses up". The nudge's "Not now" hides it for the rest of the day.
7. **3D:**
   - **The scene follows the page:** kitchen; Cook Mode (dark blur); pantry (camera on the shelf); book (camera on the book); and a soft blurred backdrop at 10 fps for the list and sign-in pages. It's still one scene, so moving between pages never rebuilds the 3D.
   - **Shelf:** 12 jars, instanced (jars and lids: 2 draw calls, plus the merged shelf), emoji through the shared label layer. A lid turns saffron when the item expires soon. It sits low on the backsplash so the counter camera sees it too.
   - **Book:** leather covers and page blocks merged, two page textures drawn with the site's fonts (title, tagline, stars and handwritten notes on the left; ingredients and method on the right), and one extra leaf while a page turns. The knife on the board is put away while the book is open.
   - **Glow:** a saffron emissive that breathes every 1.6 s (still under reduced motion). Emissive is a uniform of the standard material, so it adds no shader program.
   - **No new first-use stalls:** the shelf and the book are mounted (hidden) from the start, with their instance colours and page textures set before the warm-up, so their shaders compile with everything else.
8. **Layout:** the new pages share a `PageShell`: a glass panel on the right on desktop, below the 3D view on phones. On phones the header keeps one line by moving the sound switch into the menu. The dock's new pieces are one-liners (the pantry switch shows its count, the nudge sits in one row), so the Cook button stays in view.
9. **Testing:**
   - Unit (`tests/accounts.test.ts`, 17): merge rules, tombstones, row mapping both ways (and an invalid stored recipe skipped), slugs the database accepts, stable recipe keys, expiry maths, pantry in generation, aisles, share text, store behaviour, and the v1 → v2 list migration.
   - e2e (`e2e/phase6.spec.ts`, 11 scenarios × 2 projects): the pantry with an expiry date, the nudge and cooking with the pantry; save to pantry from a chip; the book (heart, collections, rating, notes, paging, reload); the list (aisles, tick, clear, add, share); navigation and the phone menu; the 3D mode per page; axe on the four new pages.
   - **Against the real project** (skipped until the keys are in `.env.local`):
     - `pnpm test:rls` creates two throwaway users and checks that B can't read, change, delete or impersonate A's rows or photos, and that only shared recipes are public.
     - `e2e/phase6-sync.spec.ts` checks the guest merge on sign-in, two devices syncing live (add and delete), and sign-out clearing the device.
10. **Measured (production build, mock AI, no Supabase project yet):**
    - **Real GPU:** 60 fps on the pantry and book pages and while pages turn (RTX, "high", at most 58 draw calls). The phone stand-in (Intel, 4× CPU throttle, "medium") runs 122–128 fps with at most 33 draw calls. The list and sign-in backdrop renders at a deliberate 10 fps. No long tasks on any of them.
    - **Initial JS:** kitchen 225 kB (was 211), book 179 kB, pantry 141 kB, list 137 kB; all under 250 kB.
    - **Lighthouse:** desktop 99, a11y/BP/SEO 100. **Mobile 82, down from 84** (LCP 4.4 s vs 4.1 s; three runs). The LCP poster loads early but paints after the start-up script work, which grew with the navigation, the new stores and the larger message bundle (en.json is now 16 kB, all sent to the client). Left for the Phase 8 performance pass (candidates: per-page message bundles, lazy-loading the phone menu).
    - **Tests:** 204 unit tests and 108 e2e tests pass, twice in a row. 6 are skipped: the 4 from earlier phases plus the 2 that need the Supabase project.
11. **Not verified yet (needs the Supabase project):** `pnpm db:migrate` against a real database, `pnpm test:rls`, the two-device sync e2e, a real magic-link email, and "Made it!" photo uploads. Everything else above was run.

### Phase 6.1: Verified against the real Supabase project (2026-10-07)
- **Applied:** `pnpm db:migrate` ran the migration on the project in one transaction.
- **Security (DoD):** `pnpm test:rls` passes all 6 checks on the live database. User B can't read, change, delete or impersonate user A's pantry, list, saved recipes, private recipes, profile or photos. Anyone can read a recipe A shared, and nothing else.
- **Sync (DoD):** `e2e/phase6-sync.spec.ts` passes (desktop and phone layouts, 20 of 20 on repeat). Guest data merges into the account on sign-in; a second device receives it; an addition on one device appears on the other live, and a deletion disappears; the shopping list syncs; signing out clears the device. Test users are created and deleted by the tests (none left behind).
- **Fixed while verifying:**
  - **Two sync engines at start-up.** The initial auth event and `getSession()` both started one. Signing out stopped only one, and the other put the account's data back on the device. Start-up now runs once (`startingFor` guard) and won't start an engine for someone who signed out meanwhile. Unit-tested with mocked Supabase.
  - **A pull or push in flight at sign-out** could write the account's data back. Results that arrive after sync stops are now dropped.
  - **Sign-out used Supabase's default global scope**, which signs out every device. It's now `scope: "local"` (this device only) and clears the device immediately instead of after the network call.
  - **Live updates:** changes made before the Realtime channel joins, or while it reconnects, aren't replayed by Supabase. The engine now pulls whenever the channel (re)joins, rejoins with backoff after an error, and pulls every 60 s while the page is visible as a safety net. The channel state is exposed as `html[data-sync-channel]`.
  - **Reduced motion** now makes UI transitions instant site-wide. A button caught mid-colour-fade failed an axe contrast check under load.
  - The Surprise Me 3D test reads the eight ideas from the `/api/surprise` response, rather than racing the 4.2 s spin under load.
- **Config:** the Project URL had been pasted with `/rest/v1/` on the end (the API address); it was trimmed to the project address in `.env.local`. Next.js reads `.env.local` only at start-up, so restart `pnpm dev` after changing it.
- **Totals:** 206 unit tests, 6 RLS tests and 108 e2e tests pass, twice in a row. 6 e2e tests are skipped: the 4 from earlier phases and the "no Supabase" check, which no longer applies.
- **Still not verified here:** a real magic-link email arriving in an inbox, and a "Made it!" photo upload from the UI. The storage rules themselves are covered by the RLS test.

## Phase 7: Share, SEO, i18n polish, Day/Night (2026-10-09)

### What it is
- **Share (R5):** a share button on every recipe opens a dialog. It makes the recipe's **public link** (`/[locale]/r/[slug]`), with a preview card for WhatsApp and other apps, and offers the phone's share sheet, **WhatsApp**, **copy link**, and two pictures to save: **feed (1080×1350)** and **story (1080×1920)**.
- **Public recipe page:** the full recipe (servings, units, Cook Mode, save), Open Graph and Twitter tags, schema.org **Recipe JSON-LD** for search, and a friendly page for unknown links.
- **Day/Night kitchen (R9):** morning (cool, high sun), golden hour (the default look, 4–7 pm) and night (a pendant lamp, a candle, a moon in a deep-blue window). It follows the local clock, re-checked every minute, or a choice in the header (sun/moon menu; on phones it's in the menu). Changes ease over 1.2 s.
- **Hindi (R6):** the UI is complete in Hindi, and recipes are now *checked* to be in the language asked for.

### Decisions
1. **Share cards are drawn in the browser, not on the server.** `next/og` (Satori) can't shape Devanagari (no complex-script support), so Hindi titles would come out garbled. A canvas in the browser shapes Hindi correctly and uses the site's own fonts. The 1200×630 link card is uploaded with the share (JPEG, ~60–70 kB, well under WhatsApp's ~300 kB comfort limit); the feed and story pictures are made on demand. The card shows the counter at golden hour (the poster render), the recipe's ingredients as emoji on cream discs, the title in Fraunces, time, servings, difficulty, the ingredient list, and "Cooked up at The Living Kitchen".
2. **The link preview is 1200×630**, the size WhatsApp, iMessage, X and Facebook all show well. The spec's 4:5 and 9:16 sizes are the share-sheet pictures.
3. **Anyone can share, signed in or not.** `/api/share` validates the recipe with the same Zod schema as AI output, stores it public with the server's secret key, and saves the card in a public bucket (only the server writes either; there are no client write policies). The slug is the recipe's id plus a content fingerprint, so sharing twice gives the same link. Rate limit: 30 per hour per IP. **Risk noted:** a determined user could post their own text through the API as a "recipe" (it must still be a valid recipe shape). Phase 8 could sign recipes at generation time to only accept the app's own.
4. **The public page** is server-rendered and cached for an hour (a shared recipe never changes; a new version is a new slug). It reads with the public key, so RLS only ever returns shared rows, and validates the stored JSON again. JSON-LD goes in a `<script>` with `<` escaped. **A unit test caught that escape being silently broken** (a shell turned `\u003c` back into `<`); it's now written without a backslash in the source. `metadataBase` comes from `NEXT_PUBLIC_SITE_URL`, so OG URLs are absolute.
5. **Bug fixed: the locale middleware never ran.** Its matcher had `.*\..*` in a plain string, which is `.*..*` and excludes every path. Static pages hid it (they set their locale themselves), but dynamic pages (`/hi/r/…`, `/hi/cook/…`) showed English UI around Hindi content. With the documented `\.` the middleware runs. As a bonus, `/` now sends a Hindi browser to `/hi`.
6. **Recipe language is validated (R6).** A Hindi request whose title, tagline, missing-items line or steps aren't in Devanagari fails validation and gets the one retry with the reason. A live Hindi recipe had come back with "Add garlic and you can make…". Nutrition tags were added to the prompt's list of localized fields.
7. **Day/Night never changes a shader:** the pendant spotlight and the candle's point light always exist, at zero intensity by day. Adding lights at night would recompile every lit material (the stalls Phase 2.1 removed). The director eases sun colour, height and intensity, the fill light, environment strength, background and fog, the window tint, sunbeams and dust. Measured: no new draw calls by day, and a couple at night (lamp, candle).
8. **The UI keeps its cream "paper" look at night.** The design system's night tokens (dark cards, light text) would need every component to use semantic colours; many pair palette backgrounds with semantic text, so swapping the palette would have broken contrast in dozens of places. Instead the scene goes dark, the page background and poster dim, the glass panels become more opaque cream (cream glass over a dark scene looked muddy), and the hero line follows the time ("Late night, your counter"). Axe passes at night. A full dark UI theme can follow once components use semantic tokens.
9. **Testing:**
   - Unit (`tests/phase7.test.ts`, 8): daypart boundaries and overrides, exact light blending, the language check (and an English answer to a Hindi request failing), slug stability, card and WhatsApp URLs, JSON-LD escaping.
   - e2e (`e2e/phase7.spec.ts`, 6 scenarios × 2 projects): the day/night menu, persistence and follow-the-clock; the 3D switch with no errors; axe at night; the full share flow on the real project (link, WhatsApp href, story download, axe on the dialog, the public page with OG, Twitter and JSON-LD tags, a card under 300 kB, the Hindi chrome, back to the kitchen; rows and cards it creates are deleted afterwards); an unknown link; Hindi Cook Mode chrome; share API validation.
   - A Hindi audit script walked every page and state in Hindi (dialogs, drawers, results, recipe, Cook Mode) and found no English UI text, except "Enter" (a key name) and AI-written tags, which are now fixed in the prompt and validation.
10. **Measured (production build):**
    - **Real GPU:** 60 fps by day, at night and through the 1.2 s switch (RTX, "high", at most 70 draw calls, no long tasks). The phone stand-in (Intel, 4× CPU throttle) runs 73–94 fps, with a few 50–98 ms tasks when the phone menu and the time-of-day menu open (the DOM work of opening them, not the light fade).
    - **Share cards:** link card 60–72 kB (English and Hindi); the public page renders the recipe server-side.
    - **Initial JS:** kitchen 230 kB (was 225), share page 172 kB. The time-of-day dropdown loads on first use.
    - **Lighthouse:** desktop 99; mobile **80**, exactly the spec's floor (≥ 80), on both `/en` and a share page; a11y/BP/SEO 100. The mobile score has drifted down (85 → 84 → 82 → 80) as features landed. Profiling shows no real paint delay (the poster is the LCP, it survives hydration, and the unthrottled LCP is 376 ms). The simulated LCP counts all start-up script work on a 4×-slowed CPU, the largest piece being the inline page payload, which carries every translation string (~18 kB). **Phase 8's performance pass starts here:** per-page message bundles and trimming start-up work.
    - **Tests:** 214 unit, 6 RLS and 120 e2e tests pass, twice in a row (6 e2e skipped, as before).
11. **Housekeeping in the real database:** the RLS test now also deletes the recipes it shares (deleting a user keeps their recipes, author set to null); 12 leftovers from earlier runs and 4 shares made by the Hindi audit were removed. The e2e share test deliberately keeps its two fixed mock shares (one per project) instead of deleting them: parallel runs were deleting each other's page mid-test. `/api/share`, like the AI routes, skips its rate limit in mock mode (repeated test runs from localhost had hit it).
12. **Not verified here:** a real WhatsApp preview. WhatsApp's servers have to fetch the page, so it needs a public URL (Phase 8 deploys to Vercel). Everything WhatsApp reads is checked: `og:title`, `og:description`, an absolute `og:image` (1200×630 JPEG under 300 kB), `og:url`, and the Twitter card.

### Phase 7.1: page-switch stutter fix (2026-10-09)
- **Reported:** lag when switching from My recipes to the shopping list.
- **Cause:** the list and sign-in pages show the kitchen as a blurred backdrop capped at 10 fps (Cook Mode at 30 fps) to save battery. The cap started the instant the page changed, while the camera was still gliding from the book (or pantry) shot back to the counter, so the 1.2 s glide played at ~13 fps even on a fast GPU.
- **Fix:** `KitchenScene` keeps drawing every frame until the camera has landed (`SHOT_SECONDS` + 0.3 s after the page changes), then applies the cap. The camera move into the list now measures ~60 fps on desktop and 63–107 fps on the phone stand-in (was 13). The battery saving is unchanged once the move is over.
- **Left as is:** on the 4×-slowed phone stand-in, turning on the blurred backdrop (list or sign-in) costs ~130 ms more than other page switches, plus a one-off ~100 ms task on the first visit. Desktop shows neither. Tracked for Phase 8's performance pass.
- **Follow-up report:** the falling ingredients still stuttered behind the shopping list.
  - **Cause:** on this laptop, Chrome runs WebGL on the **Intel UHD**, not the RTX 4050. That's Windows' default for Chrome, and `powerPreference: "high-performance"` doesn't change it. A fresh load starts "auto" at **medium**. On the kitchen page the PerformanceMonitor steps down to low within ~2 s, but it's paused behind the list, sign-in and Cook Mode (their deliberately low frame rate would read as a slow GPU). So the list stayed at medium: ~30 fps, with a 118 ms freeze while items fell.
  - **Fix 1, backdrop resolution:** the blurred backdrop pages render at `dpr` 0.6. The blur hides the difference (screenshot checked). Measured on Intel at medium, the rain behind the list went from ~30 fps to ~97 fps.
  - **Fix 2, remembered tier:** when "auto" steps down, the tier is remembered per GPU name (`localStorage` `lk-tier-learned`), and the next visit starts there instead of stuttering until it steps down again. It never goes above the first guess, a manual quality setting wins, and another GPU starts fresh. Fresh list load on Intel: ~140 fps, worst frame 14 ms.
  - **Fix 3, motion keeps frames coming:** a shared `markMoving()` signal (falling, bouncing or puffing items, the waiting rain, the lid, the day/night fade, the camera glide). While it's set, the throttled backdrop draws every frame and returns to 10 fps ~150 ms after everything is still.
  - **Tip for the user:** to run the 3D on the RTX, set Chrome to "High performance" in Windows Settings › System › Display › Graphics.

## Phase 8 (part 1): safety & limits, performance, accessibility (2026-10-10)
The user asked for items 2–4 of Phase 8 only. Still to do: offline/PWA, monitoring, and the Vercel deploy.

### Safety & limits
1. **Shared rate limits in Supabase, not Upstash.**
   - Migration `20261010000000_phase8_hardening.sql` adds a `rate_limits` table and a `hit_rate_limit()` function. The function is atomic: a fixed one-hour window that starts at the first request.
   - Only the service role can execute it, and browsers can't read the table. Both are tested against the real project.
   - Why Supabase: it's free and the project already has it (docs/04 allows "Upstash Redis or Supabase-based").
   - If the database call fails, the per-instance in-memory limiter still applies.
2. **Who is counted.**
   - A signed-in user is identified by a verified `Authorization: Bearer` token. The browser sends it only when a session is stored, so guests never load supabase-js.
   - Guests are counted by HMAC-SHA256 of the IP address, keyed with the service-role secret, so no IP address is stored.
   - On Vercel, `x-forwarded-for` is set by the platform, so clients can't spoof it.
   - Limits per hour:

     | Route | Guest | Signed-in user |
     |---|---|---|
     | Generate (docs/01 §7) | 20 | 60 |
     | Scan | 15 | 45 |
     | Surprise | 30 | 90 |
     | Share | 30 | 60 |
   - Limits are off in mock mode (local development and e2e), as before.
3. **24-hour cache of recipe answers** (docs/04 §4).
   - Keyed by a hash of the request: ingredients, pantry, preferences, language, excluded titles, wish, and the provider/model. Order, case and spacing are ignored.
   - Only complete answers (exactly 3 recipes) are stored. They are validated again with Zod when read.
   - Stored in the `ai_cache` table (server-only), with an in-memory LRU of 200 entries in front of it.
   - A hit replays as a short stream (about 1.3 s, so the pot still bubbles) and does **not** count against the hourly limit.
   - Old rows are swept now and then.
   - Not cached: Surprise Me (meant to be random), fridge scans (photos are never kept), and anything in mock mode.
4. **Security headers on every route** (`next.config.ts`).
   - CSP:
     - `default-src 'self'`; images, API and websocket only from the project's own Supabase host.
     - `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `worker-src 'self' blob:`.
     - `'wasm-unsafe-eval'` for the physics engine.
   - Other headers: nosniff, `Referrer-Policy`, `Permissions-Policy` (microphone only), COOP, HSTS. The `X-Powered-By` header is removed.
   - **Trade-off:** `script-src` keeps `'unsafe-inline'`. Next.js streams inline bootstrap scripts, and per-request nonces would make every page dynamic (no static kitchen, no ISR). The XSS defences are React's escaping, never rendering model HTML, and the escaped JSON-LD.
   - A walkthrough recorded **zero CSP violations**: 3D, physics, cooking, sharing, scanning, Cook Mode, every page, and a real share page with its card.
5. **Settings page `/settings`** (docs/01 §6), linked by a gear icon in the header and a row in the phone menu.
   - Settings: language, units, diet, 3D quality (Auto/High/Medium/Low/Off, applied immediately), sound.
   - **Your data** (docs/01 §7):
     - It explains what is kept where. Scan photos are never stored; "Made it!" photos only when the user adds one.
     - **Download my data:** this device's `lk-` keys, plus the account's own rows when signed in. Never the sign-in session.
     - **Delete my data:** asks first in a confirmation dialog. For an account, `DELETE /api/account` (token verified fresh) removes the photos, then the user's recipes (they would otherwise outlive the user with `author = null`), then the user, which cascades to everything else. Then the device is cleared and the page reloads, so no in-memory store can write the old data back.
     - Shared links are anonymous (no author), so they stay up.
6. **Housekeeping:** one throwaway test user left behind by a failed test run was deleted. The new database test now cleans up even when it fails.

### Performance
7. **Fonts were the lever: 227 kB preloaded → about 118 kB.** Lighthouse mobile 79 → **81–82** (5 runs).
   - Fraunces dropped its SOFT/WONK axes: 118 → 65 kB.
   - The hero headline uses a static Fraunces instance with those values baked in (opsz 72, wght 600, SOFT 100, WONK 1): 17 kB, self-hosted under the OFL (`src/fonts/`). It looks the same.
   - Caveat is one weight and not preloaded: 73 → 47 kB, loaded when used.
   - Why fonts: on Lighthouse's simulated slow 4G, everything requested before the first paint shares the connection, so early bytes drive LCP.
8. **Measured and rejected:**
   - Per-page translation bundles: a build with *no* messages at all scored the same (77–79). The Phase 7 guess was wrong.
   - `experimental.inlineCss`: +1 point, but the CSS ended up twice in each page (+25 kB gz per page, never cached).
   - Lazy framer-motion features and not preloading the headings font: scored worse.
9. **Bundles and assets:**
   - Initial JS: kitchen 230 kB, settings 155 kB, all within the 250 kB budget.
   - The 816 kB (gz) physics chunk stays lazy.
   - Static assets: only the two WebP posters (34 and 17 kB). The 3D is procedural and the sounds are synthesised, so there's nothing else to compress.

### Accessibility
10. **Audit across 17 page states × desktop/mobile × day/night, plus the Hindi pages.**
    - axe (WCAG 2.0/2.1/2.2 AA + best practice), structure checks, and a Tab walk asserting a visible focus ring on every stop.
    - The Tab walk found no problems.
    - Fixed:
      - Cook Mode's top bar and progress were outside any landmark; the whole Cook Mode screen is now the `<main>`, in all three states.
      - Unknown addresses fell through to Next's bare 404 (no `lang`, no `<main>`). They now render a localized 404 inside the site (`[locale]/[...rest]` + `[locale]/not-found.tsx`).
      - Recipe results changed from `complementary` to a named region (they are the main content).
      - Removed a redundant region label on Settings.
11. **Added a skip link** ("Skip to content", WCAG 2.4.1). It is the first Tab stop and focuses `<main id="main">` on every page.
12. **Screen readers.** No real screen reader can be driven here, so the accessibility tree was reviewed instead.
    - Landmarks, names, and heading order are right.
    - These are announced: adding ingredients, "Asking Nani…", results (focus moves to "Fresh out of the pot"), opening a recipe (focus moves to its title), and Cook Mode steps (live region).
    - **Not verified:** a pass with a real screen reader (NVDA, TalkBack, VoiceOver).
13. **Phase 0 test fix:** it expected the cream daytime background but ran after 7 pm, when the page follows the clock into night. The test now pins daytime.

### Tests
- **Unit:** 225 (+9). Limits, cache key, cache store and replay, export, and delete.
- **Real database:** 9 (+3). The limiter blocks, browsers can't touch the limiter or cache, and deleting an account removes rows, recipes and photos.
- **e2e:** 135 passed, 7 skipped (+15 new). Security headers, delete auth, settings persistence, export, delete flow, axe on settings and 404 in both languages and at night, and a keyboard-only flow from the skip link to Cook Mode and back.
- **Real (non-mock) dev server, without any AI call:** a guest at the limit gets 429 with Retry-After of about 1 h; a repeat request is a cache HIT that isn't counted against the limit.

## New features: "Name a dish" and drinks (2026-10-10)
The user asked for two features beyond the build plan and made three choices:
- a named dish returns **one recipe, opened straight away**;
- drinks are **non-alcoholic unless asked**: a spirit on the counter or a cocktail named;
- drinks get **a glass in 3D** instead of the pot.

### Name a dish
1. **Dock layout.** The dock has two tabs: "What I have" (the original flow, unchanged) and "Name a dish".
   - The dish tab has a labelled text box, four suggestion chips (they change with Food/Drinks), Preferences and **Show me how**.
   - The tabs are Radix Tabs: arrow keys, Enter, and screen-reader tab semantics.
2. **Request and validation.**
   - `POST /api/recipes/generate` gains `mode: "ingredients" | "dish"` (default `ingredients`, so older clients keep working), `dish`, and `category`.
   - Dish mode needs no counter; ingredients mode still needs at least one ingredient.
   - The answer is validated against `DishRecipeSetSchema` (exactly one recipe), with the usual one retry.
3. **How it's made.**
   - A separate system prompt (`DISH_SYSTEM_PROMPT`) shares all the hard rules with the original one (`RECIPE_RULES`).
   - Counter and pantry items are marked "have", everything else "missing" (to buy).
   - `kind` is `best_match` when nothing is missing, otherwise `almost_there`.
4. **The diet swap is narrow.** The first real test turned "Chilli Chicken" into "Chilli Paneer" with no diet set: the model copied the prompt's own example. Now the dish is made exactly as named, and only a diet that forbids a main ingredient changes it (vegetarian + Chilli Chicken → Chilli Paneer, re-titled and explained in the tagline). Verified with the real model.
5. **Flow.**
   - With 3D: the single card rises from the pot (or glass) and flies to the camera; the recipe opens.
   - Without 3D: it opens directly.
   - The Back button reads "Back to the kitchen" (there's no list of ideas to go back to).
   - Retry after an error re-asks for the same dish. A language switch re-asks in the new language.
   - Counter ingredients don't hop into the pot for a named dish: they aren't necessarily part of it.

### Drinks
6. **Food/Drinks switch** in the dock, remembered on the device (`lk-kitchen.category`). It applies to both tabs and is locked while something is cooking.
   - Drinks mode: the quick-add row becomes "Drink basics", the Cook button becomes **Mix** (with a cup), the results title is "Poured and ready", loading lines are drink-themed, and Surprise Me spins drink ideas.
7. **Recipe format: two new fields**, `category` (`food`/`drink`) and `contains_alcohol`.
   - In Zod they default to food / false, so every recipe already saved, cached or shared stays valid.
   - The model's output schema requires both.
   - Both are in `reference/recipe.schema.json`, but not in its `required` list (older recipes lack them).
   - The recipe page shows a "Drink" badge, and "Contains alcohol · adults only" when true.
8. **Alcohol rule.** Non-alcoholic by default. Alcohol only when the user's own ingredients include it, or the named dish is a cocktail; "virgin"/"mocktail" in the name keeps it alcohol-free. An alcoholic recipe carries a "responsibly, adults only" tip. Verified with the real model: "Mojito" (white rum, `contains_alcohol: true`) vs "Virgin Mojito" (no alcohol); drinks from milk, ginger and tea had no alcohol.
9. **Drink steps reuse the existing actions** (no new enum, so Cook Mode and its 3D needed no new cases): blend = `grind`, shake or stir = `mix`, brew = `boil`, chill = `rest`, pour and garnish = `plate`.
10. **New dictionary items:** tea leaves, coffee, ice cubes, soda water, ice cream. "Soda water" and plain "soda" (baking soda) still resolve to the right items.

### The glass (3D)
11. **What it is.** `DrinkGlass.tsx`: a tapered tumbler with a rim highlight, amber liquid that fills, a turning swirl on top, instanced fizz bubbles that follow the AI's progress, ice cubes, and a straw when the drink is ready.
    - About 8 draw calls while visible, 0 when hidden. Mounted hidden, so the start-up warm-up compiles its shaders.
12. **Where it stands.** On the linen towel at the front left of the stove: outside the ingredient drop zone, clear of props, and it looks natural. An early screenshot showed the towel under the glass as an odd white slab; it was the towel all along.
13. **One "vessel" for the whole sequence.** `cook.vessel` / `cook.target` decide where ingredients hop, splashes fly (smaller and paler for the glass), cards rise, and depth of field focuses.
    - The director drives the pot or the glass from the request's category (`requestCategory`), so flipping the switch while results show doesn't swap them.
    - Errors fizz over instead of boiling over.
    - Start over pops the ingredients back out, then the glass empties and leaves.
14. **Camera.** The glass's shots are the pot's shots (stove, error, reveal, Cook Mode) moved by the glass offset (`GLASS_OFFSET`). A unit test checks the offset matches the 3D positions.
15. **Cook Mode for drinks.** The glass acts out mixing, blending, chilling and pouring; brewing steps (chai on the boil) stay at the pot, chopping at the board.

### Caching and measurements
16. **Cache key** now includes mode, category, dish name and **a fingerprint of the AI instructions**. A test hit a stale cached Mojito from before the alcohol fix; changing the instructions now retires old answers automatically.
17. **Measured.**
    - Real GPU: 78 draw calls max (budget 100). On the user's Intel GPU, mixing a drink averages 103 fps.
    - Lighthouse mobile 81–82 (unchanged); kitchen initial JS 240 kB (was 230; budget 250).
    - Real model: 9 calls in total (dish, drinks, Hindi, alcohol and diet checks) on the free tier.
18. **Tests.**
    - Unit 238 (+13): schemas and old recipes, dish validation, prompts, cache keys, mocks, glass shots and looks.
    - e2e 148 passed, 8 skipped (+13): dish flow with axe, empty input and keyboard tabs, retry as the same dish, Hindi, drinks from the counter (request shape, "Poured and ready", badge, remembered choice), a named drink chip, and the 3D glass with no errors.

### Fix: header buttons not working (2026-10-10)
- **Cause:** the dev server's build cache (`.next`) was corrupted while it recompiled during a burst of edits; for a moment one file was mid-edit with a syntax error. Every page and script then returned 500 "Unexpected … JSON". The page could still show from before, but its scripts never loaded, so no button responded. The production build was never affected (all e2e tests passed on it).
- **Fix:** stopped the dev server, deleted `.next` (it is regenerated) and restarted. A real-click check of every header control on the dev server now passes: the page links, settings, sign-in, the day/night menu, the sound button, and the language switch both ways.
- **Added `pnpm dev:fresh`:** clears `.next` and starts the dev server, for the next time this happens.
- **Note:** in dev mode, the first visit to each page compiles it first (about 2 s), which can feel like a dead click. After that it's about 0.6 s. Production builds have no such delay.

## Four more ideas: WhatsApp list, voice Cook Mode, real 3D models, leftovers (2026-10-10)
The user picked feature 3 (list on WhatsApp), feature 7 (hands-free voice Cook Mode), design 8 (real 3D ingredient models) and feature 2 (leftovers mode). For the models they approved downloading Kenney's Food Kit.

### Real 3D ingredient models (design 8)
1. **Source.** Kenney "Food Kit" 2.0, **CC0**: a 4.6 MB zip with 200 GLB models, downloaded with the user's approval and credited in `public/CREDITS.md`. Its soft low-poly style matches the clay look, so no restyling was needed.
2. **What maps.** 43 of our ingredients have a good match (`src/data/ingredientModels.ts`): vegetables, fruit, milk, cheese, egg, fish, meat, bread, sauces, salt, pepper and more.
   - Garlic, ginger, potato, spinach, paneer and chicken have no good match; they and everything else keep the clay blob (project rule 7).
   - The old "40 MVP models" placeholder list was replaced by the real set; its test now checks that each ingredient is marked as having a model exactly when a file exists.
3. **Files.** Each model is one small GLB (8–94 kB, 699 kB for all 43), sharing one 10.7 kB palette image, served from `public/models/ingredients/`. That's well under the 200 kB budget per model.
   - Nothing loads at startup: a model is fetched only when its ingredient lands on the counter.
   - No build tooling was added (gltf-transform wasn't needed at these sizes).
4. **Loading** (`ingredientModels.ts`).
   - An ingredient with a model waits for it, up to 1.5 s, before dropping, so its physics hull is built from the real shape; if it's slow or fails, the clay blob drops instead.
   - Models are normalised to a per-item counter size and centred like the clay blobs.
   - The model is fixed when the item lands, so a late model can't swap the shape out from under its collider.
   - One shared palette texture; the duplicate copies each file brings are released.
5. **Look and performance.**
   - Same matte finish, gold hover outline and expiring glow as the clay blobs.
   - A hidden placeholder mesh lets the start-up warm-up compile the textured material, so the first model doesn't stall a frame.
   - Measured: 89 draw calls max with 15 items (budget 100); on the user's Intel GPU, 10 models raining in average 116 fps (worst frame 47 ms).

### Voice Cook Mode (feature 7)
6. **Already there since Phase 4:** next, back, repeat, start/stop timer, ingredients, and steps read aloud. Extended with `parseVoiceIntent`:
   - Timers of any length: "set a timer for 5 minutes", "five minute timer", "half a minute timer", "5 मिनट का टाइमर", "das minute ka timer". Digits, Devanagari digits and English, Hindi and Hinglish number words all work.
   - Jumping to a step: "go to step 3", "स्टेप 2 पर जाओ".
   - "How much time is left?" (speaks every running timer), "What's next?" (reads the next step without moving), and "Help".
   - "Ingredients" now also reads the list aloud, scaled to the chosen servings and units.
   - Spoken confirmations for timers and an unknown step.
7. **Help and memory.** "Voice commands" under the "Listening" line opens a list of everything you can say. Turning voice on is remembered (`lk-voice`), so the next Cook Mode starts listening by itself.

### Shopping list on WhatsApp (feature 3)
8. A green **Send on WhatsApp** link (white on `#1f7a4d` passes AA contrast) opens WhatsApp with the list ready to send to anyone.
   - The message: a bold title with the item count, then a bold heading with an emoji for each aisle; ticked items are left out.
   - It uses the page's language, and works on phones and desktop (wa.me opens the app or WhatsApp Web).
   - The share-sheet button stays for other apps.

### Leftovers (feature 2)
9. A **Leftovers** quick-add row next to Staples and Sauces: leftover rice, dal, rotis, sabzi, curry, chicken, pasta, and stale bread. Each is a new dictionary item, and typed "leftover rice", "basi roti" or "बासी रोटी" are recognised too.
   - "Cooked rice" moved from plain rice to Leftover rice, so typing "rice" still means uncooked rice.
   - Chips get a "Leftover" tag.
10. **What the AI is told.** Leftover items go to the AI marked `[LEFTOVER]`. The shared rules say: turn them into something new (no cooking from scratch), list them in "uses up", and include a food-safety tip (refrigerated within 2 hours, eaten within a day, reheated until steaming hot).
    - Verified with the real model: leftover rice + dal + onion → Leftover Dal Rice Tava Pulao, Crispy Dal Rice Fritters and Rice & Dal Congee, each using both leftovers and carrying the safety tip.
    - The leftover flag is part of the cache key.

### Measurements and tests
11. **Measurements:** Lighthouse mobile 81 (within run-to-run noise of 82); kitchen initial JS 241 kB (budget 250); 1 real AI call.
12. **Tests.**
    - Unit 245 (+7): voice intents in three languages, WhatsApp text, leftovers parsing, prompt and cache key, and model files present for every mapped id.
    - e2e 156 passed, 8 skipped (+8): voice timers, time left, jump to a step, what's next, help, and the remembered setting, all with fake speech in and out; the WhatsApp link text; leftovers row, tag and request flag; and the real models loading (tomato and onion fetched, garlic stays clay), with no errors.

## Fix: header buttons "not working" in `pnpm dev` (2026-10-10)
1. **Cause.** Not a bug in the header. In dev, Next.js compiles each page on its first visit, and it was pulling in the whole `@phosphor-icons/react` barrel (thousands of icon modules; Next optimizes some icon packages by default, but not Phosphor).
   - The kitchen took ~85 s to compile (12,622 modules) and Settings ~12 s.
   - A header link clicked during that wait seemed dead. It got worse after every restart or `.next` wipe, when every page is cold again.
2. **Fix.** `experimental.optimizePackageImports: ["@phosphor-icons/react"]` in `next.config.ts`.
   - The kitchen now compiles 3,288 modules (4× fewer). A cold header click takes 1–5 s, and about 0.5 s once warm.
   - Production output is unchanged (241 kB).
3. **Only Phosphor.** It was the big barrel; `radix-ui` and `@react-three/drei` were left as they are.
   - The models e2e test was racy: it checked the downloads when the counter reached 3, which can happen before they finish. It now waits for them.
4. **The other cause** (the two earlier reports) was an open tab hot-reloading half-finished edits. After a round of changes, hard-refresh (Ctrl+Shift+R), or run `pnpm dev:fresh` if `.next` is corrupt.
5. **Warm-up.** `pnpm dev` (and `pnpm dev:fresh`) now run `scripts/dev.mjs`: it starts `next dev` and then opens every page once, one after another, so each one is compiled before you click it.
   - Measured from a cold `.next`: every page is ready about 45 s after "Ready". After that, header links respond in 0.5–0.8 s on their first click.
   - Clicking around while the warm-up is still running can return one 500 ("Unexpected end of JSON input"). Next's dev server has this race when two pages compile at once on Windows. The next request is fine.

## Bengali (bn) language (2026-10-10)
1. **A third locale, `bn`.**
   - Every screen is translated (`src/i18n/bn.json`, the same 579 lines as English, in Kolkata-style standard Bengali); a test checks the keys match and every ICU message parses.
   - The header switch reads EN · हि · বা; Settings lists বাংলা.
   - Nani stays নানি. Dish ideas lead with Bengali favourites (সর্ষে ইলিশ, আলু পোস্ত, মাছের ঝোল).
2. **Fonts.** Noto Sans/Serif Bengali, loaded only when Bengali text is on screen (unicode-range, not preloaded), like the Devanagari pair. On other pages the "বা" label uses the system font, so English pages download nothing extra.
3. **Ingredients.**
   - Every one of the 186 dictionary ingredients has a Bengali name (`src/data/ingredientNamesBn.ts`), shown on chips, suggestions, the pantry, scans and 3D labels.
   - Typed Bengali and romanised Bengali are both understood: "২টো টমেটো, পালং শাক আর ডিম", "begun", "dhone pata", "kancha lonka". That covers Bengali digits, the counting words (দুটো, তিনটে), units (গ্রাম, আঁটি), "and" words (আর, এবং, ও) and "আমার কাছে … আছে".
   - "badam" was kept as almonds (its Hindi meaning), not peanuts (its Bengali meaning).
4. **Cook Mode.**
   - Timers are found in Bengali steps ("১০ মিনিট", "৫ থেকে ৭ মিনিটের জন্য", "আধ ঘণ্টা").
   - Voice runs in bn-IN, with Bengali commands: পরের, আগের, আবার বলো, ধাপ ৩-এ যাও, এরপর কী, ৫ মিনিটের টাইমার, টাইমার বন্ধ করো, কত সময় বাকি, সাহায্য.
   - Ingredient dictation offers EN and বাং on Bengali pages.
5. **The AI.**
   - The prompts list `"bn"` as Bengali in Bengali script, and the language check makes every title, tagline, summary and step use the Bengali script (one retry otherwise).
   - The first real answer from the lite model was badly misspelt ("শর্লে মাছ" for সর্ষে). Two fixes were tried:
     - Gemini Flash first: correct, but it took 100 s.
     - A prompt rule instead: write standard, correctly spelled Kolkata-cookbook Bengali with everyday kitchen words and the polite form. That gave correct Bengali from the lite model in 10–14 s (Dim Alur Patla Jhol, Alu Dimer Kosha, Doi Murgi). So the model order is unchanged.
6. **Cost.** Kitchen initial JS 241 → 245 kB (budget 250), from the Bengali ingredient names.

## Fix: grey scrollbar on the desktop ingredient panel (2026-10-10)
1. **Cause.** The panel had grown with the dish tabs, Food/Drinks and the leftovers row, to 600 px. Its cap is a share of the window height, so at every common laptop size (1280×720 to 1536×864) it scrolled.
   - Windows then drew its grey scrollbar across the glass panel's rounded corner.
   - At 1366×768 the tabs also scrolled out of view.
2. **Fix: shorter content, desktop only.** Phones are unchanged.
   - "Scan fridge" moved into the input row beside the mic.
   - The "Add ingredients" heading is screen-reader-only on desktop (the "What I have" tab already says it).
   - Spacing is a little tighter (16 → 12 px gaps, 20 → 16 px padding).
   - The cap rose from 64% to 70% of the window height, still under 620 px, so the camera's drop zone above the panel stays clear.
   - The panel is now 490 px and doesn't scroll at any of those sizes.
3. **Scrollbars everywhere** are now thin and warm with no track (`scrollbar-width: thin`, a walnut-tinted thumb), for whatever still scrolls: small windows, the use-it-up nudge, long chip lists.

## New feature: "What's for dinner?" one tap (2026-10-10)
1. **What it does.**
   - One button under the kitchen headline sends the pantry, anything on the counter and the time of day; Nani picks one dish and it opens straight away, like "Name a dish".
   - The label follows the clock and the Food/Drinks switch: What's for breakfast? / lunch? / a snack? / dinner? / What should I drink?
   - It is available in en, hi and bn.
2. **Where it lives.** Under the hero headline. On desktop it steps back with the hero once the counter is in use (Cook takes over there); on phones it stays at the top of the sheet. The dock stays at 490 px.
3. **Always uses the pantry,** even with "Use my pantry" off: picking from what you keep is the point of it. With an empty pantry and counter, Nani picks something simple and lists what to buy.
4. **A new request mode, `tonight`.**
   - It gets its own prompt: one familiar weeknight-style dish suited to the meal, nothing extra to buy if possible (at most 3 common things), expiring items first, and a tagline saying why this dish now.
   - It reuses the one-recipe schema, validation, Gemini/Claude formats and the 3D reveal of "Name a dish", through `isSingleRecipe(mode)`.
5. **"Something else."** The opened pick has a "Something else" button. Each pick is remembered for the visit (up to 8) and sent as `exclude`, so asking again gives a new dish. Switching language re-asks for the same pick, not a new one.
6. **Bundle.** `isSingleRecipe` lives in `constants.ts`, not `schema.ts`: importing a value from schema.ts in the kitchen store pulled all of Zod into the page (245 → 272 kB). A unit test now stops stores from value-importing schema.ts.
   - The kitchen's initial JS is 247 kB (budget 250).
7. **Real check:** spinach (expiring) plus a pantry of rice, dal and basics, vegetarian, at most 30 min, dinner. Answer: "Palak Dal Khichdi: Comforting and warm for dinner, and it uses up your spinach." Best match, nothing to buy, 14 s.
8. **Test stability.** All accessibility checks now go through `e2e/axe.ts`, which waits for entrance animations to finish before measuring.
   - On the heavier full suite, axe had caught panels mid-fade and reported blended text colours (4.2–4.4:1). At rest the same text is 4.82:1.

## Fix: black squares over the 3D kitchen on phones (2026-10-14)
1. **Symptom.** On an Android phone (live site), large stepped black blocks covered the wall and window every time the page opened.
2. **Cause.** Phone GPUs compute in lower precision. A hot highlight can overflow to Infinity or become NaN in a single pixel, and bloom's mipmap blur spreads that pixel across its downsampled levels into big black squares.
   - Reproduced on desktop by injecting one NaN and one Infinity patch into the scene: 39% of the canvas turned black, in the same stepped shape as the phone.
3. **Fix.** `SanitizePass` (`src/components/scene/sanitizePass.ts`) is the first post-processing pass.
   - NaN becomes black, Infinity and anything above 32 is capped, and negatives are clamped to 0, before bloom or any other effect reads the frame.
   - Same injection with the fix: 0.2% near-black, a normal kitchen, no shader errors.
   - Cost: one cheap full-screen pass. It only exists on tiers that use post-processing (medium, high).
