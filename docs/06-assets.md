# 06 · Assets: models, textures, HDRI, sounds

**Always check each asset's license** and record it in `public/CREDITS.md`. Prefer CC0.

## 1. Where to get them
| Need | Source | License notes |
|---|---|---|
| Food/ingredient models | **Kenney "Food Kit"** (kenney.nl), **Quaternius** food packs, **Poly Pizza** (poly.pizza) | CC0 / CC-BY (credit) |
| Kitchen props (pot, board, knife, jars) | Poly Pizza, Sketchfab (filter: downloadable + CC0/CC-BY), Quaternius | check each |
| Wood / tile / linen PBR textures | **Poly Haven** (polyhaven.com), **ambientCG** | CC0 |
| HDRI (warm interior, golden hour) | Poly Haven, e.g. search "kitchen", "interior", "golden" | CC0 |
| Sounds | **freesound.org** (CC0 filter), **Kenney audio packs** | CC0 / CC-BY |
| Icons | Phosphor Icons | MIT |
| Fonts | Google Fonts: Fraunces, DM Sans, Caveat | OFL |

If a model's style doesn't match, **restyle it in Blender**: bevel the edges, apply matte materials from the palette and bake a simple AO. Consistency over realism.

## 2. Required ingredient models (MVP: 40)
**Veg:** tomato, onion, potato, garlic, ginger, green chilli, capsicum, carrot, spinach bunch, cauliflower, cabbage, peas (pod), coriander bunch, lemon, cucumber, mushroom, brinjal, okra (bhindi), corn
**Dairy/protein:** egg, paneer block, milk carton, butter block, curd bowl, cheese wedge, chicken piece, fish, tofu block
**Grains/pulses:** rice bag/bowl, atta bag, bread loaf, pasta, dal bowl, chickpeas bowl, poha bowl
**Pantry:** oil bottle, salt jar, masala dabba (spice box), sugar jar, noodles pack

Anything else uses the **fallback clay blob**: a rounded pebble shape tinted by category color (veg `#6FA35A`, fruit `#F2A03D`, dairy `#F4ECDD`, protein `#D98B6A`, grain `#D9B77A`, spice `#C0512E`, other `#B8A48E`) with a floating emoji label.

## 3. Kitchen scene models
counter slab, backsplash, window + curtain, 2-burner stove, pot with separate lid, cutting board, knife, ladle, basil pot, towel, pantry shelf + jars, leather recipe book, lazy-susan wheel, 8 mini plates.

## 4. Processing pipeline
```
# per model
gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 512
# or KTX2 textures:
gltf-transform uastc in.glb out.glb
```
- Target under 200 KB per ingredient and under 1.5 MB for the full kitchen set.
- Name meshes consistently: `ing_<id>` (e.g. `ing_tomato`), with the pivot at the bottom center and a real-world scale in meters.
- Generate R3F components with `npx gltfjsx model.glb --types --transform` when helpful.

## 5. Hero poster
Once Phase 2 looks good, render a 1600×1000 still of the `counter` shot with a few ingredients, export it as `public/hero-poster.webp` (<120 KB) and a mobile crop 900×1200. This is the LCP image and the no-3D fallback.

## 6. Sounds (all optional, ≤20 KB each)
`thunk-wood-{1,2,3}`, `puff`, `lid-lift`, `splash`, `bubble-loop`, `sizzle`, `page-turn`, `timer-ding`, `whoosh-soft`, `confetti-pop`.
