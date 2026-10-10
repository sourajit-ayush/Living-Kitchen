"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { cook, pot, POT_MOUTH } from "./cookSignals";

/**
 * Pot effects for the Cook sequence (docs/03 §6.3): bubbles popping on the liquid while the AI
 * thinks (intensity = pot.bubbles) and splash droplets when an ingredient lands in the pot.
 * Each is one instanced mesh, so both together cost two draw calls.
 */

const BUBBLES = 22;
const DROPS_PER_SPLASH = 10;
const MAX_DROPS = 60;
const DROP_LIFE = 0.55;
const LIQUID_Y = 0.07 + 0.11; // pot base + liquid height (world)

type Drop = { pos: THREE.Vector3; vel: THREE.Vector3; born: number; color: THREE.Color };
const pending: { at: THREE.Vector3; strength: number; color: THREE.Color }[] = [];

/** Fire a splash at the pot or glass mouth (or `at`); `strength` scales droplet count and speed. */
export function emitSplash(strength = 1, color = "#d98a3a", at: THREE.Vector3 = cook.target) {
  // A glass is a lot narrower than the pot: smaller, paler splashes.
  const glass = cook.vessel === "glass" && at === cook.target;
  pending.push({
    at: at.clone(),
    strength: glass ? strength * 0.4 : strength,
    color: new THREE.Color(glass ? "#f1d9b0" : color),
  });
}

export function PotFx() {
  const bubbles = useRef<THREE.InstancedMesh>(null);
  const drops = useRef<THREE.InstancedMesh>(null);
  const live = useRef<Drop[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  // Each bubble: a fixed spot on the surface, its own phase and speed.
  const seeds = useMemo(
    () =>
      Array.from({ length: BUBBLES }, (_, i) => {
        const r = Math.sqrt(((i * 0.618) % 1) * 0.9) * 0.1;
        const a = i * 2.39996;
        return {
          x: Math.cos(a) * r,
          z: Math.sin(a) * r,
          phase: (i * 0.37) % 1,
          speed: 1.2 + (i % 5) * 0.25,
        };
      }),
    [],
  );

  // Start empty, with the per-instance colour attribute already present: three adds it on the first
  // setColorAt(), which would swap shader variants (a synchronous compile) mid-splash.
  useLayoutEffect(() => {
    drops.current?.setColorAt(0, new THREE.Color());
    if (drops.current) drops.current.count = 0;
    if (bubbles.current) bubbles.current.count = 0;
  }, []);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;

    const b = bubbles.current;
    if (b) {
      const active = Math.round(pot.bubbles * BUBBLES);
      const surface = LIQUID_Y + pot.liquid * 0.025 + 0.002;
      for (let i = 0; i < active; i++) {
        const s = seeds[i];
        const life = (t * s.speed + s.phase) % 1; // grow, then pop
        dummy.position.set(POT_MOUTH.x + s.x, surface, POT_MOUTH.z + s.z);
        const r = 0.003 + life * 0.0065 * (0.6 + pot.bubbles * 0.6);
        dummy.scale.set(r, r * 0.55, r); // domes on the surface, not floating balls
        dummy.updateMatrix();
        b.setMatrixAt(i, dummy.matrix);
      }
      b.count = active;
      b.instanceMatrix.needsUpdate = true;
    }

    const d = drops.current;
    if (!d) return;
    while (pending.length) {
      const s = pending.shift()!;
      for (let i = 0; i < Math.round(DROPS_PER_SPLASH * s.strength); i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = (0.35 + Math.random() * 0.45) * s.strength;
        live.current.push({
          pos: s.at.clone(),
          vel: new THREE.Vector3(
            Math.cos(a) * speed * 0.6,
            0.9 + Math.random() * 0.8,
            Math.sin(a) * speed * 0.6,
          ),
          born: t,
          color: s.color,
        });
      }
      if (live.current.length > MAX_DROPS) live.current.splice(0, live.current.length - MAX_DROPS);
    }
    live.current = live.current.filter((p) => t - p.born < DROP_LIFE);
    let n = 0;
    for (const p of live.current) {
      p.vel.y -= 9.81 * dt;
      p.pos.addScaledVector(p.vel, dt);
      const k = (t - p.born) / DROP_LIFE;
      dummy.position.copy(p.pos);
      dummy.scale.setScalar(0.007 * (1 - k * 0.7));
      dummy.updateMatrix();
      d.setMatrixAt(n, dummy.matrix);
      d.setColorAt(n, p.color);
      n++;
    }
    d.count = n;
    d.instanceMatrix.needsUpdate = true;
    if (d.instanceColor) d.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={bubbles} args={[undefined, undefined, BUBBLES]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#f7d6a8" roughness={0.1} transparent opacity={0.5} />
      </instancedMesh>
      <instancedMesh ref={drops} args={[undefined, undefined, MAX_DROPS]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 4]} />
        <meshStandardMaterial roughness={0.2} />
      </instancedMesh>
    </>
  );
}
