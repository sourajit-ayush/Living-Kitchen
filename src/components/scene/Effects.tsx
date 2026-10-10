"use client";

import {
  Bloom,
  BrightnessContrast,
  DepthOfField,
  EffectComposer,
  HueSaturation,
  Noise,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import gsap from "gsap";
import {
  BlendFunction,
  type BloomEffect,
  type DepthOfFieldEffect,
  type EffectComposer as EffectComposerImpl,
  ToneMappingMode,
} from "postprocessing";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useKitchen } from "@/store/useKitchen";
import { warmComposer } from "./composerWarmup";
import { cook, POT_MOUTH } from "./cookSignals";
import type { QualityTier } from "./quality";
import { extraWarmups } from "./sceneWarmup";

const BLOOM = 0.4;
const BOKEH = 1.8;

/**
 * Post-processing per tier (docs/03 §4, §7). High: bloom, depth of field during the recipe
 * reveal, warm grade, vignette, a touch of grain. Medium: bloom + vignette. Low: none (this
 * component isn't mounted). The composer renders the scene off-screen, so ACES tone mapping
 * moves in here as an effect.
 *
 * DoF stays in the pass at all times and is "switched" by animating its bokeh scale (0 = sharp):
 * adding or removing an effect would rebuild the merged shader mid-animation.
 */
export function Effects({
  tier,
  reducedMotion,
}: {
  tier: Exclude<QualityTier, "off" | "low">;
  reducedMotion: boolean;
}) {
  const bloom = useRef<BloomEffect>(null);
  const dof = useRef<DepthOfFieldEffect>(null);
  // Focus on the fanned-out recipe cards above the pot.
  const focus = useMemo(() => new THREE.Vector3(POT_MOUTH.x, POT_MOUTH.y + 0.4, POT_MOUTH.z), []);
  const high = tier === "high";
  const composer = useRef<EffectComposerImpl>(null);

  // Pre-compile the composer's shaders with the rest of the scene (see composerWarmup.ts).
  useLayoutEffect(() => {
    const warm = async (gl: THREE.WebGLRenderer) => {
      if (composer.current) await warmComposer(gl, composer.current);
    };
    extraWarmups.add(warm);
    return () => void extraWarmups.delete(warm);
  }, []);

  useEffect(() => {
    const set = (phase: string, prev: string) => {
      const b = bloom.current;
      const d = dof.current;
      const revealing = phase === "revealing" || phase === "results";
      // Focus on the cards above whichever vessel is in use (the pot, or the glass for drinks).
      focus.set(cook.target.x, cook.target.y + 0.4, cook.target.z);
      if (b && phase === "revealing" && prev !== "revealing" && !reducedMotion) {
        // the steam column brightens as the cards rise
        gsap
          .timeline()
          .to(b, { intensity: BLOOM * 2.6, duration: 0.35, ease: "power2.out" })
          .to(b, { intensity: BLOOM, duration: 1.1, ease: "power2.inOut" });
      }
      if (d) {
        const on = revealing && !reducedMotion;
        gsap.to(d, {
          bokehScale: on ? BOKEH : 0,
          duration: on ? 0.9 : 0.5,
          ease: "power2.inOut",
          overwrite: true,
        });
      }
    };
    set(useKitchen.getState().phase, "");
    return useKitchen.subscribe((s, p) => {
      if (s.phase !== p.phase) set(s.phase, p.phase);
    });
  }, [reducedMotion, focus]);

  return (
    <EffectComposer ref={composer} multisampling={high ? 4 : 2} enableNormalPass={false}>
      <Bloom ref={bloom} mipmapBlur levels={5} luminanceThreshold={0.85} intensity={BLOOM} />
      {high ? <DepthOfField ref={dof} target={focus} focusRange={0.9} bokehScale={0} /> : <></>}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {high ? <HueSaturation saturation={0.06} /> : <></>}
      {high ? <BrightnessContrast contrast={0.04} /> : <></>}
      <Vignette darkness={0.35} offset={0.3} />
      {high ? <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.03} /> : <></>}
    </EffectComposer>
  );
}
