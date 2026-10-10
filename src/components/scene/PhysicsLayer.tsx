"use client";

import { CuboidCollider, CylinderCollider, Physics, RigidBody } from "@react-three/rapier";
import { BOARD_POSITION, POT_POSITION } from "./KitchenSet";
import { IngredientField } from "./IngredientField";

/**
 * Everything that needs rapier, in its own lazy chunk: the WASM physics engine is ~835 kB gzipped,
 * so it is only fetched once the user starts adding ingredients (see KitchenScene). The kitchen
 * set itself renders without it.
 */
export default function PhysicsLayer({
  maxBodies,
  reducedMotion,
}: {
  maxBodies: number;
  reducedMotion: boolean;
}) {
  return (
    <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
      <KitchenColliders />
      <IngredientField maxBodies={maxBodies} reducedMotion={reducedMotion} />
    </Physics>
  );
}

/** Static colliders matching the visual set in KitchenSet.tsx (world space, metres). */
function KitchenColliders() {
  const [px, py, pz] = POT_POSITION;
  const [bx, , bz] = BOARD_POSITION;
  return (
    <RigidBody type="fixed" colliders={false}>
      {/* counter slab, plus the backsplash and a low front lip that keep things on the counter */}
      <CuboidCollider args={[1.7, 0.03, 0.475]} position={[0, -0.03, 0]} friction={0.9} />
      <CuboidCollider args={[1.7, 0.6, 0.02]} position={[0, 0.6, -0.475]} />
      <CuboidCollider args={[1.7, 0.03, 0.02]} position={[0, 0.03, 0.49]} />
      {/* stove, pot, cutting board */}
      <CuboidCollider args={[0.31, 0.025, 0.21]} position={[px - 0.12, 0.025, pz]} />
      <CylinderCollider args={[0.09, 0.13]} position={[px, py + 0.09, pz]} />
      <CuboidCollider
        args={[0.23, 0.015, 0.15]}
        position={[bx, 0.015, bz]}
        rotation={[0, 0.12, 0]}
      />
      {/* salt jar, masala dabba, basil pot */}
      <CylinderCollider args={[0.065, 0.055]} position={[-0.42, 0.065, -0.33]} />
      <CylinderCollider args={[0.04, 0.1]} position={[0.42, 0.04, -0.3]} />
      <CylinderCollider args={[0.07, 0.08]} position={[-1.42, 0.07, -0.27]} />
    </RigidBody>
  );
}
