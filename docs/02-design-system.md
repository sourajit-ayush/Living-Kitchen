# 02 · Design System: "Golden Hour Editorial"

The look is a premium printed cookbook photographed on a sunlit wooden counter: warm, soft, tactile and calm. 3D provides the atmosphere, and the typography and cards carry the information.

## 1. Mood keywords
Warm · sunlit · wooden · ceramic · steam · linen · handwritten notes · editorial · generous whitespace · playful micro-moments.

**Avoid:** neon, cold blues, pure black backgrounds, heavy drop shadows, glossy plastic materials, busy gradients, emoji overload in the UI.

## 2. Color tokens (see `reference/tokens.css`)
| Token | Hex | Use |
|---|---|---|
| `--cream-50` | #FFFBF5 | Page background (light) |
| `--cream-100` | #FFF4E6 | Cards, sheets |
| `--cream-200` | #F7E6CF | Borders, dividers, subtle fills |
| `--walnut-900` | #2B1D14 | Primary text, dark background |
| `--walnut-700` | #5A3E2B | Secondary text |
| `--walnut-500` | #8B6A4F | Muted text, icons |
| `--tomato-500` | #E2553A | **Primary action** ("Cook"), hearts |
| `--tomato-600` | #C8432A | Primary hover/pressed |
| `--saffron-400` | #F4B23E | Highlights, golden light, "Use it up" glow, stars |
| `--basil-600` | #4E7A3A | "Have it" state, success, veg mark |
| `--turmeric-100` | #FDF1D2 | Info backgrounds |
| `--chilli-700` | #9E2A1F | Errors, non-veg mark |
| `--steam-glass` | rgba(255,248,238,0.62) | Glass cards over 3D |

**Night mode** (kitchen at night): background `#1C140E`, cards `rgba(43,29,20,0.72)`, text `#F7E6CF`, primary stays tomato, and highlights shift to candle `#FFB45C`.

Contrast: all text pairs must pass WCAG AA. Tomato on cream is for buttons with white text only, never for body text.

## 3. Typography
- **Display:** *Fraunces* (variable, opsz + SOFT axis). Use `SOFT 100` and `WONK 1` on hero headlines for a warm, handmade feel. Used for recipe titles, headlines and the book.
- **UI/Body:** *DM Sans* (variable). Used for everything functional.
- **Handwritten accent:** *Caveat*, used only for small "notes" (e.g. "Nani's tip") and never for key information.
- **Numbers:** DM Sans with `font-variant-numeric: tabular-nums` for quantities and timers.

| Style | Font | Size (mobile / desktop) | Weight |
|---|---|---|---|
| Hero | Fraunces | 44 / 88 px, line-height 0.95 | 600, SOFT 100 |
| H1 recipe title | Fraunces | 32 / 56 | 600 |
| H2 | Fraunces | 24 / 32 | 500 |
| H3 | DM Sans | 18 / 20 | 600 |
| Body | DM Sans | 16 / 17 | 400, line-height 1.6 |
| Small / meta | DM Sans | 13 / 14 | 500, letter-spacing 0.02em |
| Cook Mode step | DM Sans | 28 / 40 | 500 |

## 4. Layout
- **Desktop:** the 3D canvas is full-bleed and fixed behind everything. UI floats on top: the header at top, the **ingredient dock** at bottom-center, and the **results/recipe panel** sliding in from the right (min(560px, 44vw)) while the camera reframes the scene to the left.
- **Mobile:** the canvas takes the top ~45% of the viewport. The UI is a **bottom sheet** with 3 snap points (peek, half, full). The recipe view is a full sheet.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Radii: 10 (chips), 16 (buttons, inputs), 24 (cards), 32 (sheets).
- Max text measure: 68ch.

## 5. Components
- **Ingredient chip:** cream-100 with a walnut-900 label, emoji on the left, × on the right. States: `have` (basil dot), `missing` (saffron dashed border), `expiring` (saffron glow + clock), `pantry` (shelf icon).
- **Primary button "Cook":** a large pill in tomato-500 with white Fraunces text and a small pot icon. Idle: a subtle steam wisp animates over the icon. Pressed: scales to 0.96. Loading: a bubbling dots animation.
- **Glass card:** `--steam-glass` background, `backdrop-filter: blur(18px) saturate(1.2)`, 1px cream-200 border at 60% opacity, and a soft shadow `0 20px 60px -20px rgba(90,62,43,0.35)`.
- **Recipe card (results):** glass card with the title (Fraunces), a meta row (time, difficulty, servings), a badge ("Uses only your ingredients" / "Need 1 item" / "Wildcard"), the "Uses up" line and a heart button.
- **Ingredient list row:** a checkbox styled as a hand-drawn circle, then quantity (tabular), then name, then the swap icon for substitutes.
- **Step card:** a big step number in Fraunces italic in saffron, the text, and inline timer chips.
- **Timer chip:** pill, tap to start, with a circular progress ring. It pulses on finish.
- **Bottom sheet, drawer, dialog:** Radix primitives (or shadcn/ui) restyled with tokens.
- **Toasts:** small cream cards bottom-center with a walnut icon.
- **Icons:** Phosphor Icons (duotone weight) tinted walnut-700.
- **Empty states:** a small illustrated line drawing with a friendly line, e.g. "Your counter is empty. Add something tasty."

## 6. Motion principles
- **Physical and soft.** Things land, settle and breathe. Use springs over linear easing.
- Default UI spring (Framer Motion): `{ type: "spring", stiffness: 260, damping: 26 }`.
- Durations: micro 120–180 ms, UI 240–320 ms, scene transitions 900–1400 ms (GSAP `power3.inOut`).
- **Signature moments:**
  1. Ingredient drop: fall, squash (scaleY 0.8, scaleX 1.15) for 80 ms, rebound, settle. Wood "thunk" sound with pitch varied by size.
  2. Chip removal: the 3D object shrinks with a flour-dust puff particle burst.
  3. Cook: a staggered hop into the pot (60 ms stagger, arcing path), a splash and bubble particles, and the steam thickening.
  4. Recipe reveal: cards rise from the steam with a blur-to-sharp transition (filter blur 12px → 0) and a slight rotation that fans out.
  5. Save: herb confetti (small basil and coriander leaves plus saffron sprinkles).
- **Reduced motion:** disable camera moves and physics. Items appear in place with a fade and the recipe fades in. Keep the heart color change only.

## 7. Sound (optional, off by default, toggle in the header)
A soft wooden thunk, pot bubble loop, sizzle on Cook, page turn in the book and a kitchen-timer "ding". Keep everything subtle, under 20 KB each, as Opus/WebM with an MP3 fallback. Use the Howler.js library.

## 8. Copywriting voice
Warm, short and a little witty, like a friendly aunt who is also a great chef. Occasional Hinglish flavour in English mode ("Tadka time!").
- Loading lines: "Tempering the spices…", "Asking Nani for advice…", "Letting the flavours get friendly…", "Stirring clockwise, for luck…"
- Error: "Oops, the pot boiled over. Let's try that again."
