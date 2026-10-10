"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Wood-dust (landing) and flour (removal) puffs from docs/02 §6 / docs/03 §6.2.
 * All bursts share ONE instanced mesh, so any number of puffs costs a single draw call.
 */

const PARTICLES = 12;
const MAX_PUFFS = 8;
const LIFE = 0.65;

type Puff = {
  origin: THREE.Vector3;
  color: THREE.Color;
  born: number;
  strength: number;
  dirs: THREE.Vector3[];
};

const queue: Omit<Puff, "born" | "dirs">[] = [];
const listeners = new Set<() => void>();

/** Fire-and-forget from anywhere in the scene. */
export function emitPuff(origin: THREE.Vector3, color = "#f3e6d2", strength = 1) {
  queue.push({ origin: origin.clone(), color: new THREE.Color(color), strength });
  listeners.forEach((l) => l());
}

export function DustPuffs() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const puffs = useRef<Puff[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const clock = useRef(0);

  // Colour attribute up front so the warm-up compiles the final shader variant (see PotFx).
  useLayoutEffect(() => {
    mesh.current?.setColorAt(0, new THREE.Color());
    if (mesh.current) mesh.current.count = 0;
  }, []);

  useEffect(() => {
    const drain = () => {
      while (queue.length) {
        const p = queue.shift()!;
        const dirs = Array.from({ length: PARTICLES }, (_, i) => {
          const a = (i / PARTICLES) * Math.PI * 2 + Math.random() * 0.4;
          return new THREE.Vector3(
            Math.cos(a),
            0.5 + Math.random() * 0.8,
            Math.sin(a),
          ).multiplyScalar(0.12 + Math.random() * 0.1);
        });
        puffs.current.push({ ...p, born: clock.current, dirs });
        if (puffs.current.length > MAX_PUFFS) puffs.current.shift();
      }
    };
    listeners.add(drain);
    return () => void listeners.delete(drain);
  }, []);

  useFrame((_, dt) => {
    clock.current += dt;
    const m = mesh.current;
    if (!m) return;
    puffs.current = puffs.current.filter((p) => clock.current - p.born < LIFE);
    let n = 0;
    for (const p of puffs.current) {
      const t = (clock.current - p.born) / LIFE;
      const ease = 1 - (1 - t) ** 3;
      for (const dir of p.dirs) {
        dummy.position.copy(p.origin).addScaledVector(dir, ease * p.strength);
        dummy.scale.setScalar(0.012 * p.strength * (1 - t) * (0.6 + ease));
        dummy.updateMatrix();
        m.setMatrixAt(n, dummy.matrix);
        m.setColorAt(n, p.color);
        n++;
      }
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, PARTICLES * MAX_PUFFS]}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 6, 4]} />
      <meshStandardMaterial roughness={1} transparent opacity={0.85} depthWrite={false} />
    </instancedMesh>
  );
}
