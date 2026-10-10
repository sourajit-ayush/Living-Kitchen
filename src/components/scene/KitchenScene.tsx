"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  lazy,
  type ReactNode,
  startTransition,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { useKitchen } from "@/store/useKitchen";
import { useQualitySetting, useScene } from "@/store/useScene";
import { useSurprise } from "@/store/useSurprise";
import { usePantry } from "@/store/usePantry";
import { useLocale } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { CameraRig } from "./CameraRig";
import { DrinkGlass } from "./DrinkGlass";
import { isMoving } from "./shadowGate";
import { SHOT_SECONDS, shotFor, type Layout } from "./cameraShots";
import { DustPuffs } from "./DustPuffs";
import { Effects } from "./Effects";
import { PotFx } from "./PotFx";
import { WoodenSpoon } from "./WoodenSpoon";
import { RecipeCards3D } from "./RecipeCards3D";
import { CookDirector } from "./useCookSequence";
import { LabelLayer } from "./LabelLayer";
import { Counter, CuttingBoard, POT_POSITION, Pot, Props, Room, Stove } from "./KitchenSet";
import { ENV_RESOLUTION, Lighting } from "./Lighting";
import { warmScene } from "./sceneWarmup";
import { rememberTier, TIERS, type QualityTier } from "./quality";
import type { SceneMode } from "./SceneRoot";
import { markShadowsDirty } from "./shadowGate";
import { Steam } from "./Steam";
import { SurpriseWheel } from "./SurpriseWheel";
import { PantryShelf } from "./PantryShelf";
import { NightLights } from "./NightLights";
import { RecipeBook3D } from "./RecipeBook3D";

// rapier (~835 kB gzipped WASM) only loads once the user starts adding ingredients.
const PhysicsLayer = lazy(() => import("./PhysicsLayer"));

/**
 * Resets the renderer's draw-call counters at the start of each frame, so `info.render.calls`
 * covers the whole frame (scene, shadows and every post-processing pass), not only the last pass.
 */
function FrameStats() {
  const gl = useThree((s) => s.gl);
  useFrame(() => {
    gl.info.reset();
    // Frames actually rendered (three's own counter counts every pass); read by perf checks.
    const w = window as unknown as { __lkFrames?: number };
    w.__lkFrames = (w.__lkFrames ?? 0) + 1;
  }, -1000); // runs first; negative priority doesn't take over render
  return null;
}

/**
 * Cook Mode keeps the screen on for a long time behind blurred text, so the scene renders at a
 * steady 30 fps on demand instead of every display frame (about half the GPU and battery).
 */
const BACKDROP_DPR = 0.6;

/** "auto" stepped down: start the next visit at this tier on this GPU (quality.rememberTier). */
function learnTier() {
  const tier = useScene.getState().tier;
  if (tier && useQualitySetting.getState().setting === "auto") rememberTier(tier);
}

/**
 * Ingredient models use a palette texture on a standard material: a shader variant the clay blobs
 * don't need. This never-drawn mesh lets the start-up warm-up compile it, so the first model to
 * land doesn't stall a frame on a slow GPU.
 */
const MODEL_WARM_TEXTURE = (() => {
  const t = new THREE.DataTexture(new Uint8Array([200, 160, 120, 255]), 1, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
})();
function ModelMaterialWarmup() {
  return (
    <mesh visible={false} castShadow receiveShadow>
      <boxGeometry args={[0.01, 0.01, 0.01]} />
      <meshStandardMaterial map={MODEL_WARM_TEXTURE} roughness={0.62} metalness={0} />
    </mesh>
  );
}

function Throttle({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const id = setInterval(() => invalidate(), 1000 / fps);
    return () => clearInterval(id);
  }, [invalidate, fps]);
  // While anything moves (ingredients falling or bouncing, the camera gliding), draw every frame.
  useFrame(() => {
    if (isMoving()) invalidate();
  });
  return null;
}

/**
 * True once `key` has stayed the same for `ms`. After a page switch the camera glides to its new
 * shot: the background pages draw every frame until it lands, then drop to their low frame rate
 * (capping at once made the move from the book or pantry to the list play at ~13 fps).
 */
function useSettled(key: string, ms: number) {
  const [settledKey, setSettledKey] = useState(key);
  useEffect(() => {
    const id = setTimeout(() => setSettledKey(key), ms);
    return () => clearTimeout(id);
  }, [key, ms]);
  return settledKey === key;
}

/** Flags the canvas as ready after a couple of real frames, so the poster cross-fades cleanly. */
function ReadySignal() {
  const frames = useRef(0);
  useFrame(() => {
    if (++frames.current === 3) useScene.getState().setReady(true);
  });
  return null;
}

/**
 * Before the first frame: upload textures and compile every shader off the main thread (see
 * sceneWarmup.ts), so frame one can't freeze the page (on Windows/ANGLE that was several seconds).
 */
function Warmup({ onDone, offscreen }: { onDone: () => void; offscreen: boolean }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let cancelled = false;
    let release: (() => void) | undefined;
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    void warmScene(gl, scene, camera, () => cancelled, ENV_RESOLUTION, offscreen).then((r) => {
      release = r;
      if (cancelled || !release) return release?.();
      markShadowsDirty(30); // bake shadows now that the whole set is mounted
      onDone();
      // The environment is converted on the first frames; after that the warm copies can go.
      releaseTimer = setTimeout(() => release?.(), 5000);
    });
    return () => {
      cancelled = true;
      clearTimeout(releaseTimer);
      release?.();
    };
  }, [gl, scene, camera, onDone, offscreen]);
  return null;
}

/**
 * Mounts its children in a transition. R3F renders into a concurrent root, so React builds the
 * kitchen in ~5 ms slices (yielding to input) instead of one long main-thread task.
 */
function Staged({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => startTransition(() => setShow(true)), []);
  return show ? children : null;
}

/**
 * The whole 3D kitchen. Lazy-loaded (next/dynamic, ssr:false) by SceneRoot; nothing here may be
 * imported from server components. The canvas is aria-hidden: every object also exists in the DOM.
 */
export default function KitchenScene({
  tier,
  layout,
  reducedMotion,
  active,
  mode = "kitchen",
}: {
  tier: Exclude<QualityTier, "off">;
  layout: Layout;
  reducedMotion: boolean;
  active: boolean;
  /** Which page the scene is behind (SceneRoot.sceneModeFor) */
  mode?: SceneMode;
}) {
  // Cook Mode acts out the step; the quiet backdrop (list, sign-in) is blurred and still.
  const cookMode = mode === "cook";
  const background = cookMode || mode === "quiet";
  const settled = useSettled(mode, SHOT_SECONDS * 1000 + 300);
  const throttled = background && settled;
  const config = TIERS[tier];
  const phase = useKitchen((s) => s.phase);
  const hasIngredients = useKitchen((s) => s.ingredients.length > 0);
  const physicsWanted = useScene((s) => s.physicsWanted);
  const cookAction = useScene((s) => s.cookAction);
  const surprise = useSurprise((s) => s.status === "spinning" || s.status === "landed");
  // Drinks are made in the glass: while one is mixing or showing, and in Cook Mode for the steps
  // the glass acts out (a drink's brewing steps still happen at the pot).
  const drinkInKitchen = useKitchen((s) => s.phase !== "idle" && s.requestCategory === "drink");
  const drinkInCookMode = useScene(
    (s) =>
      s.cookCategory === "drink" &&
      s.cookAction !== null &&
      !["boil", "stir", "fry"].includes(s.cookAction),
  );
  const vessel = (cookMode ? drinkInCookMode : drinkInKitchen) ? "glass" : "pot";
  const shot = shotFor(
    phase,
    layout,
    reducedMotion,
    cookMode ? (cookAction ?? "other") : null,
    surprise,
    mode === "pantry" || mode === "book" ? mode : null,
    vessel,
  );
  const usePantryShelf = usePantry((s) => s.useInCooking);
  const locale = useLocale() as Locale;
  const [warm, setWarm] = useState(false);
  const [onWarm] = useState(() => () => setWarm(true));

  return (
    <Canvas
      // three r18x removed PCFSoftShadowMap; plain PCF + a soft shadow radius instead.
      shadows={config.shadowMapSize > 0 ? "percentage" : false}
      // Behind the list, sign-in and Cook Mode the kitchen is blurred, so it renders at a lower
      // resolution: the blur hides it, and integrated GPUs keep falling ingredients smooth.
      dpr={background ? BACKDROP_DPR : config.dpr}
      // Nothing renders until the shaders are compiled (Warmup), so frame one can't stall.
      frameloop={active && warm ? (throttled ? "demand" : "always") : "never"}
      gl={{ antialias: tier !== "low", powerPreference: "high-performance" }}
      camera={{ fov: 38, near: 0.05, far: 30, position: [0.3, 1, 1.85] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.2;
        // Reading shader info logs forces a synchronous wait for each compile (hundreds of ms on
        // Windows/ANGLE). Keep the error check in dev only.
        gl.debug.checkShaderErrors = process.env.NODE_ENV !== "production";
        // A first getExtension() is a synchronous round trip to the GPU process. Made later (three
        // asks lazily, mid-render) it waits behind queued GPU work: 140 ms in one measured case.
        // Asked now, on the idle new context, it's ~1 ms, and three caches the answers.
        for (const ext of ["EXT_texture_filter_anisotropic", "KHR_parallel_shader_compile"]) {
          gl.extensions.has(ext);
        }
        // Read-only renderer stats (draw calls, triangles) for the perf-budget e2e test and
        // quick checks in devtools. Holds no user data. Post-processing renders several passes
        // per frame, so the counters are reset once per frame (FrameStats), not per render.
        gl.info.autoReset = false;
        (window as unknown as { __lkGl?: unknown }).__lkGl = gl;
      }}
      aria-hidden="true"
      tabIndex={-1}
    >
      <color attach="background" args={["#f1dfc6"]} />
      <fog attach="fog" args={["#f1dfc6", 4, 9]} />
      <FrameStats />
      {throttled && <Throttle fps={mode === "quiet" ? 10 : 30} />}
      {/* Paused behind Cook Mode and the quiet pages: their deliberate low fps reads as a slow GPU. */}
      {!background && (
        <PerformanceMonitor
          // docs/03 §7: step down when fps stays below 45 for ~2 s; never auto step up. (A bound
          // relative to the best fps seen never fired on a GPU that is slow from frame one.)
          bounds={() => [45, Infinity]}
          ms={250}
          iterations={8}
          flipflops={3}
          onDecline={() => {
            useScene.getState().declineTier();
            learnTier();
          }}
          onFallback={() => {
            useScene.getState().setTier("low");
            learnTier();
          }}
        />
      )}
      <Suspense fallback={null}>
        <Staged>
          <Lighting tier={config} reducedMotion={reducedMotion} />
          <NightLights />
          <Room />
          <Counter />
          <Stove />
          <Pot />
          <DrinkGlass />
          <ModelMaterialWarmup />
          <CuttingBoard bookOpen={mode === "book"} />
          <Props />
          <Steam
            count={config.steamSprites}
            origin={[POT_POSITION[0], POT_POSITION[1] + 0.12, POT_POSITION[2]]}
          />
          <DustPuffs />
          <PotFx />
          <WoodenSpoon />
          <SurpriseWheel reducedMotion={reducedMotion} />
          {/* Mounted (hidden) everywhere, so their shaders compile in the start-up warm-up. */}
          <PantryShelf visible={mode === "pantry" || (mode === "kitchen" && usePantryShelf)} />
          <RecipeBook3D visible={mode === "book"} reducedMotion={reducedMotion} locale={locale} />
          {/* Reduced motion skips the 3D reveal: the recipes simply fade in on the page. */}
          {!reducedMotion && <RecipeCards3D />}
          <CookDirector reducedMotion={reducedMotion} />
          {tier !== "low" && <Effects tier={tier} reducedMotion={reducedMotion} />}
          <LabelLayer />
          <CameraRig shot={shot} layout={layout} reducedMotion={reducedMotion} />
          <Warmup onDone={onWarm} offscreen={tier !== "low"} />
          <ReadySignal />
        </Staged>
      </Suspense>
      {(hasIngredients || physicsWanted) && (
        <Suspense fallback={null}>
          <PhysicsLayer maxBodies={config.maxBodies} reducedMotion={reducedMotion} />
        </Suspense>
      )}
    </Canvas>
  );
}
