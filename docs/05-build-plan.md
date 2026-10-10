# 05 · Build Plan (follow in order)

Each phase ends with something runnable. Do not start a phase until the previous phase's **Definition of Done (DoD)** passes, including `pnpm lint && pnpm typecheck && pnpm test`.

---
## Phase 0: Scaffold & foundations
- `pnpm create next-app` (TS, App Router, Tailwind, ESLint, `src/`), then add Prettier.
- Install: `three @react-three/fiber @react-three/drei @react-three/rapier @react-three/postprocessing gsap framer-motion zustand zod @anthropic-ai/sdk @supabase/supabase-js @supabase/ssr next-intl howler @phosphor-icons/react` and dev deps `vitest @testing-library/react playwright @axe-core/playwright`.
- Copy `reference/tokens.css` into `src/styles/` and wire it into the Tailwind theme.
- Load the fonts via `next/font/google`: Fraunces (with SOFT/WONK axes), DM Sans and Caveat.
- Set up next-intl with `en` and `hi` and the `[locale]` routing.
- Create `.env.local` from `.env.example`. Mock AI mode on by default.
- Create the `docs/DECISIONS.md` log.
- **DoD:** the app runs with the cream background, fonts load, the locale switch works and the CI scripts pass.

## Phase 1: Recipe engine (no 3D yet)
- `data/ingredients.ts` (start with ~150 common Indian + global items and grow later), `parseIngredients.ts` with tests.
- The IngredientDock UI: input, autocomplete, chips, staples row.
- PreferencesDrawer (F4) persisted in localStorage.
- `lib/ai/*`: schema, prompts, the Claude client with forced tool use, and `/api/recipes/generate` with SSE plus mock fixtures.
- ResultsPanel with the 3 recipe cards, then RecipeView (F5, F6), IngredientList with have/missing/optional, the SubstituteMenu (F7) and ServingScaler (F8) with `scaleRecipe` tests.
- NutritionPlate as a 2D SVG donut for now (F10).
- **DoD:** typing 4 ingredients, pressing Cook, and seeing 3 validated recipes works in mock mode and with a real API key. Scaling and substitutions work. Lighthouse a11y ≥ 95.

## Phase 2: The Living Kitchen scene
- A lazy-loaded `KitchenScene` with the poster fallback and the quality tiers plus PerformanceMonitor.
- Counter, window, props, pot, stove and board. Use primitive placeholder shapes first, then swap in models from 06-assets.
- Golden-hour lighting, environment, contact shadows and dust motes.
- The camera rig with the `intro` and `counter` shots, idle sway and parallax.
- Ingredient3D with rapier physics, the squash-bounce landing, the fallback clay blob, removal with a dust puff, hover outlines and chip↔object focus sync.
- Steam shader (idle density).
- Responsive layout: desktop floating panels; mobile bottom sheet plus the top 45% canvas.
- **DoD:** adding and removing ingredients animates correctly, 60 fps desktop and 30+ fps on a mid-range phone (throttled test), and `?no3d=1` plus reduced-motion paths work.

## Phase 3: The Cook sequence (the magic moment)
- `useCookSequence`: the stove shot, the lid lift, the arcing hops into the pot, the splash, and bubbles plus steam driven by SSE progress.
- RecipeCards3D rising from the steam, then the selection flies to the DOM panel.
- Loading lines, sound design (optional, off by default) and the "Start over" flow.
- Postprocessing per tier, with DoF during the reveal.
- **DoD:** the full flow feels seamless with no layout jank. The API error path shows the "pot boiled over" state with a retry. Recorded in a Playwright video.

## Phase 4: Cook Mode
- The `/cook/[id]` full-screen stepper, big type, swipe/keys, and the wooden-spoon progress.
- `detectTimers` with tests, then TimerDock with concurrent timers, sound and vibration.
- Wake Lock plus voice commands (Web Speech), with graceful fallback.
- A background scene action per step (chop/stir/fry/boil/rest) with DoF dim.
- **DoD:** a complete recipe can be cooked hands-free on a phone, and timers survive navigating between steps.

## Phase 5: Input superpowers
- Voice input (F3) with en-IN and hi-IN.
- Fridge scan (F2): client resize, `/api/scan`, a review sheet, and the "ingredient rain" drop.
- Surprise Me (R3) with the lazy-susan wheel.
- **DoD:** scanning a sample fridge photo (add 3 to `tests/fixtures/images`) yields sensible chips, and voice adds chips in both languages.

## Phase 6: Accounts, Pantry, Book, List
- Supabase project, migrations, RLS policies and auth (Google, magic link, phone OTP).
- `sync.ts` guest → account merge.
- My Pantry (R1) page plus the 3D shelf, and the "Use my pantry" toggle.
- Use-It-Up (R4): expiry dates, the amber glow and the prioritisation flag sent to the AI.
- Recipe Book (R2): collections, notes, ratings and a "Made it" photo. Grid view first, then the 3D flip book.
- Shopping list (R8).
- **DoD:** sign in on two devices and the data syncs. Guest data merges on sign-in. RLS is verified by a test that another user cannot read the data.

## Phase 7: Share, SEO, i18n polish, Day/Night
- Public `/r/[slug]` pages with metadata, and the OG image route (R5) with feed + story sizes. Web Share, WhatsApp and copy link.
- Complete the Hindi translations. Recipes are generated in the chosen locale (R6).
- Day/Night kitchen (R9) with the time-based default and the header toggle.
- **DoD:** sharing a link on WhatsApp shows a beautiful preview card and the Hindi UI is complete.

## Phase 8: Hardening & launch
- PWA and offline Cook Mode, rate limiting, response caching and CSP.
- Performance pass: asset compression audit, bundle analysis, Lighthouse targets from 01-product-spec §7.
- Accessibility pass with axe, keyboard-only and screen reader testing.
- Error monitoring (Sentry optional) and Vercel Analytics.
- Deploy to Vercel with env vars set.
- **DoD:** the production URL is live and every target in 01-product-spec §7 is met.

---
### Nice-to-haves after launch
Meal planner (weekly), cost estimate per recipe, community "Made it" gallery, more regional languages, recipe video generation, a smart-fridge integration.
