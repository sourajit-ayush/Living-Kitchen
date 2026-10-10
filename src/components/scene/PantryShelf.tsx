"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CATEGORY_COLORS } from "@/data/ingredients";
import { expiringSoon, PANTRY_GROUPS } from "@/lib/pantry";
import { live } from "@/lib/sync/rows";
import { pantryEmoji, usePantry, type PantryItem } from "@/store/usePantry";
import { registerLabel, unregisterLabel } from "./LabelLayer";
import { mergeParts } from "./merge";
import { markShadowsDirty } from "./shadowGate";

/** Low on the backsplash, between the window and the ladle: in view of the counter camera too. */
const SHELF_X = -0.03;
const SHELF_Z = -0.4;
const SHELF_W = 0.66;
const SHELF_DEPTH = 0.13;
const ROWS = [0.18, 0.35];
const PER_ROW = 6;
export const SHELF_CAPACITY = ROWS.length * PER_ROW;
const JAR_R = 0.034;
const JAR_H = 0.09;
const LID = new THREE.Color("#8B6A4F");
const LID_SOON = new THREE.Color("#F4B23E");

/** Up to 12 jars, grouped like the pantry page (spices first), so the shelf reads tidy. */
function shelfItems(items: PantryItem[]): PantryItem[] {
  return [...live(items)]
    .sort(
      (a, b) =>
        PANTRY_GROUPS.indexOf(a.category) - PANTRY_GROUPS.indexOf(b.category) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, SHELF_CAPACITY);
}

function slot(i: number): THREE.Vector3 {
  const row = Math.floor(i / PER_ROW);
  const col = i % PER_ROW;
  const step = (SHELF_W - 0.06) / PER_ROW;
  return new THREE.Vector3(
    SHELF_X - SHELF_W / 2 + 0.03 + step * (col + 0.5),
    ROWS[row] + 0.012 + JAR_H / 2,
    SHELF_Z,
  );
}

/**
 * My Pantry on a 3D shelf (R1): pantry staples sit in jars on a wall shelf behind the counter,
 * never on the counter itself. Jars and lids are instanced (2 draw calls) and the plank and
 * brackets are one merged mesh; emoji labels go through the shared LabelLayer. A lid turns
 * saffron when the item expires within two days (R4).
 */
export function PantryShelf({ visible }: { visible: boolean }) {
  const items = usePantry((s) => s.items);
  const shown = useMemo(() => shelfItems(items), [items]);
  const soon = useMemo(() => new Set(expiringSoon(shown).map((i) => i.key)), [shown]);
  const jars = useRef<THREE.InstancedMesh>(null);
  const lids = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const fade = useRef(0);

  const shelf = useMemo(
    () =>
      mergeParts([
        ...ROWS.map((y) => ({
          geometry: new THREE.BoxGeometry(SHELF_W, 0.024, SHELF_DEPTH),
          position: [SHELF_X, y, SHELF_Z + 0.005] as [number, number, number],
          color: "#9a6b45",
        })),
        ...ROWS.flatMap((y) =>
          [-1, 1].map((side) => ({
            geometry: new THREE.BoxGeometry(0.02, 0.07, 0.1),
            position: [SHELF_X + side * (SHELF_W / 2 - 0.05), y - 0.045, SHELF_Z - 0.01] as [
              number,
              number,
              number,
            ],
            color: "#6e4a30",
          })),
        ),
      ]),
    [],
  );
  useEffect(() => () => shelf.dispose(), [shelf]);
  const jarGeo = useMemo(() => new THREE.CylinderGeometry(JAR_R, JAR_R, JAR_H, 18), []);
  const lidGeo = useMemo(
    () => new THREE.CylinderGeometry(JAR_R * 1.06, JAR_R * 1.06, 0.018, 18),
    [],
  );
  useEffect(
    () => () => {
      jarGeo.dispose();
      lidGeo.dispose();
    },
    [jarGeo, lidGeo],
  );

  // Per-instance colours exist from the first frame, so the start-up warm-up compiles the
  // instanced-colour shader instead of the first visit to the pantry stalling on it.
  useLayoutEffect(() => {
    for (const mesh of [jars.current, lids.current]) {
      if (mesh && !mesh.instanceColor) mesh.setColorAt(0, LID);
    }
  }, []);

  // Instance transforms and colours follow the pantry.
  useEffect(() => {
    const j = jars.current;
    const l = lids.current;
    if (!j || !l) return;
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    shown.forEach((item, i) => {
      const p = slot(i);
      m.makeTranslation(p.x, p.y, p.z);
      j.setMatrixAt(i, m);
      color.set(CATEGORY_COLORS[item.category]);
      j.setColorAt(i, color);
      m.makeTranslation(p.x, p.y + JAR_H / 2 + 0.008, p.z);
      l.setMatrixAt(i, m);
      l.setColorAt(i, soon.has(item.key) ? LID_SOON : LID);
    });
    j.count = l.count = shown.length;
    j.instanceMatrix.needsUpdate = l.instanceMatrix.needsUpdate = true;
    if (j.instanceColor) j.instanceColor.needsUpdate = true;
    if (l.instanceColor) l.instanceColor.needsUpdate = true;
    markShadowsDirty();
  }, [shown, soon]);

  // Emoji labels in front of each jar (the shared one-draw-call label layer).
  const labelRefs = useRef<ReturnType<typeof registerLabel>[]>([]);
  useEffect(() => {
    labelRefs.current = shown.map((item) => registerLabel(pantryEmoji(item)));
    return () => labelRefs.current.forEach(({ id }) => unregisterLabel(id));
  }, [shown]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const target = visible && shown.length > 0 ? 1 : 0;
    const before = fade.current;
    fade.current = THREE.MathUtils.clamp(before + (target ? delta : -delta) * 3, 0, 1);
    g.visible = fade.current > 0.001;
    const s = fade.current;
    labelRefs.current.forEach(({ label }, i) => {
      const p = slot(i);
      label.position.set(p.x, p.y, p.z + JAR_R + 0.012);
      label.scale = g.visible ? 0.048 * s : 0;
    });
    if (before !== fade.current) markShadowsDirty();
  });

  return (
    <group ref={group} visible={false}>
      <mesh geometry={shelf} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.75} />
      </mesh>
      <instancedMesh
        ref={jars}
        args={[jarGeo, undefined, SHELF_CAPACITY]}
        castShadow
        frustumCulled={false}
      >
        <meshStandardMaterial roughness={0.35} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={lids} args={[lidGeo, undefined, SHELF_CAPACITY]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
    </group>
  );
}
