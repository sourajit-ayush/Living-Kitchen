# 03 · 3D Scene Spec: The Kitchen Counter at Golden Hour

Built with React Three Fiber, drei, rapier and postprocessing. The whole scene lives in `src/components/scene/`.

## 1. Composition (what's in the frame)
```
      [ window with sheer linen curtain, sunlight shafts ]      [ pantry shelf (R1) ]
                                                             
   [ backsplash: warm cream zellige tiles ]      [ hanging copper ladle, herbs pot ]
   ───────────────────────────────────────────────────────────────────────────────
   [ wooden cutting board ]   [ COUNTER: drop zone ]   [ stove + cast-iron/steel POT ]
   [ knife, small bowls ]                                [ steam volume ]
   ───────────────────────────────────────────────────────────────────────────────
                 butcher-block walnut counter, slightly worn
```
- **Counter:** a butcher-block wood slab (PBR texture from Poly Haven), ~3 m wide. It is the physics floor.
- **Drop zone:** a central area ~1.2 × 0.6 m where new ingredients spawn above and fall. Placement uses a Poisson-disc sampler so objects don't stack awkwardly (max 24 visible; beyond that, extras go into a "basket" object that fills up).
- **Cutting board:** left side, with a knife. It hosts the "chop" animation in Cook Mode.
- **Pot:** right side, on a small 2-burner stove with a subtle flame glow (emissive + point light). It has a lid that lifts on "Cook".
- **Window:** back-left, a plane with an emissive sky gradient that drives the "god rays".
- **Props (low-poly, instanced where possible):** a salt jar, a potted basil/tulsi plant, a hanging ladle, a spice box (masala dabba) and a linen towel. Props are static and baked into one merged mesh.
- **Pantry shelf:** behind the counter on the right, holding jar models that fill when pantry items exist.

## 2. Style of models
- **Soft, slightly stylized PBR:** rounded edges, matte to satin roughness (0.45–0.8), no mirror-shiny plastic.
- Ingredients are ~8–15 cm real-world scale and slightly oversized (1.3×) for readability.
- Color-graded warm. Consistency matters more than realism: all ingredient models come from one kit or are restyled to match.

## 3. Lighting: "golden hour"
- `<Environment files="/hdri/kitchen_golden_1k.hdr" environmentIntensity={0.6} />`, a warm interior HDRI at 1k for small size.
- **Key light:** a directional "sun" from the window at a low angle (elevation ~18°), color `#FFC98A`, intensity 2.2, casting shadows (2048 map on desktop, 1024 on mobile, soft PCF). Shadows only for the counter area (use a tight shadow camera frustum).
- **Fill:** a hemisphere light (sky `#FFE9CF`, ground `#5A3E2B`, 0.35).
- **Stove glow:** a small orange point light under the pot, intensity flickering subtly with noise.
- **God rays:** fake volumetric light using 2–3 additive, soft-textured planes from the window with dust motes (a small instanced `Sparkles` set).
- **Contact shadows:** drei `<ContactShadows>` under the drop zone for grounded objects (cheap and pretty).
- **Time of day (R9):**
  - Morning: sun elevation 35°, `#FFF1DC`, cooler fill.
  - Golden (default): as above.
  - Night: sun off, window becomes dark blue with a moon; a pendant lamp above the counter (`#FFB45C`, spotlight with soft penumbra) plus a candle flicker.
  - Transitions animate over 1.2 s with GSAP tweening light params.

## 4. Post-processing (desktop "High" quality only)
- `Bloom` (luminanceThreshold 0.85, intensity 0.4) for steam highlights and flame
- `Vignette` (darkness 0.35)
- `ToneMapping` ACES Filmic + a slight warm `HueSaturation` / `BrightnessContrast`
- `DepthOfField` **only** during the recipe reveal and cook mode (focus the pot, blur the rest)
- `N8AO` ambient occlusion: High quality only
- Film grain at 0.03 for a photographic softness

## 5. Camera shots (GSAP timelines, `src/components/scene/cameraRig.ts`)
| Shot | When | Position → Target |
|---|---|---|
| `intro` | page load | a slow 6 s dolly from a wide window view to `counter` |
| `counter` | idle / adding ingredients | 3/4 view over the counter, drop zone centered-left (UI on right) |
| `stove` | on "Cook" | a push-in toward the pot, slightly above, lid in view |
| `reveal` | recipe ready | pull back a bit and tilt up to follow the cards rising from the steam |
| `board` | cook mode chopping steps | top-down over the cutting board |
| `shelf` | pantry view | pan right to the shelf |
| `book` | recipe book | down onto the book on the counter |
- Idle "breathing": a tiny camera sway (±0.5°) using simplex noise.
- Pointer parallax: max ±2° tilt following the mouse (disabled on touch and reduced motion).
- Mobile shots use a narrower FOV and are recomposed so the subject sits in the top 45%.

## 6. Signature animations
### 6.1 Ingredient drop (on add)
1. Spawn the model 1.2 m above a sampled point in the drop zone with a random yaw and a slight random tilt.
2. A rapier `RigidBody` (dynamic, convex hull or simple collider: ball, cuboid or capsule by category), restitution 0.25, friction 0.8.
3. On first contact: trigger a squash-stretch on the visual mesh (not the collider), a thunk sound and a small wood-dust puff.
4. After 1.5 s asleep, convert to fixed to save CPU.
5. Hovering over an object highlights it with a thin saffron outline (drei `<Outlines>`) and a floating label; clicking focuses its chip.

### 6.2 Remove
Scale to 0 over 220 ms with a back-in ease, a flour puff (a 12-particle instanced burst), then remove the body.

### 6.3 Cook sequence (`useCookSequence`)
1. `t=0`: the camera goes to `stove`; the pot lid lifts and hinges back; the flame light intensity rises.
2. `t=0.4s`: each ingredient, in order of distance to the pot, becomes kinematic and follows a **bezier arc** (peak +0.5 m) into the pot mouth over 600 ms, with a 60 ms stagger and a spin.
3. On entry: a splash (instanced droplets) and a bubble burst. The pot liquid surface (a shader plane with animated noise) rises slightly.
4. **Thinking loop** while awaiting the AI: bubbles intensify, steam density rises and the flame flickers. Driven by the SSE progress value 0 → 1.
5. **Reveal:** the steam column brightens (a bloom spike), 3 recipe cards (drei `<Html transform occlude>`, or R3F planes with a text texture then handed off to DOM) **rise out of the steam** with a blur-to-sharp transition and fan out. The camera goes to `reveal`.
6. Selecting a card: it flies toward the camera and cross-fades into the DOM recipe panel. The other cards sink back into the steam.
7. "Start over": the ingredients re-spawn on the counter (the lid closes and items pop back out with a playful bounce).

### 6.4 Steam
- A custom shader: a stack of 3–5 camera-facing soft sprites with scrolling curl noise, additive-ish alpha blending and a warm tint at the base fading to white. Uniform `uDensity` 0.2 (idle) → 1.0 (thinking).
- Alternative: drei `<Cloud>` segments with low opacity. Choose whichever looks softer at under 1 ms GPU.

### 6.5 Use-It-Up glow (R4)
Expiring items get a saffron fresnel rim shader and a slow pulse (1.6 s).

### 6.6 Surprise-Me wheel (R3)
A wooden lazy-susan rises from the counter holding 8 mini dish plates. It spins with angular deceleration, lands on one, and that plate floats up.

### 6.7 Recipe Book (R2)
A leather book model; pages are subdivided planes with a vertex-shader page curl. Page content is rendered to a CanvasTexture from the DOM (or `<Html>` for the active page). Arrow keys and drag turn pages.

### 6.8 Cook Mode background
The scene blurs (DoF) and dims to 40%. Step actions map to ambient animations: `chop` (knife on board), `stir` (ladle in pot), `fry` (sizzle particles), `boil` (heavy bubbles) and `rest` (steam only). The mapping comes from the recipe's `steps[].action` field.

## 7. Performance budget & quality tiers
| | High (desktop GPU) | Medium (default mobile) | Low | Off |
|---|---|---|---|---|
| DPR | min(2, device) | 1.25 | 1 | — |
| Shadows | 2048 soft | 1024 | ContactShadows only | — |
| Postprocessing | full | Bloom + Vignette | none | — |
| Max dynamic bodies | 24 | 16 | 10 | — |
| Steam sprites | 5 | 3 | 2 | — |
| God rays / dust | yes | yes (fewer) | no | — |
- Auto-select the tier with drei `<PerformanceMonitor>` and step down if fps stays below 45 for 2 s. The user can override in Settings.
- **Loading:** dynamic `import()` of `<KitchenScene/>` with `ssr:false`. Show `hero-poster.webp` (a render of the scene) plus a progress ring (drei `useProgress`) and cross-fade in.
- **Assets:** glTF with Meshopt/Draco compression and KTX2 textures (basis) where possible. Ingredients are preloaded lazily by name on autocomplete hover. Use `useGLTF.preload` for the 14 staples.
- **Instancing:** use `<Instances>` for repeated items (e.g. 5 eggs as one instanced mesh).
- Frame loop: `frameloop="demand"` when idle and nothing is moving; invalidate on interaction and during animations.
- Pause rendering when the tab is hidden or the canvas is off-screen (IntersectionObserver).
- `?no3d=1` or the Settings "3D: Off" option: render the static poster and 2D chip animations only.

## 8. Accessibility of the canvas
- The canvas is `aria-hidden="true"`. Everything shown in 3D exists in the DOM (chips, cards, labels).
- Focus in the DOM chip list highlights the matching 3D object (the outline).
- No essential information is conveyed only in 3D.
