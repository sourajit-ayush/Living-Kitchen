# 01 · Product Spec: The Living Kitchen

## 1. Vision
"Open the fridge, tell the kitchen what you have, and watch dinner appear."
A beautiful and genuinely useful recipe generator. The 3D kitchen makes it memorable, and the practical features (substitutions, cook mode, pantry) make people come back.

## 2. Target users
- **Students and young professionals** with limited ingredients and time who want to avoid food waste.
- **Home cooks in India** (primary launch market) who need veg/Jain/vegan filters, Indian cuisines, pressure-cooker recipes and Hindi support.
- **Anyone curious** who shares a pretty recipe card with friends.

## 3. Primary user flow (the "magic moment")
1. **Land.** The camera slowly dollies across the golden-hour counter. Headline: *"What's in your kitchen?"*. The input bar is focused.
2. **Add ingredients** by typing, voice or fridge scan. Each one **drops onto the counter** (physics, squash-bounce, soft "thunk" sound) and appears as a removable chip.
3. **Set filters (optional)** from the "Preferences" drawer: diet, cuisine, time, spice, difficulty, cookware, servings.
4. **Press "Cook".** The camera moves to the stove. Ingredients hop off the counter one by one and **tumble into the pot**. The pot bubbles faster and steam thickens while the AI works. Rotating fun lines appear ("Tempering the spices…", "Asking Nani…").
5. **Recipe rises from the steam.** Three recipe cards fan up out of the steam (best match, "missing 1 item", "wildcard"). Clicking one expands it into the full recipe view.
6. **Recipe view:** title, time, difficulty, servings scaler, ingredients (have / missing / substitutes), steps, nutrition plate, and "Start Cook Mode", "Save" and "Share" buttons.
7. **Cook Mode** is a full-screen, step-by-step experience with timers and voice control.

## 4. Core features

### F1. Smart ingredient input
- Text field with fuzzy autocomplete over a local ingredient dictionary (`src/data/ingredients.ts`, 400+ items with English and Hindi names, category, emoji, model key). Examples: "paneer", "atta", "curd/dahi", "capsicum/bell pepper".
- Enter or comma adds a chip. Chips are removable (the 3D object poofs away with a small dust puff).
- **Quick-add staples row:** salt, oil, onion, garlic, ginger, tomato, green chilli, turmeric, cumin, rice, atta, eggs, milk, butter.
- Duplicates are merged. Unknown items are still accepted (generic clay blob).
- Optional quantity ("3 eggs", "200g paneer") is parsed but not required.
- **Accept:** adding 10 items in quick succession keeps 60 fps. Every chip maps to exactly one 3D object.

### F2. Fridge / pantry photo scan
- A "Scan fridge" button opens the camera (mobile) or file upload (desktop).
- The image is resized client-side to 1024 px max, then sent to `/api/scan`, where Claude vision returns a list of detected ingredients with confidence.
- A review sheet shows detected items as toggleable chips (high confidence pre-checked). "Add selected" drops them all in with a staggered rain animation.
- Images are **not stored** unless the user opts in. Say this in the UI.
- **Accept:** handles blurry or dark photos gracefully ("I spotted 3 things, anything else?").

### F3. Voice input
- A mic button uses the Web Speech API (`hi-IN` and `en-IN` supported). Example: "I have eggs, spinach and cheese" adds 3 chips.
- Fallback when unsupported: hide the button and show a tooltip.
- Parsing: split on commas and "and"/"aur", then match against the dictionary.

### F4. Filters & preferences
- **Diet:** Any, Vegetarian, Eggetarian, Vegan, Jain (no onion, garlic or root veg), Non-veg.
- **Cuisine:** Any, North Indian, South Indian, Bengali, Gujarati, Indo-Chinese, Italian, Mexican, Thai, Continental, Middle Eastern.
- **Time:** ≤15, ≤30, ≤45, 60+ min.
- **Spice:** a 1–5 chilli slider.
- **Difficulty:** Easy, Medium, Chef.
- **Cookware I have** (multi-select): Gas stove, Pressure cooker, Microwave, Oven, Air fryer, Tawa, Kadai, No-cook.
- **Servings:** 1–8.
- **Meal:** Breakfast, Lunch, Snack, Dinner, Dessert (defaults from local time).
- Preferences persist (localStorage for guests, Supabase for signed-in users).

### F5. AI recipe generation
- `/api/recipes/generate` takes ingredients and preferences and returns **3 recipes** validated against `reference/recipe.schema.json`:
  1. **Best match:** uses only what the user has (plus the assumed basics: salt, water, oil).
  2. **Almost there:** needs 1–2 missing items, clearly flagged.
  3. **Wildcard:** a creative or fusion option.
- Streams progress (SSE) so the pot animation can react. Target under 8 s p50.
- A "Regenerate" button gives 3 new ideas and excludes previous titles.

### F6. "Missing 1–2 items" suggestions
- Every recipe lists ingredients as `have` / `missing` / `optional`.
- Missing items get an amber "Need" badge and a one-tap "Add to shopping list" button.
- Recipe-card banner example: *"Add curd and you can make Palak Raita."*

### F7. Substitution helper
- Every ingredient row has a swap icon that shows substitutes from (a) the AI response and (b) a local rules table (`src/data/substitutions.ts`, e.g. buttermilk → milk + lemon juice, rest 10 min).
- Picking a substitute updates the ingredient list and shows a note.
- **Accept:** works offline for the local rules table.

### F8. Serving scaler
- A stepper from 1 to 12. All quantities scale live with sensible rounding (¼ tsp steps, whole eggs, g/ml rounding).
- Unit toggle: Metric / Indian cups & katori / US.
- Pure function `scaleRecipe()` with unit tests.

### F9. Step-by-step Cook Mode
- Full-screen, one step per screen, **large type** (min 28 px), high contrast.
- Built-in **timers** auto-detected from steps ("simmer 10 min" creates a timer chip). Multiple timers can run at once and are shown in a dock. Sound and vibration on finish.
- **Screen Wake Lock API** keeps the screen on.
- **Hands-free voice:** "next", "back", "repeat", "start timer".
- Swipe or arrow keys to navigate. A progress bar is styled as a wooden spoon filling up.
- The ingredients checklist is available as a pull-up drawer.
- The 3D scene in the background blurs and dims and shows the current step's action (stirring, chopping, etc.) where a matching animation exists.

### F10. Nutrition card
- Per serving: calories, protein, carbs, fat and fibre (AI-estimated, labeled "Estimated").
- Visual: a 3D **plate** divided into macro segments that animate in (a 2D SVG donut fallback when 3D is off).
- Tags: High protein, Low carb, etc.

## 5. Retention features

### R1. My Pantry
- A saved list of staples the user always has, grouped by category (Spices, Grains, Dairy, Veg, etc.).
- "Use my pantry" toggle on the input: pantry items appear on a **3D shelf** behind the counter (not on the counter) and are included in generation.
- Quick edit from any chip: "Save to pantry".

### R2. Recipe Book (saved recipes)
- Save any recipe (heart button, with herb-confetti burst).
- **3D flip-page cookbook view:** a leather-bound book on the counter where pages turn with a page-curl shader. A grid/list view is available as the accessible default on mobile.
- Collections ("Weeknight", "Guests", custom), personal notes and star ratings ("Made it!" with a photo upload stored in Supabase Storage).

### R3. Surprise Me
- A button spins a **3D lazy-susan wheel** of dish ideas matched to current ingredients. It lands on one and generates it.

### R4. Use-It-Up mode
- Mark ingredients as "expiring soon" (clock icon on the chip). They glow softly in 3D with a warm amber rim light.
- Generation prioritises them, and the recipe card shows "Uses up: spinach, curd".
- Optional expiry dates in the pantry, with a home-screen nudge: "Your paneer expires tomorrow, here are 3 ideas."

### R5. Share card
- "Share" produces a **1080×1350 image** (and a 1080×1920 story variant): dish title in Fraunces, the ingredient list, time, a stylized render of the counter with the ingredients, and the site URL.
- Rendered server-side with `@vercel/og` or client-side from the canvas.
- Web Share API on mobile, plus "Copy link" and a WhatsApp deep link.
- Every generated recipe has a public permalink `/r/[slug]` with OG tags.

### R6. Language toggle
- English and Hindi at launch (UI strings through next-intl). Recipes are generated in the selected language.
- Architecture ready for Bengali, Tamil, Marathi and others.

### R7. Accounts & sync
- Supabase Auth: Google, email magic link and phone OTP.
- Guests have full functionality with localStorage. On sign-in, local data merges into the account.

### R8. Shopping list
- Collects missing items across recipes. Check items off, share it as text, and group by aisle.

### R9. Day/Night kitchen
- Scene lighting follows local time: morning (cool bright), golden hour (default, 4–7 pm), night (warm pendant lamp and candle). A manual toggle sits in the header.

## 6. Pages / routes
| Route | Purpose |
|---|---|
| `/` | Kitchen: input, generate, results (single-page core experience) |
| `/r/[slug]` | Public recipe page (SEO, share target) |
| `/cook/[id]` | Cook Mode |
| `/book` | Recipe Book |
| `/pantry` | My Pantry manager |
| `/list` | Shopping list |
| `/settings` | Language, units, diet defaults, 3D quality (Auto/High/Low/Off), sound on/off |
| `/auth/*` | Sign-in flows |

## 7. Non-functional
- Lighthouse on `/` (mobile): Performance ≥ 80 with 3D lazy-loaded, Accessibility ≥ 95, SEO ≥ 95.
- Works offline for the pantry, saved recipes and cook mode (PWA with service worker). Installable.
- Rate limit: 20 generations per hour per guest IP, 60 per hour per user.
- Privacy: no photos stored by default and clear data export and deletion in settings.
