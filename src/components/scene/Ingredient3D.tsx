"use client";

import { useFrame } from "@react-three/fiber";
import { RigidBody, useRapier, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { playSound } from "@/lib/sound";
import type { KitchenIngredient } from "@/store/useKitchen";
import { useScene } from "@/store/useScene";
import { ClayShape, claySpec, ModelShape } from "./ClayShape";
import type { LoadedModel } from "./ingredientModels";
import {
  arcPoint,
  bodies,
  cook,
  HOP_PEAK,
  HOP_SECONDS,
  HOP_STAGGER,
  lastSeen,
  launchVelocity,
} from "./cookSignals";
import { emitPuff } from "./DustPuffs";
import { registerLabel, unregisterLabel } from "./LabelLayer";
import { hashString, mulberry32, type Slot } from "./placement";
import { emitSplash } from "./PotFx";
import { markMoving, markShadowsDirty } from "./shadowGate";

const DROP_HEIGHT = 1.2;
const SLEEP_TO_FIXED_MS = 1500;
/** Bodies that never fall asleep (a capsule rocking on a neighbour) are fixed this long after landing. */
const SETTLE_TO_FIXED_S = 4;
const STILL_SPEED = 0.02; // m/s (or rad/s): below this a body counts as at rest
/** Hard limit: a body still jittering this long after it was dropped is fixed regardless. */
const MAX_DYNAMIC_S = 8;
const REMOVE_S = 0.22;
const FADE_S = 0.3;
const NOT_LANDED = -1;
const LANDING = -2;
/** Flight time when popping back out of the pot onto the counter ("Start over"). */
const POP_SECONDS = 0.75;
/** Spawn point for the pop-out: above the pot's collider so physics doesn't shove it out. */
/** Where items pop back out from on "Start over": above the pot or the glass (cook.target). */
const POP_FROM = new THREE.Vector3();

type CookState = "counter" | "hopping" | "inPot" | "popping";

/** Focus the matching DOM chip (3D → DOM sync). */
function focusChip(key: string) {
  document
    .querySelector<HTMLButtonElement>(`[data-ingredient="${CSS.escape(key)}"] button`)
    ?.focus();
}

const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

export function Ingredient3D({
  ingredient,
  slot,
  leaving,
  from,
  dropDelay = 0,
  reducedMotion,
  onGone,
  model: modelProp = null,
}: {
  /** A real model for this ingredient (else the clay blob). Fixed at mount: the collider uses it. */
  model?: LoadedModel | null;
  ingredient: KitchenIngredient;
  slot: Slot;
  leaving: boolean;
  /** Where a leaving copy appears: the item's last position (else it drops in from above). */
  from?: { x: number; y: number; z: number };
  /** Seconds to wait (hidden, out of the simulation) before dropping: the ingredient rain */
  dropDelay?: number;
  reducedMotion: boolean;
  onGone: () => void;
}) {
  const { rapier } = useRapier();
  const body = useRef<RapierRigidBody>(null);
  const visual = useRef<THREE.Group>(null);
  const highlighted = useScene((s) => s.highlighted === ingredient.key);

  const seed = useMemo(() => hashString(ingredient.key), [ingredient.key]);
  const [model] = useState(modelProp);
  const spec = useMemo(() => {
    const clay = claySpec(ingredient.category, seed);
    return model ? { ...clay, halfHeight: model.halfHeight } : clay;
  }, [ingredient.category, seed, model]);
  const { spawn, rotation } = useMemo(() => {
    const r = mulberry32(seed ^ 0x9e3779b9);
    const y = reducedMotion ? spec.halfHeight + 0.002 : DROP_HEIGHT + r() * 0.15;
    return {
      spawn: (from ? [from.x, from.y, from.z] : [slot[0], y, slot[1]]) as [number, number, number],
      rotation: [(r() - 0.5) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.5] as [
        number,
        number,
        number,
      ],
    };
    // Spawn pose is fixed at mount; later slot changes don't teleport the body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const anim = useRef({
    landedAt: NOT_LANDED,
    leavingAt: -1,
    bornAt: -1,
    poppedAt: -1,
    gone: false,
    // Read once at mount: a later re-render with no delay must not re-trigger the wait.
    waitUntil: reducedMotion || from ? 0 : dropDelay,
    waiting: !reducedMotion && !from && dropDelay > 0,
  });
  const hop = useRef({
    state: "counter" as CookState,
    start: 0,
    from: new THREE.Vector3(),
    // Items added after a cook stay put until the *next* "Start over".
    generation: cook.popGeneration,
  });
  const tmp = useRef({ p: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler() });
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const label = useRef<ReturnType<typeof registerLabel>["label"] | null>(null);

  useEffect(() => {
    markShadowsDirty();
    const h = hop.current;
    return () => {
      if (sleepTimer.current) clearTimeout(sleepTimer.current);
      if (h.state === "inPot" || h.state === "popping")
        useScene.setState((s) => ({ inPot: Math.max(0, s.inPot - 1) }));
      markShadowsDirty(); // one last shadow pass without this item
    };
  }, []);

  // The cook director ranks live bodies by distance to the pot.
  useEffect(() => {
    if (leaving) return;
    const key = ingredient.key;
    bodies.set(key, () => body.current?.translation() ?? { x: slot[0], y: 0, z: slot[1] });
    return () => void bodies.delete(key);
  }, [ingredient.key, leaving, slot]);

  // One shared instanced label layer draws every emoji label in a single call.
  useEffect(() => {
    const { id, label: l } = registerLabel(ingredient.emoji);
    label.current = l;
    return () => {
      unregisterLabel(id);
      label.current = null;
    };
  }, [ingredient.emoji]);

  /** Into the pot: kinematic, along a bezier arc with a spin (docs/03 §6.3 step 2). */
  const stepHop = (b: RapierRigidBody, t: number): number => {
    const h = hop.current;
    const u = Math.min(1, (t - h.start) / HOP_SECONDS);
    let scale = 1;
    if (reducedMotion) {
      scale = 1 - u; // no flight: fade out in place
    } else {
      const { p, q, e } = tmp.current;
      b.setNextKinematicTranslation(arcPoint(h.from, cook.target, HOP_PEAK, easeInOut(u), p));
      b.setNextKinematicRotation(q.setFromEuler(e.set(u * 5, u * 3, u * 2)));
      if (u > 0.75) scale = 1 - ((u - 0.75) / 0.25) * 0.6; // shrink into the pot mouth
    }
    if (u >= 1) {
      h.state = "inPot";
      useScene.setState((s) => ({ inPot: s.inPot + 1 }));
      b.setEnabled(false);
      if (!reducedMotion) {
        emitSplash(0.8);
        playSound("plop", spec.halfHeight * 8);
      }
    }
    return scale;
  };

  /** "Start over": pop back out of the pot and arc onto this item's slot. */
  const startPop = (b: RapierRigidBody, t: number) => {
    const h = hop.current;
    h.state = "counter";
    useScene.setState((s) => ({ inPot: Math.max(0, s.inPot - 1) }));
    b.setEnabled(true);
    anim.current.landedAt = NOT_LANDED; // squash again on landing
    if (reducedMotion) {
      anim.current.bornAt = -1; // fixed body, still on its slot: just fade back in
      return;
    }
    anim.current.poppedAt = t; // grow back to full size in flight
    b.setBodyType(rapier.RigidBodyType.Dynamic, true);
    POP_FROM.set(cook.target.x, cook.target.y + 0.13, cook.target.z);
    b.setTranslation(POP_FROM, true);
    const v = launchVelocity(POP_FROM, { x: slot[0], y: spec.halfHeight, z: slot[1] }, POP_SECONDS);
    b.setLinvel(v, true);
    b.setAngvel(
      { x: Math.random() * 4 - 2, y: Math.random() * 6 - 3, z: Math.random() * 4 - 2 },
      true,
    );
    emitSplash(0.6);
  };

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = anim.current;
    const h = hop.current;
    if (a.bornAt < 0) a.bornAt = t;
    if (a.landedAt === LANDING) a.landedAt = t;
    const v = visual.current;
    const b = body.current;
    if (!v || !b) return;

    // Ingredient rain: hold this one out of the simulation (and invisible) until its turn.
    if (a.waiting) {
      if (t - a.bornAt < a.waitUntil) {
        markMoving(); // the rain is under way: keep the frames coming so each drop starts on time
        if (b.isEnabled()) b.setEnabled(false);
        v.scale.setScalar(0);
        if (label.current) label.current.scale = 0;
        return;
      }
      a.waiting = false;
      a.bornAt = t; // the drop (and its never-sleeping limit) starts now
      b.setEnabled(true);
      b.wakeUp();
    }

    // Join a scheduled hop into the pot.
    let rank = cook.rank.get(ingredient.key);
    if (rank === undefined && cook.startAt >= 0 && cook.keys.has(ingredient.key) && !leaving) {
      rank = cook.rank.size; // mounted after Cook was pressed: join the end of the queue
      cook.rank.set(ingredient.key, rank);
    }
    if (h.state === "counter" && !leaving && cook.startAt >= 0 && rank !== undefined) {
      const start = cook.startAt + rank * HOP_STAGGER;
      if (t >= start) {
        h.state = "hopping";
        h.start = start;
        const p = b.translation();
        h.from.set(p.x, p.y, p.z);
        if (sleepTimer.current) clearTimeout(sleepTimer.current);
        if (!reducedMotion) b.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      }
    }
    if (h.state === "inPot" && cook.popGeneration !== h.generation) {
      h.generation = cook.popGeneration;
      h.state = "popping";
      h.start = t + (seed % 7) * 0.05; // a loose, playful stagger
    }
    if (h.state === "popping" && t >= h.start) startPop(b, t);

    let sx = 1;
    let sy = 1;
    // Squash & stretch on first contact (docs/02 §6.1): squash 0.8/1.15, rebound, settle.
    if (a.landedAt >= 0) {
      const dt = t - a.landedAt;
      const k = Math.exp(-dt / 0.11) * Math.cos((dt / 0.24) * Math.PI * 2);
      sy = 1 - 0.2 * k;
      sx = 1 + 0.15 * k;
    }
    let s = 1;
    if (reducedMotion) s = Math.min(1, (t - a.bornAt) / FADE_S);
    if (a.poppedAt >= 0) s *= Math.min(1, 0.35 + ((t - a.poppedAt) / 0.25) * 0.65);
    if (h.state === "hopping") s *= stepHop(b, t);
    if (h.state === "inPot" || h.state === "popping") s = 0;
    if (leaving) {
      if (a.leavingAt < 0) {
        a.leavingAt = t;
        const p = b.translation();
        if (!reducedMotion) emitPuff(new THREE.Vector3(p.x, p.y, p.z), "#f6efe2", 1.2);
      }
      const k = Math.min(1, (t - a.leavingAt) / REMOVE_S);
      // back-in ease: a tiny swell before shrinking to nothing
      s = Math.max(0, 1 - (2.7 * k * k * k - 1.7 * k * k));
      if (k >= 1 && !a.gone) {
        a.gone = true;
        onGone();
      }
    }
    v.scale.set(sx * s, sy * s, sx * s);
    const squashing = a.landedAt >= 0 && t - a.landedAt < 1;
    let moving = h.state === "hopping";
    if (!moving && b.isDynamic() && !b.isSleeping()) {
      const v = b.linvel();
      const w = b.angvel();
      const speed = Math.max(Math.hypot(v.x, v.y, v.z), Math.hypot(w.x, w.y, w.z));
      moving = speed > STILL_SPEED;
      // Never-sleeping bodies (rocking or jittering against a neighbour) kept shadows
      // re-rendering every frame. Fix them in place once barely moving after landing, and in any
      // case a few seconds later.
      const sinceDrop = t - Math.max(a.bornAt, a.poppedAt);
      const settled = !moving && a.landedAt >= 0 && t - a.landedAt > SETTLE_TO_FIXED_S;
      if (h.state === "counter" && (settled || sinceDrop > MAX_DYNAMIC_S)) {
        b.setBodyType(rapier.RigidBodyType.Fixed, false);
        moving = false;
      }
    }
    if (leaving || squashing || (s > 0 && s < 1) || moving) markShadowsDirty();

    const p = b.translation();
    if (!leaving) lastSeen.set(ingredient.key, { x: p.x, y: p.y, z: p.z, inPot: s === 0 });
    // Label floats above the body but doesn't tumble with it.
    const l = label.current;
    if (l) {
      l.position.set(p.x, p.y + spec.halfHeight + 0.07, p.z);
      l.scale = (highlighted ? 0.085 : 0.065) * s;
    }
  });

  return (
    <>
      <RigidBody
        ref={body}
        type={reducedMotion || from ? "fixed" : "dynamic"}
        position={spawn}
        rotation={reducedMotion ? [0, rotation[1], 0] : rotation}
        colliders="hull"
        restitution={0.25}
        friction={0.8}
        linearDamping={0.15}
        angularDamping={0.6}
        onCollisionEnter={() => {
          const a = anim.current;
          if (a.landedAt !== NOT_LANDED || leaving || hop.current.state !== "counter") return;
          a.landedAt = LANDING; // stamped with the render clock on the next frame
          const p = body.current?.translation();
          if (p) emitPuff(new THREE.Vector3(p.x, p.y - spec.halfHeight, p.z), "#d9b98f", 0.7);
          playSound("thunk", Math.min(1, Math.max(0, (spec.halfHeight - 0.03) / 0.06)));
        }}
        onSleep={() => {
          sleepTimer.current = setTimeout(() => {
            // Resting bodies become fixed to save CPU (docs/03 §6.1 step 4).
            if (hop.current.state === "counter") {
              body.current?.setBodyType(rapier.RigidBodyType.Fixed, false);
            }
          }, SLEEP_TO_FIXED_MS);
        }}
        onWake={() => {
          if (sleepTimer.current) clearTimeout(sleepTimer.current);
        }}
      >
        <group
          ref={visual}
          onPointerOver={(e) => {
            e.stopPropagation();
            useScene.getState().setHighlighted(ingredient.key);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            if (useScene.getState().highlighted === ingredient.key)
              useScene.getState().setHighlighted(null);
            document.body.style.cursor = "";
          }}
          onClick={(e) => {
            e.stopPropagation();
            focusChip(ingredient.key);
          }}
        >
          {model ? (
            <ModelShape
              geometry={model.geometry}
              highlighted={highlighted}
              expiring={!!ingredient.expiring}
              reducedMotion={reducedMotion}
            />
          ) : (
            <ClayShape
              spec={spec}
              highlighted={highlighted}
              expiring={!!ingredient.expiring}
              reducedMotion={reducedMotion}
            />
          )}
        </group>
      </RigidBody>
    </>
  );
}
