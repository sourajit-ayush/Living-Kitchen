"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { glass, GLASS_HEIGHT, GLASS_POSITION } from "./cookSignals";

const R_TOP = 0.046;
const R_BOTTOM = 0.038;
const BASE = 0.012;
const FILL = GLASS_HEIGHT - BASE - 0.02; // liquid height when full
const BUBBLES = 16;
const ICE = 3;

/** Inner radius at height y above the base (the tumbler tapers towards the bottom). */
const radiusAt = (y: number) => R_BOTTOM + (R_TOP - R_BOTTOM) * (y / GLASS_HEIGHT) - 0.003;

/** A soft cream swirl on amber, painted once: the drink's surface while it is being mixed. */
function swirlTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#d9a05b";
  g.fillRect(0, 0, size, size);
  g.strokeStyle = "rgba(255, 244, 225, 0.55)";
  g.lineWidth = 5;
  g.lineCap = "round";
  g.beginPath();
  for (let a = 0; a < Math.PI * 5; a += 0.08) {
    const r = (a / (Math.PI * 5)) * size * 0.46;
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r;
    if (a === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The drinks counterpart of the pot (Cook sequence for drinks): a tall glass that appears in
 * front of the stove, takes the ingredients in, swirls and fizzes while the AI thinks (glass.fizz
 * follows the progress) and gets a straw when the drink is ready. All channels come from
 * cookSignals.glass, written by the director, so nothing here re-renders through React.
 * Mounted (hidden) from the start so its shaders compile in the start-up warm-up.
 */
export function DrinkGlass() {
  const group = useRef<THREE.Group>(null);
  const liquid = useRef<THREE.Mesh>(null);
  const surface = useRef<THREE.Mesh>(null);
  const bubbles = useRef<THREE.InstancedMesh>(null);
  const ice = useRef<THREE.InstancedMesh>(null);
  const straw = useRef<THREE.Group>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const texture = useMemo(() => swirlTexture(), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: BUBBLES }, (_, i) => ({
        a: i * 2.39996,
        r: Math.sqrt(((i * 0.618) % 1) * 0.8),
        phase: (i * 0.37) % 1,
        speed: 0.5 + (i % 4) * 0.18,
      })),
    [],
  );

  useLayoutEffect(() => () => texture.dispose(), [texture]);

  useFrame(({ clock }, dt) => {
    const g = group.current;
    if (!g) return;
    const show = glass.show;
    g.visible = show > 0.001;
    if (!g.visible) return;
    g.scale.setScalar(show);
    const t = clock.elapsedTime;

    // Liquid: a unit-height cylinder stretched to the fill level.
    const h = Math.max(0.0005, FILL * glass.liquid);
    if (liquid.current) {
      liquid.current.scale.set(1, h, 1);
      liquid.current.position.y = BASE + h / 2;
      liquid.current.visible = glass.liquid > 0.01;
    }
    if (surface.current) {
      surface.current.position.y = BASE + h + 0.0005;
      const r = radiusAt(BASE + h) / R_TOP;
      surface.current.scale.set(r, r, 1);
      surface.current.rotation.z -= dt * (0.4 + glass.fizz * 3.2);
      surface.current.visible = glass.liquid > 0.01;
    }

    // Fizz: little bubbles rising through the drink, more as the AI gets further.
    const b = bubbles.current;
    if (b) {
      const active = glass.liquid > 0.05 ? Math.round(glass.fizz * BUBBLES) : 0;
      for (let i = 0; i < active; i++) {
        const s = seeds[i];
        const u = (t * s.speed + s.phase) % 1;
        const y = BASE + 0.004 + u * (h - 0.006);
        const r = s.r * radiusAt(y) * 0.85;
        dummy.position.set(Math.cos(s.a + u * 2) * r, y, Math.sin(s.a + u * 2) * r);
        dummy.scale.setScalar(0.0018 + u * 0.0016);
        dummy.updateMatrix();
        b.setMatrixAt(i, dummy.matrix);
      }
      b.count = active;
      b.instanceMatrix.needsUpdate = true;
    }

    // Ice: three cubes bobbing at the surface once there is enough drink.
    const c = ice.current;
    if (c) {
      const on = glass.liquid > 0.45;
      for (let i = 0; i < ICE; i++) {
        const a = i * 2.1 + t * 0.25;
        dummy.position.set(
          Math.cos(a) * 0.017,
          BASE + h - 0.004 + Math.sin(t * 1.6 + i) * 0.002,
          Math.sin(a) * 0.017,
        );
        dummy.rotation.set(0.4 + i, a, 0.3 * i);
        dummy.scale.setScalar(on ? 1 : 0);
        dummy.updateMatrix();
        c.setMatrixAt(i, dummy.matrix);
      }
      c.instanceMatrix.needsUpdate = true;
    }

    if (straw.current) {
      straw.current.visible = glass.straw > 0.01;
      straw.current.scale.set(1, glass.straw, 1);
    }
  });

  return (
    <group ref={group} position={GLASS_POSITION} visible={false} name="drink-glass">
      {/* the glass: a tapered, open tumbler, a thick base and a bright rim so it reads */}
      <mesh position={[0, GLASS_HEIGHT / 2, 0]} renderOrder={3}>
        <cylinderGeometry args={[R_TOP, R_BOTTOM, GLASS_HEIGHT, 32, 1, true]} />
        <meshStandardMaterial
          color="#ffffff"
          roughness={0.06}
          metalness={0.1}
          transparent
          opacity={0.22}
          side={THREE.DoubleSide}
          depthWrite={false}
          envMapIntensity={1.5}
        />
      </mesh>
      <mesh position={[0, BASE / 2, 0]} renderOrder={3}>
        <cylinderGeometry args={[R_BOTTOM, R_BOTTOM, BASE, 32]} />
        <meshStandardMaterial
          color="#f4fbff"
          roughness={0.1}
          transparent
          opacity={0.45}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, GLASS_HEIGHT, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R_TOP, 0.0016, 6, 40]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} transparent opacity={0.7} />
      </mesh>

      {/* the drink */}
      <mesh ref={liquid} renderOrder={2}>
        <cylinderGeometry args={[radiusAt(FILL), radiusAt(BASE), 1, 32]} />
        <meshStandardMaterial color="#d9a05b" roughness={0.35} transparent opacity={0.92} />
      </mesh>
      <mesh ref={surface} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <circleGeometry args={[R_TOP, 32]} />
        <meshStandardMaterial map={texture} roughness={0.3} />
      </mesh>
      <instancedMesh ref={bubbles} args={[undefined, undefined, BUBBLES]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 4]} />
        <meshBasicMaterial color="#fff6e8" transparent opacity={0.75} />
      </instancedMesh>
      <instancedMesh ref={ice} args={[undefined, undefined, ICE]} frustumCulled={false}>
        <boxGeometry args={[0.016, 0.016, 0.016]} />
        <meshStandardMaterial color="#f2fbff" roughness={0.15} transparent opacity={0.6} />
      </instancedMesh>

      {/* the straw, tilted against the rim */}
      <group ref={straw} position={[0.012, 0.03, 0]} rotation={[0, 0, -0.22]} visible={false}>
        <mesh position={[0, 0.11, 0]}>
          <cylinderGeometry args={[0.0035, 0.0035, 0.22, 8]} />
          <meshStandardMaterial color="#c0512e" roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}
