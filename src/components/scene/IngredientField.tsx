"use client";

import { RigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef, useState } from "react";
import { useKitchen, type KitchenIngredient } from "@/store/useKitchen";
import { useScene } from "@/store/useScene";
import * as THREE from "three";
import { lastSeen, rainDelays } from "./cookSignals";
import { mergeParts } from "./merge";
import { Ingredient3D } from "./Ingredient3D";
import { assignSlots, MAX_ON_COUNTER, poissonSlots, type Slot } from "./placement";
import { useIngredientModels } from "./ingredientModels";
import { markShadowsDirty } from "./shadowGate";
import { badgeTexture } from "./textures";

const SLOTS = poissonSlots();

type Leaving = {
  id: number;
  ingredient: KitchenIngredient;
  slot: Slot;
  from?: { x: number; y: number; z: number };
};

/** Maps the kitchen store to 3D ingredients. The scene subscribes; the UI never calls Three.js. */
export function IngredientField({
  maxBodies,
  reducedMotion,
}: {
  maxBodies: number;
  reducedMotion: boolean;
}) {
  const ingredients = useKitchen((s) => s.ingredients);
  const capacity = Math.min(MAX_ON_COUNTER, maxBodies);
  const slotsRef = useRef<Map<string, number>>(new Map());
  const prevRef = useRef<Map<string, { ingredient: KitchenIngredient; slot: Slot }>>(new Map());
  const [leaving, setLeaving] = useState<Leaving[]>([]);
  const leaveId = useRef(0);

  const assigned = useMemo(() => {
    const next = assignSlots(
      ingredients.map((i) => i.key),
      slotsRef.current,
      capacity,
    );
    slotsRef.current = next;
    return next;
  }, [ingredients, capacity]);

  // Anything that disappeared from the counter stays mounted until its puff-away finishes.
  useEffect(() => {
    const current = new Map<string, { ingredient: KitchenIngredient; slot: Slot }>();
    for (const ing of ingredients) {
      const slot = assigned.get(ing.key);
      if (slot !== undefined) current.set(ing.key, { ingredient: ing, slot: SLOTS[slot] });
    }
    // Puff away where the item was; items that are in the pot just disappear.
    const gone = [...prevRef.current]
      .filter(([key]) => !current.has(key))
      .map(([key, v]) => {
        const seen = lastSeen.get(key);
        lastSeen.delete(key);
        return { ...v, from: seen, inPot: seen?.inPot ?? false };
      })
      .filter((g) => !g.inPot);
    if (gone.length) {
      setLeaving((l) => [
        ...l,
        ...gone.map(({ ingredient, slot, from }) => ({
          id: ++leaveId.current,
          ingredient,
          slot,
          from: from && { x: from.x, y: from.y, z: from.z },
        })),
      ]);
    }
    prevRef.current = current;
    useScene.setState({ onCounter: current.size });
  }, [ingredients, assigned]);

  // Items new since the last commit, arriving together, rain down one by one. prevRef is only
  // updated after commit, so every render of the same batch sees the same delays.
  const delays = useMemo(
    () =>
      rainDelays(
        ingredients
          .filter((i) => assigned.has(i.key) && !prevRef.current.has(i.key))
          .map((i) => i.key),
      ),
    [ingredients, assigned],
  );

  const overflow = ingredients.length - assigned.size;
  // An ingredient with a real model waits (briefly) for it, so its collider is built from it.
  const modelFor = useIngredientModels(ingredients.map((i) => i.id));

  return (
    <>
      {ingredients.map((ing) => {
        const slot = assigned.get(ing.key);
        if (slot === undefined) return null;
        const model = modelFor(ing.id);
        if (model === undefined) return null; // still loading (at most ~1.5 s)
        return (
          <Ingredient3D
            key={ing.key}
            model={model}
            ingredient={ing}
            slot={SLOTS[slot]}
            leaving={false}
            dropDelay={delays.get(ing.key) ?? 0}
            reducedMotion={reducedMotion}
            onGone={() => {}}
          />
        );
      })}
      {leaving.map((l) => (
        <Ingredient3D
          key={`leaving-${l.id}`}
          ingredient={l.ingredient}
          model={modelFor(l.ingredient.id) ?? null}
          slot={l.slot}
          from={l.from}
          leaving
          reducedMotion={reducedMotion}
          onGone={() => setLeaving((all) => all.filter((x) => x.id !== l.id))}
        />
      ))}
      <Basket count={overflow} />
    </>
  );
}

/** Extras beyond the counter capacity go into a basket that fills up (docs/03 §1). */
function Basket({ count }: { count: number }) {
  const tex = useMemo(() => (count > 0 ? badgeTexture(`+${count}`) : null), [count]);
  const shown = count > 0;
  const fill = Math.min(6, count);
  // The produce peeking out of the basket is one merged, vertex-coloured mesh (one draw call).
  const produce = useMemo(
    () =>
      fill > 0
        ? mergeParts(
            Array.from({ length: fill }, (_, i) => ({
              geometry: new THREE.SphereGeometry(0.045, 12, 10),
              position: [Math.cos(i * 1.7) * 0.06, 0.1 + (i % 2) * 0.03, Math.sin(i * 1.7) * 0.06],
              color: ["#6FA35A", "#F2A03D", "#D9B77A", "#D98B6A", "#C0512E", "#9C3B2A"][i],
            })),
          )
        : null,
    [fill],
  );
  useEffect(() => () => produce?.dispose(), [produce]);
  useEffect(() => markShadowsDirty(), [shown]);
  if (!shown) return null;
  return (
    <group position={[0.62, 0, -0.26]}>
      <RigidBody type="fixed" colliders="hull">
        <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.15, 0.12, 0.12, 20, 1, true]} />
          <meshStandardMaterial color="#b98b55" roughness={0.9} side={2} />
        </mesh>
      </RigidBody>
      {produce && (
        <mesh geometry={produce}>
          <meshStandardMaterial vertexColors roughness={0.65} />
        </mesh>
      )}
      {tex && (
        <sprite position={[0, 0.24, 0]} scale={[0.12, 0.06, 1]}>
          <spriteMaterial map={tex} transparent depthWrite={false} />
        </sprite>
      )}
    </group>
  );
}
