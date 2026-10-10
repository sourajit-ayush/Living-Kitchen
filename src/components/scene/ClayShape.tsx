"use client";

import { Outlines } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CATEGORY_COLORS, type IngredientCategory } from "@/data/ingredients";
import { palette } from "./ingredientModels";
import { mulberry32 } from "./placement";

/**
 * The "clay blob" fallback (project rule 7 in the README): a soft, matte, slightly stylized shape per food
 * category, tinted with the category colour and jittered per ingredient so a counter full of
 * blobs still reads as different things. Real glTF models replace these per ingredient later.
 */

type ShapeKind = "round" | "block" | "capsule" | "jar" | "bottle" | "pebble";

const KIND: Record<IngredientCategory, ShapeKind> = {
  veg: "round",
  fruit: "round",
  dairy: "block",
  grain: "block",
  protein: "capsule",
  spice: "jar",
  sauce: "bottle",
  other: "pebble",
};

// Shared unit geometries (one GPU upload each, scaled per instance).
const GEO = {
  sphere: new THREE.SphereGeometry(1, 28, 20),
  block: new RoundedBoxGeometry(1, 1, 1, 3, 0.18),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 6, 16),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
  neck: new THREE.CylinderGeometry(0.22, 0.32, 1, 16),
};

export type ClaySpec = {
  kind: ShapeKind;
  color: THREE.Color;
  /** Half-height in metres, so the resting centre sits at y = halfHeight */
  halfHeight: number;
  size: [number, number, number];
};

/** Deterministic per-ingredient shape/colour (seed = hash of the ingredient key). */
export function claySpec(category: IngredientCategory, seed: number): ClaySpec {
  const rand = mulberry32(seed);
  const kind = KIND[category];
  const color = new THREE.Color(CATEGORY_COLORS[category]);
  color.offsetHSL((rand() - 0.5) * 0.04, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.08);
  // Real-world ~8–15 cm, oversized ×1.3 for readability (docs/03 §2).
  const j = () => 0.9 + rand() * 0.2;
  const sizes: Record<ShapeKind, [number, number, number]> = {
    round: [0.12 * j(), 0.105 * j(), 0.12 * j()],
    pebble: [0.12 * j(), 0.08 * j(), 0.1 * j()],
    block: [0.14 * j(), 0.08 * j(), 0.1 * j()],
    capsule: [0.075 * j(), 0.16 * j(), 0.075 * j()],
    jar: [0.08 * j(), 0.1 * j(), 0.08 * j()],
    bottle: [0.07 * j(), 0.17 * j(), 0.07 * j()],
  };
  const size = sizes[kind];
  // Capsules lie on their side, so their resting height is their diameter.
  const halfHeight = kind === "capsule" ? size[0] / 2 : size[1] / 2;
  return { kind, color, halfHeight, size };
}

const GLOW = new THREE.Color("#F4B23E");
/** docs/03 §6.5: expiring items pulse softly in saffron, once every 1.6 s. */
const GLOW_PERIOD_S = 1.6;

/**
 * Use-It-Up glow (R4): a warm saffron emissive that breathes. Emissive is a uniform of the
 * standard material, so this compiles no new shader (nothing to stall on, nothing to warm up).
 */
export function useExpiringGlow(
  material: React.RefObject<THREE.MeshStandardMaterial | null>,
  expiring: boolean,
  reducedMotion: boolean,
) {
  useEffect(() => {
    const m = material.current;
    if (!m) return;
    m.emissive.copy(expiring ? GLOW : new THREE.Color(0, 0, 0));
    m.emissiveIntensity = expiring ? 0.35 : 0;
  }, [material, expiring]);
  useFrame(({ clock }) => {
    const m = material.current;
    if (!m || !expiring || reducedMotion) return;
    const k = 0.5 - 0.5 * Math.cos((clock.elapsedTime / GLOW_PERIOD_S) * Math.PI * 2);
    m.emissiveIntensity = 0.18 + 0.32 * k;
  });
}

export function ClayShape({
  spec,
  highlighted,
  expiring = false,
  reducedMotion = false,
}: {
  spec: ClaySpec;
  highlighted: boolean;
  expiring?: boolean;
  reducedMotion?: boolean;
}) {
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.62, metalness: 0 }),
    [spec.color],
  );
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(material);
  materialRef.current = material;
  useExpiringGlow(materialRef, expiring, reducedMotion);
  const [w, h, d] = spec.size;
  const outline = highlighted ? (
    // Default (non-screenspace) mode measures thickness in pixels, so non-uniform scale is fine.
    <Outlines thickness={3} color="#F4B23E" />
  ) : null;

  switch (spec.kind) {
    case "round":
    case "pebble":
      return (
        <mesh
          geometry={GEO.sphere}
          material={material}
          scale={[w / 2, h / 2, d / 2]}
          castShadow
          receiveShadow
        >
          {outline}
        </mesh>
      );
    case "block":
      return (
        <mesh geometry={GEO.block} material={material} scale={[w, h, d]} castShadow receiveShadow>
          {outline}
        </mesh>
      );
    case "capsule":
      return (
        <mesh
          geometry={GEO.capsule}
          material={material}
          rotation={[0, 0, Math.PI / 2]}
          scale={[w, h / 2, d]}
          castShadow
          receiveShadow
        >
          {outline}
        </mesh>
      );
    case "jar":
    case "bottle":
      // Two-part shapes are merged into one geometry (one draw call, one shadow call).
      return (
        <MergedShape
          spec={spec}
          outline={outline}
          expiring={expiring}
          reducedMotion={reducedMotion}
        />
      );
  }
}

const LID_COLOR = new THREE.Color("#8B6A4F");

/** Bake a part's transform and a flat vertex colour into a cylinder, for merging. */
function part(
  geo: THREE.BufferGeometry,
  scale: [number, number, number],
  y: number,
  color: THREE.Color,
): THREE.BufferGeometry {
  const g = geo.clone();
  g.scale(...scale);
  g.translate(0, y, 0);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

function MergedShape({
  spec,
  outline,
  expiring,
  reducedMotion,
}: {
  spec: ClaySpec;
  outline: React.ReactNode;
  expiring: boolean;
  reducedMotion: boolean;
}) {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  useExpiringGlow(materialRef, expiring, reducedMotion);
  const [w, h, d] = spec.size;
  const geometry = useMemo(() => {
    const parts =
      spec.kind === "jar"
        ? [
            part(GEO.cylinder, [w, h * 0.8, d], -h * 0.1, spec.color),
            part(GEO.cylinder, [w * 1.05, h * 0.2, d * 1.05], h * 0.4, LID_COLOR),
          ]
        : [
            part(GEO.cylinder, [w, h * 0.68, d], -h * 0.16, spec.color),
            part(GEO.neck, [w, h * 0.32, d], h * 0.34, spec.color),
          ];
    const merged = mergeGeometries(parts)!;
    parts.forEach((p) => p.dispose());
    return merged;
  }, [spec, w, h, d]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial ref={materialRef} vertexColors roughness={0.6} />
      {outline}
    </mesh>
  );
}

/**
 * A real ingredient model (Kenney Food Kit) in place of the clay blob: the shared palette texture
 * on a matte material of its own (so the expiring glow and the hover outline work per item).
 */
export function ModelShape({
  geometry,
  highlighted,
  expiring = false,
  reducedMotion = false,
}: {
  geometry: THREE.BufferGeometry;
  highlighted: boolean;
  expiring?: boolean;
  reducedMotion?: boolean;
}) {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: palette.texture,
        roughness: 0.62,
        metalness: 0,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(material);
  materialRef.current = material;
  useExpiringGlow(materialRef, expiring, reducedMotion);
  return (
    <mesh geometry={geometry} material={material} castShadow receiveShadow>
      {highlighted ? <Outlines thickness={3} color="#F4B23E" /> : null}
    </mesh>
  );
}
