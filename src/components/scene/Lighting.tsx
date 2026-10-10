"use client";

import { Lightformer, Sparkles } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BakedEnvironment } from "./BakedEnvironment";
import { ContactShadowLayer } from "./ContactShadowLayer";
import { WINDOW_POSITION } from "./KitchenSet";
import { DROP_ZONE } from "./placement";
import type { TierConfig } from "./quality";
import { consumeShadowsDirty, markShadowsDirty, shadowFrame } from "./shadowGate";
import { rayTexture } from "./textures";
import { LOOKS, mixLooks, type LightingLook } from "@/lib/daypart";
import { useDaypart } from "@/store/useDaypart";
import { look } from "./lookSignal";
const TRANSITION_S = 1.2;

/**
 * Day/Night director (docs/03 §3 "Time of day"): eases every light parameter to the new part of
 * day over 1.2 s (at once with reduced motion). Lights are never added or removed, only dimmed,
 * so switching never changes a shader (no recompiles, no stall).
 */
function DaypartDirector({
  sun,
  hemi,
  reducedMotion,
}: {
  sun: React.RefObject<THREE.DirectionalLight | null>;
  hemi: React.RefObject<THREE.HemisphereLight | null>;
  reducedMotion: boolean;
}) {
  const scene = useThree((s) => s.scene);
  const part = useDaypart((s) => s.part);
  const tween = useRef<{ from: LightingLook; to: LightingLook; t: number } | null>(null);
  const applied = useRef(false);

  useEffect(() => {
    tween.current = { from: { ...look.current }, to: LOOKS[part], t: reducedMotion ? 1 : 0 };
  }, [part, reducedMotion]);

  useFrame((_, delta) => {
    const tw = tween.current;
    if (!tw && applied.current) return;
    if (tw) {
      tw.t = Math.min(1, tw.t + delta / TRANSITION_S);
      const u = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2; // power3.inOut
      look.current = mixLooks(tw.from, tw.to, u);
      if (tw.t >= 1) tween.current = null;
    }
    const l = look.current;
    const sl = sun.current;
    if (sl) {
      sl.color.set(l.sunColor);
      sl.intensity = l.sunIntensity;
      sl.position.set(...l.sunPosition);
    }
    const h = hemi.current;
    if (h) {
      h.color.set(l.skyColor);
      h.groundColor.set(l.groundColor);
      h.intensity = l.hemiIntensity;
    }
    scene.environmentIntensity = l.envIntensity;
    if (scene.background instanceof THREE.Color) scene.background.set(l.background);
    if (scene.fog) scene.fog.color.set(l.background);
    applied.current = true;
    markShadowsDirty(); // the sun may move (morning is higher)
  });
  return null;
}

/** Cube size of the procedural environment (KitchenScene pre-compiles its PMREM shaders for it). */
export const ENV_RESOLUTION = 64;

/**
 * Golden-hour lighting (docs/03 §3): low warm sun through the window, warm hemisphere fill,
 * a procedural environment (Lightformers, so no HDRI download yet), contact shadows under the
 * drop zone, fake god rays and dust motes.
 */
export function Lighting({
  tier,
  reducedMotion = false,
}: {
  tier: TierConfig;
  reducedMotion?: boolean;
}) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const dust = useRef<THREE.Points>(null);
  useFrame(() => {
    if (dust.current) dust.current.visible = look.current.rays > 0.05;
  });
  const shadows = tier.shadowMapSize > 0;
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0.1, 0, 0);
    return o;
  }, []);

  return (
    <>
      <primitive object={target} />
      {/* ~17° elevation from back-left, through the window */}
      <directionalLight
        ref={sun}
        position={[-2.6, 1.05, -1.6]}
        target={target}
        color="#FFC98A"
        intensity={2.2}
        castShadow={shadows}
        shadow-mapSize={[tier.shadowMapSize || 512, tier.shadowMapSize || 512]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-1.8}
        shadow-camera-right={1.8}
        shadow-camera-top={1.1}
        shadow-camera-bottom={-0.6}
        shadow-camera-near={0.5}
        shadow-camera-far={6}
      />
      <hemisphereLight ref={hemi} args={["#FFE9CF", "#8B6A4F", 0.75]} />
      <DaypartDirector sun={sun} hemi={hemi} reducedMotion={reducedMotion} />
      <BakedEnvironment resolution={ENV_RESOLUTION} intensity={0.9}>
        {/* warm window-side panel, soft top bounce, faint cool rim from the room */}
        <Lightformer
          form="rect"
          intensity={3}
          color="#ffd29a"
          position={[-3, 1.5, -1]}
          scale={[3, 2, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={0.8}
          color="#fff1dc"
          position={[0, 4, 1]}
          scale={[6, 3, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="ring"
          intensity={0.4}
          color="#dfe6f2"
          position={[3, 1, 3]}
          scale={2}
          target={[0, 0, 0]}
        />
      </BakedEnvironment>
      <GatedShadows shadows={shadows} mapSize={tier.shadowMapSize} />
      {tier.godRays && <GodRays />}
      {tier.dust > 0 && (
        <Sparkles
          ref={dust}
          count={tier.dust}
          position={[WINDOW_POSITION[0] + 0.45, 0.65, -0.15]}
          scale={[1.1, 0.8, 0.6]}
          size={1.6}
          speed={0.15}
          opacity={0.55}
          color="#FFE2B0"
        />
      )}
    </>
  );
}

/**
 * Contact shadows plus the sun's shadow map, re-rendered only while a caster moves (see
 * shadowGate.ts), then once more when everything has settled.
 */
function GatedShadows({ shadows, mapSize }: { shadows: boolean; mapSize: number }) {
  const gl = useThree((s) => s.gl);
  const frame = useRef(0);

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    markShadowsDirty(30); // the first frames, and again whenever the tier changes the map
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl, mapSize]);

  // Runs before ContactShadowLayer reads the schedule. Sun and contact shadows alternate while
  // dirty; every mark lasts at least 2 frames, so both settle after the last movement.
  useFrame(() => {
    const dirty = consumeShadowsDirty();
    const even = (frame.current++ & 1) === 0;
    gl.shadowMap.needsUpdate = dirty && even;
    shadowFrame.contact = dirty && !even;
  }, -1);

  return (
    <ContactShadowLayer
      position={[DROP_ZONE.centerX, 0.001, DROP_ZONE.centerZ]}
      scale={[1.9, 1]}
      far={0.35}
      blur={2.4}
      opacity={shadows ? 0.35 : 0.55}
      resolution={shadows ? 512 : 256}
      color="#3a2416"
    />
  );
}

/** 3 additive soft planes slanting from the window down onto the counter. */
function GodRays() {
  const tex = useMemo(() => rayTexture(), []);
  const mats = useRef<THREE.MeshBasicMaterial[]>([]);
  useFrame(({ clock }) => {
    mats.current.forEach((m, i) => {
      // Sunbeams fade with the light: softer in the morning, gone at night.
      if (m)
        m.opacity = (0.11 + Math.sin(clock.elapsedTime * 0.4 + i * 1.7) * 0.03) * look.current.rays;
    });
  });
  const [wx, wy, wz] = WINDOW_POSITION;
  return (
    <group position={[wx + 0.15, wy - 0.05, wz + 0.05]} rotation={[0.95, 0.75, 0]}>
      {[-0.18, 0.02, 0.2].map((x, i) => (
        <mesh key={x} position={[x, -0.75, 0]} rotation={[0, 0, 0.05 * i]}>
          <planeGeometry args={[0.22 + i * 0.04, 1.6]} />
          <meshBasicMaterial
            ref={(m) => {
              if (m) mats.current[i] = m;
            }}
            map={tex}
            transparent
            opacity={0.12}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
