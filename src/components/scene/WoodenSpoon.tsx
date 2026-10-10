"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useScene } from "@/store/useScene";
import { POT_MOUTH } from "./cookSignals";
import { mergeParts } from "./merge";

const STIRRING = new Set(["stir", "mix", "fry"]);

/**
 * Cook Mode "stir" / "mix" / "fry" steps (docs/03 §6.8): a wooden spoon circling in the pot,
 * tilted against the rim. One merged, vertex-coloured mesh; hidden the rest of the time.
 */
export function WoodenSpoon() {
  const group = useRef<THREE.Group>(null);
  const geometry = useMemo(
    () =>
      mergeParts([
        {
          geometry: new THREE.CylinderGeometry(0.007, 0.009, 0.32, 10),
          position: [0, 0.16, 0],
          color: "#b07a48",
        },
        {
          geometry: new THREE.SphereGeometry(0.026, 14, 10),
          position: [0, 0, 0],
          scale: [1, 0.45, 1.35],
          color: "#a26c3d",
        },
      ]),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  const visible = useRef(0);
  useFrame(({ clock }, dt) => {
    const g = group.current;
    if (!g) return;
    const on = STIRRING.has(useScene.getState().cookAction ?? "");
    // ease in and out rather than popping
    visible.current = THREE.MathUtils.clamp(visible.current + (on ? dt : -dt) * 3, 0, 1);
    g.visible = visible.current > 0.01;
    if (!g.visible) return;
    const t = clock.elapsedTime * (useScene.getState().cookAction === "fry" ? 3.2 : 2.2);
    const r = 0.055;
    g.position.set(
      POT_MOUTH.x + Math.cos(t) * r,
      POT_MOUTH.y - 0.03 + (1 - visible.current) * 0.15,
      POT_MOUTH.z + Math.sin(t) * r,
    );
    // lean the handle outward, toward the rim it rests against
    g.rotation.set(Math.sin(t) * 0.45, 0, -Math.cos(t) * 0.45);
    g.scale.setScalar(visible.current);
  });

  return (
    <group ref={group} visible={false}>
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial vertexColors roughness={0.75} />
      </mesh>
    </group>
  );
}
