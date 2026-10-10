# 04 · Architecture

## 1. Folder structure
```
living-kitchen/
├─ public/
│  ├─ models/ingredients/*.glb      # compressed ingredient models (see 06-assets)
│  ├─ models/kitchen/*.glb          # counter, pot, stove, board, props, book, shelf
│  ├─ hdri/kitchen_golden_1k.hdr
│  ├─ textures/                     # KTX2 textures
│  ├─ sounds/*.webm|mp3
│  ├─ hero-poster.webp              # static render of scene (fallback + LCP image)
│  └─ manifest.webmanifest, icons/
├─ src/
│  ├─ app/
│  │  ├─ [locale]/
│  │  │  ├─ layout.tsx              # fonts, providers, header
│  │  │  ├─ page.tsx                # Kitchen (core flow)
│  │  │  ├─ r/[slug]/page.tsx       # public recipe
│  │  │  ├─ cook/[id]/page.tsx      # Cook Mode
│  │  │  ├─ book/page.tsx
│  │  │  ├─ pantry/page.tsx
│  │  │  ├─ list/page.tsx
│  │  │  └─ settings/page.tsx
│  │  └─ api/
│  │     ├─ recipes/generate/route.ts   # POST, SSE stream
│  │     ├─ recipes/[id]/route.ts       # GET saved/public recipe
│  │     ├─ scan/route.ts               # POST image → ingredients
│  │     ├─ surprise/route.ts           # POST → 8 dish ideas
│  │     └─ og/[slug]/route.tsx         # share image
│  ├─ components/
│  │  ├─ scene/                     # ALL R3F code (client only)
│  │  │  ├─ KitchenScene.tsx        # <Canvas> root, quality tier, lights, env
│  │  │  ├─ Counter.tsx, Pot.tsx, Stove.tsx, CuttingBoard.tsx, Window.tsx, Props.tsx
│  │  │  ├─ PantryShelf.tsx, RecipeBook3D.tsx, SurpriseWheel.tsx
│  │  │  ├─ Ingredient3D.tsx        # model loader + physics + fallback blob
│  │  │  ├─ IngredientField.tsx     # maps store → Ingredient3D instances
│  │  │  ├─ Steam.tsx, Bubbles.tsx, Splash.tsx, DustPuff.tsx, GodRays.tsx
│  │  │  ├─ RecipeCards3D.tsx       # cards rising from steam
│  │  │  ├─ cameraRig.ts, useCookSequence.ts, lighting/timeOfDay.ts
│  │  │  └─ Effects.tsx             # postprocessing per tier
│  │  ├─ ui/                        # buttons, chips, sheet, dialog, toast, timer...
│  │  ├─ kitchen/                   # IngredientDock, PreferencesDrawer, ScanSheet, VoiceButton, ResultsPanel
│  │  ├─ recipe/                    # RecipeView, IngredientList, StepList, NutritionPlate, SubstituteMenu, ServingScaler, ShareButton
│  │  └─ cook/                      # CookMode, StepScreen, TimerDock, VoiceControl
│  ├─ data/
│  │  ├─ ingredients.ts             # dictionary: id, names{en,hi}, aliases, category, emoji, model, color
│  │  ├─ substitutions.ts
│  │  └─ units.ts
│  ├─ lib/
│  │  ├─ ai/claude.ts               # SDK client
│  │  ├─ ai/prompts.ts              # system + user prompt builders
│  │  ├─ ai/schema.ts               # zod schema mirrored from reference/recipe.schema.json
│  │  ├─ scale.ts                   # scaleRecipe(), unit conversions
│  │  ├─ parseIngredients.ts        # text/voice → ingredient ids + qty
│  │  ├─ timers.ts                  # detect durations in step text
│  │  ├─ supabase/{client,server}.ts
│  │  ├─ ratelimit.ts               # Upstash Redis or Supabase-based
│  │  └─ sync.ts                    # local ↔ cloud merge
│  ├─ store/                        # zustand: useKitchen, usePrefs, usePantry, useBook, useList, useSceneQuality
│  ├─ i18n/{en,hi}.json
│  └─ styles/tokens.css, globals.css
├─ supabase/migrations/*.sql
├─ tests/ (vitest) · e2e/ (playwright)
└─ docs/ (this kit)
```

## 2. Client state (Zustand)
```ts
type KitchenState = {
  ingredients: { id: string; name: string; qty?: string; expiring?: boolean; source: 'typed'|'voice'|'scan'|'pantry' }[];
  phase: 'idle' | 'cooking' | 'revealing' | 'results' | 'recipe';
  progress: number;           // 0..1 from SSE, drives pot animation
  results: Recipe[];          // 3 recipes
  selectedId?: string;
  add(...); remove(id); toggleExpiring(id); cook(); reset();
}
```
The scene **subscribes** to the store; the UI never calls into Three.js directly. Scene events (e.g. `onLanded`) go back through a small event emitter for sounds.

## 3. Data model (Supabase / Postgres)
```sql
profiles(id uuid pk references auth.users, display_name text, locale text default 'en',
         units text default 'metric', diet text, spice int, cookware text[], created_at timestamptz)

pantry_items(id uuid pk, user_id uuid fk, ingredient_id text, name text, category text,
             expires_on date null, created_at timestamptz)

recipes(id uuid pk, slug text unique, author_id uuid null, data jsonb not null,  -- validated Recipe JSON
        locale text, is_public bool default true, created_at timestamptz)

saved_recipes(user_id uuid, recipe_id uuid, collection text default 'All',
              rating int null, notes text null, made_photo_url text null,
              saved_at timestamptz, primary key(user_id, recipe_id))

shopping_list(id uuid pk, user_id uuid, name text, qty text, aisle text,
              checked bool default false, from_recipe uuid null)
```
Enable RLS on every table so users only read and write their own rows. `recipes` with `is_public=true` are readable by anyone (for `/r/[slug]`).

## 4. API contracts
### POST `/api/recipes/generate` (SSE)
Request:
```json
{
  "ingredients": [{"name":"spinach","qty":"1 bunch","expiring":true},{"name":"paneer"}],
  "pantry": ["salt","oil","cumin","turmeric"],
  "prefs": {"diet":"vegetarian","cuisine":"north-indian","maxMinutes":30,"spice":3,
            "difficulty":"easy","cookware":["gas","pressure-cooker"],"servings":2,"meal":"dinner"},
  "locale": "en",
  "exclude": ["Palak Paneer"]
}
```
Stream events: `progress` `{value:0..1, line:"Tempering the spices…"}` → `recipe` `{index, recipe}` ×3 → `done`.
Errors: `error` `{code, message}`.

### POST `/api/scan`
multipart `image`. Returns `{ items: [{name, confidence: 0..1}] }`.

### POST `/api/surprise`
Body `{ingredients, prefs}`. Returns `{ ideas: [{title, emoji, oneLiner}] }` ×8.

## 5. AI layer
- SDK: `@anthropic-ai/sdk`. Model is configurable with `ANTHROPIC_MODEL` (default to a current Sonnet-class model for speed and cost; use a vision-capable model for `/api/scan`).
- Use **tool use / structured output**: define a tool `return_recipes` whose `input_schema` is `reference/recipe.schema.json` (wrapped as `{recipes: Recipe[3]}`) and force `tool_choice` to it. Validate with Zod. On failure, retry once with the validation errors appended, then fall back to an error state.
- Stream: emit synthetic `progress` ticks while waiting, and emit each recipe as soon as it's parsed.
- Cache: hash(ingredients + prefs + locale) and store in Redis/KV for 24 h to save cost on repeat requests.

### System prompt (starting point, lives in `lib/ai/prompts.ts`)
```
You are "Nani", a warm, expert home chef who has cooked across Indian and world cuisines.
Create exactly 3 practical recipes from the user's ingredients:
  1. "best_match": uses ONLY the user's ingredients + pantry + assumed basics (salt, water, cooking oil).
  2. "almost_there": needs at most 2 extra common ingredients; list them as status "missing".
  3. "wildcard": creative or fusion, still realistic for a home kitchen.
Hard rules:
- Respect diet strictly. Jain = no onion, garlic, potato, carrot, beetroot, radish, or other root vegetables, no eggs/meat.
- Only use cookware the user has. If "no-cook" is selected, no heat.
- Stay within maxMinutes total time.
- Prioritise ingredients marked expiring; list them in uses_up.
- Quantities must be for the requested servings and use metric plus Indian household units where natural (katori, tsp, tbsp, cup).
- Each step: one clear action, include durations in minutes when relevant, and set "action" to one of chop|stir|fry|boil|bake|mix|rest|grind|plate|other.
- Give 1–3 realistic substitutes for any non-basic ingredient.
- Nutrition is a per-serving estimate.
- Write all text in the requested locale language.
Return ONLY via the return_recipes tool.
```

### Scan prompt
```
List every distinct food ingredient visible in this photo of a fridge/pantry/counter.
Use common Indian-English names (e.g. "capsicum", "curd", "coriander").
Give confidence 0-1. Ignore packaging brands. Max 30 items.
```

## 6. Security & limits
- `ANTHROPIC_API_KEY` is used server-side only. Validate every request body with Zod and cap ingredients at 40 and image size at 4 MB.
- Rate limit per IP (guest) and per user id. Return a friendly 429 message.
- Strip or escape all AI text before rendering (React escapes by default; never use `dangerouslySetInnerHTML`).
- CSP headers; images from Supabase Storage only.

## 7. PWA / offline
`next-pwa` or Serwist: cache the app shell, fonts, the poster, and saved recipes JSON; Cook Mode works offline once the recipe is opened.

## 8. Testing
- **Vitest:** `scaleRecipe`, `parseIngredients` (English + Hindi + Hinglish inputs), `detectTimers`, substitution lookup, schema validation of fixtures in `tests/fixtures/*.json`.
- **Playwright:** add 3 ingredients, then Cook (mock the API), then a recipe is visible; Cook Mode navigation; `?no3d=1` flow; axe accessibility check.
- A mock mode `NEXT_PUBLIC_MOCK_AI=1` returns fixture recipes so the UI can be built without an API key.
