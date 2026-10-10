"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { INGREDIENT_MODELS, modelUrl } from "@/data/ingredientModels";

/**
 * Real ingredient models (Kenney Food Kit, CC0): loaded once per ingredient id, normalised to
 * the counter (longest side = INGREDIENT_MODELS[id].size, centred like the clay blobs so the
 * resting centre sits at y = halfHeight) and cached. Any failure resolves to null: the ingredient
 * simply keeps its clay blob (project rule 7 in the README).
 */
export type LoadedModel = { geometry: THREE.BufferGeometry; halfHeight: number };

const cache = new Map<string, Promise<LoadedModel | null>>();
const settled = new Map<string, LoadedModel | null>();
let loader: GLTFLoader | null = null;

/** The palette every model shares (one 10 kB texture, one GPU upload). */
export const palette: { texture: THREE.Texture | null } = { texture: null };

export function loadIngredientModel(id: string | null): Promise<LoadedModel | null> {
  const url = id ? modelUrl(id) : null;
  if (!id || !url) return Promise.resolve(null);
  let pending = cache.get(id);
  if (!pending) {
    loader ??= new GLTFLoader();
    pending = loader
      .loadAsync(url)
      .then((gltf) => {
        gltf.scene.updateMatrixWorld(true);
        let mesh: THREE.Mesh | null = null;
        gltf.scene.traverse((o) => {
          if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
        });
        if (!mesh) return null;
        const source = mesh as THREE.Mesh;
        const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
        geometry.computeBoundingBox();
        const box = geometry.boundingBox!;
        const dims = box.getSize(new THREE.Vector3());
        const scale = INGREDIENT_MODELS[id].size / Math.max(dims.x, dims.y, dims.z, 1e-6);
        const centre = box.getCenter(new THREE.Vector3());
        geometry.translate(-centre.x, -centre.y, -centre.z).scale(scale, scale, scale);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        // Every model ships the same palette: keep the first, release the others' copies.
        const material = source.material as THREE.MeshStandardMaterial;
        const map = material.map;
        if (map && !palette.texture) {
          map.colorSpace = THREE.SRGBColorSpace;
          palette.texture = map;
        } else map?.dispose();
        if (map !== palette.texture) material.dispose();
        return { geometry, halfHeight: (dims.y * scale) / 2 };
      })
      .catch(() => null)
      .then((model) => {
        settled.set(id, model);
        return model;
      });
    cache.set(id, pending);
  }
  return pending;
}

/** How long an ingredient waits for its model before dropping as a clay blob. */
const MODEL_WAIT_MS = 1500;

/**
 * Model status per ingredient id: undefined while loading (hold the drop), a model, or null
 * (no model, failed, or too slow: use the clay blob).
 */
export function useIngredientModels(ids: (string | null)[]) {
  const [, rerender] = useState(0);
  const key = ids.filter(Boolean).sort().join("|");
  useEffect(() => {
    let live = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const id of key ? key.split("|") : []) {
      if (settled.has(id) || !modelUrl(id)) continue;
      void loadIngredientModel(id).then(() => live && rerender((n) => n + 1));
      timers.push(
        setTimeout(() => {
          if (!live || settled.has(id)) return;
          settled.set(id, null); // too slow this time: drop the clay blob
          rerender((n) => n + 1);
        }, MODEL_WAIT_MS),
      );
    }
    return () => {
      live = false;
      timers.forEach(clearTimeout);
    };
  }, [key]);
  return (id: string | null): LoadedModel | null | undefined => {
    if (!id || !modelUrl(id)) return null;
    return settled.has(id) ? settled.get(id)! : undefined;
  };
}
