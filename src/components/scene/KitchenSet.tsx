"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useScene } from "@/store/useScene";
import { pot } from "./cookSignals";
import { mergeParts, type Part } from "./merge";
import { look } from "./lookSignal";
import { markShadowsDirty } from "./shadowGate";
import { skyTexture, tileTexture, woodTexture } from "./textures";

/**
 * The kitchen counter at golden hour (docs/03 §1), built from primitives first; glTF models from
 * docs/06 replace pieces later without changing positions. Counter top is y = 0, units are metres.
 * Static pieces are baked into a few merged meshes to stay well inside the draw-call budget.
 */

export const POT_POSITION: [number, number, number] = [1.02, 0.07, -0.05];
export const BOARD_POSITION: [number, number, number] = [-0.95, 0, 0.06];
export const WINDOW_POSITION: [number, number, number] = [-0.82, 0.98, -0.455];

const PI = Math.PI;
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  plane: new THREE.PlaneGeometry(1, 1),
};
const cyl = (rt: number, rb: number, h: number, seg = 24, open = false) =>
  new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);

function useMerged(parts: () => Part[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(() => mergeParts(parts()), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

export function Counter() {
  const wood = useMemo(() => woodTexture("walnut"), []);
  return (
    <group>
      {/* butcher-block slab */}
      <mesh position={[0, -0.03, 0]} receiveShadow>
        <boxGeometry args={[3.4, 0.06, 0.95]} />
        <meshStandardMaterial map={wood} roughness={0.68} />
      </mesh>
    </group>
  );
}

export function Room() {
  const tiles = useMemo(() => {
    const t = tileTexture().clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 1.1);
    t.needsUpdate = true;
    return t;
  }, []);
  const sky = useMemo(() => skyTexture(), []);
  // The sky outside follows the time of day (deep blue at night, R9).
  const skyMat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => skyMat.current?.color.set(look.current.windowTint));
  const [wx, wy, wz] = WINDOW_POSITION;

  // Wall, cabinet and window frame: receive shadows only (the sun comes from behind the wall).
  const backdrop = useMerged(() => [
    { geometry: G.plane, position: [0, 1.4, -0.5], scale: [6, 1.6, 1], color: "#f7ead8" },
    { geometry: G.box, position: [0, -0.5, 0.02], scale: [3.36, 0.88, 0.86], color: "#e6d3ba" },
    // shaker-style cabinet doors: the darker carcass shows through as the gaps between them
    ...Array.from({ length: 6 }, (_, i): Part => ({
      geometry: G.box,
      position: [-1.4 + i * 0.56, -0.5, 0.456],
      scale: [0.53, 0.8, 0.012],
      color: "#f6ead9",
    })),
    // warm terracotta floor
    {
      geometry: G.plane,
      position: [0, -0.945, 0.8],
      rotation: [-PI / 2, 0, 0],
      scale: [9, 4, 1],
      color: "#d2a37c",
    },
    ...(
      [
        [0, 0.37, 0.86, 0.05],
        [0, -0.37, 0.9, 0.06],
        [-0.41, 0, 0.05, 0.78],
        [0.41, 0, 0.05, 0.78],
        [0, 0, 0.025, 0.7],
      ] as const
    ).map(([x, y, w, h]): Part => ({
      geometry: G.box,
      position: [wx + x, wy + y, wz + 0.02],
      scale: [w, h, 0.05],
      color: "#efe3d0",
    })),
  ]);

  return (
    <group>
      {/* zellige backsplash */}
      <mesh position={[0, 0.3, -0.48]} receiveShadow>
        <planeGeometry args={[4.2, 0.6]} />
        <meshStandardMaterial map={tiles} roughness={0.35} />
      </mesh>
      <mesh geometry={backdrop} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.85} />
      </mesh>
      {/* window: emissive golden sky */}
      <mesh position={[wx, wy, wz]}>
        <planeGeometry args={[0.78, 0.7]} />
        <meshBasicMaterial ref={skyMat} map={sky} toneMapped={false} />
      </mesh>
      {/* sheer linen curtain, gathered to one side */}
      <mesh position={[wx + 0.3, wy, wz + 0.06]}>
        <planeGeometry args={[0.32, 0.86]} />
        <meshStandardMaterial
          color="#fff6ea"
          transparent
          opacity={0.55}
          roughness={1}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

export function Stove({ flameIntensity = 0.6 }: { flameIntensity?: number }) {
  const light = useRef<THREE.PointLight>(null);
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // Subtle noisy flicker from summed sines.
    // The Cook sequence turns the flame up (pot.flame) and makes it flicker harder.
    const wobble = 1 + pot.flame * 1.4;
    const f =
      0.85 +
      (Math.sin(t * 7.3) * 0.06 + Math.sin(t * 13.1 + 1.3) * 0.05 + Math.sin(t * 3.1) * 0.04) *
        wobble;
    const boost = 1 + pot.flame * 1.6;
    if (light.current) light.current.intensity = flameIntensity * f * boost;
    if (glow.current) glow.current.emissiveIntensity = 1.6 * f * (1 + pot.flame * 0.6);
  });
  const [px, , pz] = POT_POSITION;
  return (
    <group>
      <RoundedBox
        args={[0.62, 0.05, 0.42]}
        radius={0.015}
        position={[px - 0.12, 0.025, pz]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#2f2a27" roughness={0.45} metalness={0.3} />
      </RoundedBox>
      {/* idle burner + the lit one under the pot */}
      <mesh position={[px - 0.27, 0.053, pz]} rotation={[-PI / 2, 0, 0]}>
        <torusGeometry args={[0.06, 0.008, 8, 28]} />
        <meshStandardMaterial color="#1c1917" roughness={0.6} />
      </mesh>
      <mesh position={[px, 0.053, pz]} rotation={[-PI / 2, 0, 0]}>
        <torusGeometry args={[0.06, 0.008, 8, 28]} />
        <meshStandardMaterial
          ref={glow}
          color="#ff8a3d"
          emissive="#ff7a2a"
          emissiveIntensity={1.6}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        ref={light}
        position={[px, 0.09, pz]}
        color="#ff9a4a"
        intensity={flameIntensity}
        distance={0.7}
        decay={2}
      />
    </group>
  );
}

const STEEL = "#5a5450";

export function Pot() {
  const [x, y, z] = POT_POSITION;
  const body = useMerged(() => [
    { geometry: cyl(0.13, 0.12, 0.15, 32, true), position: [0, 0.075, 0], color: STEEL },
    {
      geometry: new THREE.CircleGeometry(0.12, 32),
      position: [0, 0.001, 0],
      rotation: [-PI / 2, 0, 0],
      color: STEEL,
    },
    ...[-1, 1].map((s): Part => ({
      geometry: new THREE.TorusGeometry(0.025, 0.007, 8, 16, PI),
      position: [s * 0.15, 0.12, 0],
      rotation: [0, 0, PI / 2],
      color: STEEL,
    })),
  ]);
  // Lid + knob move together; the lid hinges back over its rear rim in the Cook sequence.
  const lid = useMerged(() => [
    { geometry: cyl(0.135, 0.135, 0.012, 32), color: "#8d857e" },
    { geometry: new THREE.SphereGeometry(0.018, 12, 10), position: [0, 0.02, 0], color: "#2b1d14" },
  ]);
  const hinge = useRef<THREE.Group>(null);
  const liquid = useRef<THREE.Mesh>(null);
  const lastLid = useRef(-1);
  useFrame(({ clock }) => {
    if (hinge.current) hinge.current.rotation.x = -pot.lid * 1.7;
    if (pot.lid !== lastLid.current) {
      lastLid.current = pot.lid;
      markShadowsDirty(); // the lid casts a shadow
    }
    if (liquid.current) {
      const t = clock.elapsedTime;
      liquid.current.position.y =
        0.11 + pot.liquid * 0.025 + Math.sin(t * 9) * 0.0015 * pot.bubbles;
    }
  });
  return (
    <group position={[x, y, z]}>
      <mesh geometry={body} castShadow receiveShadow>
        <meshStandardMaterial
          vertexColors
          metalness={0.65}
          roughness={0.38}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* simmering liquid surface */}
      <mesh ref={liquid} position={[0, 0.11, 0]} rotation={[-PI / 2, 0, 0]}>
        <circleGeometry args={[0.125, 32]} />
        <meshStandardMaterial color="#c9792f" roughness={0.25} />
      </mesh>
      {/* hinge on the rear rim; the lid itself sits slightly ajar */}
      <group ref={hinge} position={[0, 0.155, -0.135]}>
        <group name="pot-lid" position={[0.01, 0, 0.135]} rotation={[0, 0, -0.06]}>
          <mesh geometry={lid} castShadow>
            <meshStandardMaterial vertexColors metalness={0.45} roughness={0.35} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** `bookOpen`: the recipe book lies on the board, so the knife is put away. */
export function CuttingBoard({ bookOpen = false }: { bookOpen?: boolean }) {
  const wood = useMemo(() => woodTexture("board"), []);
  const [x, , z] = BOARD_POSITION;
  const knife = useMerged(() => [
    {
      geometry: G.box,
      position: [0.02, 0.034, 0.08],
      rotation: [0, -0.35, 0],
      scale: [0.2, 0.004, 0.035],
      color: "#d7d7d4",
    },
    {
      geometry: new THREE.CapsuleGeometry(0.012, 0.09, 4, 8),
      position: [-0.13, 0.038, 0.12],
      rotation: [0, -0.35, PI / 2],
      color: "#3b2a1d",
    },
  ]);
  // Cook Mode "chop"/"grind" steps (docs/03 §6.8): the knife rocks on its handle, tip lifting
  // and dropping. Pivot = the handle end; the axis is horizontal and across the blade.
  const knifePivot = useRef<THREE.Group>(null);
  const chop = useMemo(
    () => ({ axis: new THREE.Vector3(-0.34, 0, 0.94).normalize(), q: new THREE.Quaternion() }),
    [],
  );
  useFrame(({ clock }) => {
    const g = knifePivot.current;
    if (!g) return;
    const action = useScene.getState().cookAction;
    const chopping = action === "chop" || action === "grind";
    const lift = chopping ? 0.32 * Math.max(0, Math.sin(clock.elapsedTime * 9)) ** 2 : 0;
    g.quaternion.copy(chop.q.setFromAxisAngle(chop.axis, lift));
  });
  return (
    <group position={[x, 0, z]} rotation={[0, 0.12, 0]}>
      <RoundedBox
        args={[0.46, 0.03, 0.3]}
        radius={0.012}
        position={[0, 0.015, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial map={wood} roughness={0.7} />
      </RoundedBox>
      <group ref={knifePivot} position={[-0.13, 0.038, 0.12]} visible={!bookOpen}>
        <mesh geometry={knife} position={[0.13, -0.038, -0.12]}>
          <meshStandardMaterial vertexColors metalness={0.4} roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Static props (docs/03 §1): salt jar, tulsi/basil pot, linen towel (matte) and the hanging ladle
 * and masala dabba (metal). Two merged meshes in total.
 */
export function Props() {
  const matte = useMerged(() => [
    // salt jar: ceramic with a wooden lid
    { geometry: cyl(0.05, 0.055, 0.12), position: [-0.42, 0.06, -0.33], color: "#f6efe4" },
    { geometry: cyl(0.052, 0.052, 0.02), position: [-0.42, 0.128, -0.33], color: "#9a7553" },
    // tulsi / basil in a terracotta pot
    { geometry: cyl(0.08, 0.06, 0.13, 20), position: [-1.42, 0.065, -0.27], color: "#c56b45" },
    ...(
      [
        [0, 0.2, 0, 0.07],
        [0.05, 0.17, 0.03, 0.05],
        [-0.05, 0.18, -0.02, 0.055],
        [0.01, 0.25, -0.03, 0.045],
      ] as const
    ).map(([lx, ly, lz, r], i): Part => ({
      geometry: new THREE.IcosahedronGeometry(r, 1),
      position: [-1.42 + lx, ly, -0.27 + lz],
      color: i % 2 ? "#5d8f45" : "#4e7a3a",
    })),
    // linen towel draped over the front edge, with two red stripes
    {
      geometry: G.box,
      position: [0.68, 0.004, 0.38],
      scale: [0.26, 0.008, 0.14],
      color: "#efe2cf",
    },
    { geometry: G.box, position: [0.68, -0.1, 0.453], scale: [0.26, 0.2, 0.008], color: "#efe2cf" },
    ...[-0.08, 0.08].map((sx): Part => ({
      geometry: G.box,
      position: [0.68 + sx, -0.1, 0.458],
      scale: [0.012, 0.2, 0.002],
      color: "#c8432a",
    })),
  ]);

  const metal = useMerged(() => [
    // copper ladle hanging from a rail on the backsplash
    {
      geometry: cyl(0.008, 0.008, 0.7, 10),
      position: [0.42, 0.62, -0.43],
      rotation: [0, 0, PI / 2],
      color: "#b9b2a8",
    },
    { geometry: cyl(0.007, 0.007, 0.26, 8), position: [0.52, 0.49, -0.41], color: "#b87333" },
    {
      geometry: new THREE.SphereGeometry(0.045, 18, 10, 0, PI * 2, 0, PI / 2),
      position: [0.52, 0.34, -0.395],
      rotation: [PI, 0, 0],
      color: "#b87333",
    },
    // brass cabinet knobs
    ...Array.from({ length: 6 }, (_, i): Part => ({
      geometry: new THREE.SphereGeometry(0.014, 10, 8),
      position: [-1.4 + i * 0.56 + (i % 2 ? -0.2 : 0.2), -0.24, 0.47],
      color: "#b88a4a",
    })),
    // masala dabba: round steel tin
    { geometry: cyl(0.1, 0.1, 0.07, 32), position: [0.42, 0.035, -0.3], color: "#c9c6c0" },
    { geometry: cyl(0.102, 0.102, 0.008, 32), position: [0.42, 0.074, -0.3], color: "#d8d5cf" },
  ]);

  return (
    <group>
      <mesh geometry={matte} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.7} />
      </mesh>
      <mesh geometry={metal} castShadow receiveShadow>
        <meshStandardMaterial
          vertexColors
          metalness={0.8}
          roughness={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
