import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** A primitive placed in world space with a flat colour, to be baked into a merged mesh. */
export type Part = {
  geometry: THREE.BufferGeometry;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  color: string;
};

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

/**
 * Bake many static primitives into ONE geometry with vertex colours (docs/03 §1: "props are static
 * and baked into one merged mesh"). Each part costs nothing extra per frame: one draw call total,
 * plus one in the shadow pass.
 */
export function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const baked = parts.map(
    ({ geometry, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], color }) => {
      // Mixed primitive types: normalise to non-indexed with position/normal/uv only.
      let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      for (const name of Object.keys(g.attributes)) {
        if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
      }
      g.clearGroups();
      tmpMatrix.compose(
        new THREE.Vector3(...position),
        tmpQuat.setFromEuler(tmpEuler.set(...rotation)),
        new THREE.Vector3(...scale),
      );
      g.applyMatrix4(tmpMatrix);
      const c = new THREE.Color(color);
      const colors = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = c.r;
        colors[i + 1] = c.g;
        colors[i + 2] = c.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      if (g === geometry) g = g.clone();
      return g;
    },
  );
  const merged = mergeGeometries(baked);
  baked.forEach((g) => g.dispose());
  if (!merged) throw new Error("mergeParts: incompatible geometries");
  return merged;
}
