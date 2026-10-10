"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { WINDOW_POSITION } from "./KitchenSet";
import { look } from "./lookSignal";
import { mergeParts } from "./merge";

const LAMP: [number, number, number] = [0.32, 0.92, -0.08];
// A hand-width from the tiles: closer, its light made a hot spot on the wall (bloom).
const CANDLE: [number, number, number] = [-0.66, 0, -0.16];
const CANDLE_LIGHT = "#FFB45C";

/**
 * Night in the kitchen (docs/03 §3, R9): a moon in the window, a pendant lamp over the counter
 * and a candle by the backsplash. The spot and point lights always exist (zero intensity by day),
 * so the number of lights, and with it every shader, never changes when night falls.
 */
export function NightLights() {
  const spot = useRef<THREE.SpotLight>(null);
  const candleLight = useRef<THREE.PointLight>(null);
  const bulb = useRef<THREE.MeshStandardMaterial>(null);
  const flame = useRef<THREE.Mesh>(null);
  const candle = useRef<THREE.Group>(null);
  const moon = useRef<THREE.MeshBasicMaterial>(null);
  const spotTarget = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(LAMP[0], 0, LAMP[2]);
    return o;
  }, []);

  // Cord and enamel shade: one merged mesh.
  const lampBody = useMemo(
    () =>
      mergeParts([
        {
          geometry: new THREE.CylinderGeometry(0.004, 0.004, 1.2, 6),
          position: [LAMP[0], LAMP[1] + 0.66, LAMP[2]],
          color: "#2b1d14",
        },
        {
          geometry: new THREE.CylinderGeometry(0.035, 0.16, 0.12, 32, 1, true),
          position: [LAMP[0], LAMP[1], LAMP[2]],
          color: "#3f5b4a",
        },
        {
          geometry: new THREE.CylinderGeometry(0.02, 0.035, 0.04, 16),
          position: [LAMP[0], LAMP[1] + 0.075, LAMP[2]],
          color: "#2b1d14",
        },
      ]),
    [],
  );
  const candleBody = useMemo(
    () =>
      mergeParts([
        {
          geometry: new THREE.CylinderGeometry(0.05, 0.055, 0.012, 24),
          position: [0, 0.006, 0],
          color: "#8b6a4f",
        },
        {
          geometry: new THREE.CylinderGeometry(0.024, 0.024, 0.09, 20),
          position: [0, 0.057, 0],
          color: "#f6ecd8",
        },
      ]),
    [],
  );
  useEffect(
    () => () => {
      lampBody.dispose();
      candleBody.dispose();
    },
    [lampBody, candleBody],
  );

  useFrame(({ clock }) => {
    const l = look.current;
    const t = clock.elapsedTime;
    if (spot.current) spot.current.intensity = 6 * l.lamp;
    if (bulb.current) bulb.current.emissiveIntensity = 2.5 * l.lamp;
    // Candle flicker: summed sines (cheap smooth noise).
    const flicker = 1 + Math.sin(t * 9.1) * 0.08 + Math.sin(t * 23.7) * 0.05;
    if (candleLight.current) candleLight.current.intensity = 0.14 * l.candle * flicker;
    if (flame.current) {
      flame.current.scale.set(1, 0.85 + 0.15 * flicker, 1);
      flame.current.visible = l.candle > 0.02;
    }
    if (candle.current) candle.current.visible = l.candle > 0.02;
    if (moon.current) moon.current.opacity = l.moon;
  });

  const [wx, wy, wz] = WINDOW_POSITION;
  return (
    <>
      <primitive object={spotTarget} />
      <mesh geometry={lampBody} castShadow>
        <meshStandardMaterial vertexColors roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[LAMP[0], LAMP[1] - 0.01, LAMP[2]]}>
        <sphereGeometry args={[0.03, 16, 12]} />
        <meshStandardMaterial
          ref={bulb}
          color="#fff3dc"
          emissive={CANDLE_LIGHT}
          emissiveIntensity={0}
          toneMapped={false}
        />
      </mesh>
      <spotLight
        ref={spot}
        position={[LAMP[0], LAMP[1] - 0.02, LAMP[2]]}
        target={spotTarget}
        color={CANDLE_LIGHT}
        intensity={0}
        angle={0.95}
        penumbra={0.85}
        distance={3}
        decay={1.6}
      />
      <group ref={candle} position={CANDLE} visible={false}>
        <mesh geometry={candleBody}>
          <meshStandardMaterial vertexColors roughness={0.7} />
        </mesh>
        <mesh ref={flame} position={[0, 0.118, 0]}>
          <coneGeometry args={[0.009, 0.03, 10]} />
          <meshBasicMaterial color="#ffd28a" toneMapped={false} />
        </mesh>
      </group>
      <pointLight
        ref={candleLight}
        position={[CANDLE[0], 0.14, CANDLE[2]]}
        color={CANDLE_LIGHT}
        intensity={0}
        distance={0.8}
        decay={2}
      />
      {/* the moon, low in the window */}
      <mesh position={[wx + 0.2, wy + 0.16, wz + 0.004]}>
        <circleGeometry args={[0.045, 32]} />
        <meshBasicMaterial ref={moon} color="#f4f1e6" transparent opacity={0} toneMapped={false} />
      </mesh>
    </>
  );
}
