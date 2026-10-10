"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Recipe } from "@/lib/ai/schema";
import { useKitchen } from "@/store/useKitchen";
import { useScene } from "@/store/useScene";
import { CARD_H, CARD_W, cardTexture, type CardFace } from "./cardTexture";
import { cardFan, cook } from "./cookSignals";

const CARD_WIDTH = 0.21; // metres
const RISE_DELAY = 0.25;
const RISE_STAGGER = 0.18;
const RISE_SECONDS = 0.9;
const FLY_SECONDS = 0.6;
/** Once every card has fanned out, hand over to the DOM results panel. */
export const REVEAL_SECONDS = RISE_DELAY + 2 * RISE_STAGGER + RISE_SECONDS + 0.2;

const geometry = new THREE.PlaneGeometry(CARD_WIDTH, (CARD_WIDTH * CARD_H) / CARD_W);
const placeholder = new THREE.DataTexture(new Uint8Array([255, 246, 235, 255]), 1, 1);
placeholder.colorSpace = THREE.SRGBColorSpace;
placeholder.needsUpdate = true;
const easeOut = (u: number) => 1 - (1 - u) ** 3;

/** Card faces in the page language (the same strings as the DOM cards). */
function useFaces(results: Recipe[]): CardFace[] {
  const t = useTranslations("Results");
  const tr = useTranslations("Recipe");
  return results.map((r) => ({
    badgeKind: r.kind,
    badge:
      r.kind === "almost_there"
        ? t("kinds.almost_there", {
            count: r.ingredients.filter((i) => i.status === "missing").length,
          })
        : t(`kinds.${r.kind}`),
    title: r.title,
    tagline: r.tagline,
    meta: `${t("minutes", { count: r.prep_minutes + r.cook_minutes })}  ·  ${tr(`difficulties.${r.difficulty}`)}`,
  }));
}

/**
 * Recipe cards rising out of the steam (docs/03 §6.3 step 5–6): R3F planes with a painted text
 * texture (cheap, no DOM in the canvas). They fan out above the pot, then the DOM panel takes over;
 * selecting a recipe flies its card toward the camera while the others sink back into the steam.
 * The canvas is aria-hidden: the same recipes are always in the DOM.
 */
export function RecipeCards3D() {
  const phase = useKitchen((s) => s.phase);
  const results = useKitchen((s) => s.results);
  const selectedId = useKitchen((s) => s.selectedId);
  const faces = useFaces(results);
  const camera = useThree((s) => s.camera);

  const textures = useMemo(
    () => faces.map((f) => cardTexture(f)),
    // Repaint only when the recipes (or their language) change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, faces.map((f) => f.badge + f.meta).join("|")],
  );
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);

  // The store plays the 3D reveal only while these cards are mounted.
  useEffect(() => {
    useScene.getState().setReveal3d(true);
    return () => useScene.getState().setReveal3d(false);
  }, []);

  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const timeline = useRef({ shownAt: -1, flyAt: -1, revealDone: false, phase: "" });
  const tmp = useMemo(
    () => ({ fly: new THREE.Vector3(), fwd: new THREE.Vector3(), q: new THREE.Quaternion() }),
    [],
  );
  const fan = useMemo(() => cardFan(results.length), [results.length]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const tl = timeline.current;
    const showing = phase === "revealing" || phase === "results";
    if (tl.phase !== phase) {
      // Rise on reveal, and again when coming back from a recipe; fly when one is chosen.
      if (showing && (tl.phase === "" || !["revealing", "results"].includes(tl.phase))) {
        tl.shownAt = t;
        tl.revealDone = false;
      }
      if (phase === "recipe") tl.flyAt = t;
      tl.phase = phase;
    }
    if (phase === "revealing" && !tl.revealDone && t - tl.shownAt > REVEAL_SECONDS) {
      tl.revealDone = true;
      useKitchen.getState().finishReveal();
    }

    meshes.current.forEach((mesh, i) => {
      if (!mesh) return;
      const material = mesh.material as THREE.MeshBasicMaterial;
      const [dx, y, dz, roll] = fan[i] ?? [0, 0.45, 0, 0];
      let rise = 0; // 0 = down in the pot, 1 = fanned out
      let opacity = 0;
      let flying = 0;
      if (showing && tl.shownAt >= 0) {
        const u = Math.min(
          1,
          Math.max(0, (t - tl.shownAt - RISE_DELAY - i * RISE_STAGGER) / RISE_SECONDS),
        );
        rise = easeOut(u);
        opacity = Math.min(1, u * 2.2);
      } else if (phase === "recipe" && tl.flyAt >= 0) {
        const u = Math.min(1, (t - tl.flyAt) / FLY_SECONDS);
        if (results[i]?.id === selectedId) {
          flying = easeOut(u);
          rise = 1;
          opacity = 1 - Math.max(0, (u - 0.45) / 0.55); // fly at the camera, then hand over to the DOM
        } else {
          rise = 1 - easeOut(u); // the others sink back into the steam
          opacity = 1 - u;
        }
      }
      mesh.visible = opacity > 0.01;
      if (!mesh.visible) return;
      material.opacity = opacity;

      const bob = showing ? Math.sin(t * 1.4 + i * 1.7) * 0.006 * rise : 0;
      mesh.position.set(
        cook.target.x + dx * rise,
        cook.target.y + 0.02 + (y - 0.02) * rise + bob,
        cook.target.z + dz * rise,
      );
      if (flying > 0) {
        // toward a point just in front of the camera
        camera.getWorldDirection(tmp.fwd);
        tmp.fly.copy(camera.position).addScaledVector(tmp.fwd, 0.45);
        mesh.position.lerp(tmp.fly, flying);
      }
      // Face the camera, fanned with a slight roll; scale up from the steam.
      mesh.quaternion.copy(camera.quaternion);
      mesh.rotateZ(roll * rise * (1 - flying));
      mesh.scale.setScalar(0.55 + 0.45 * rise);
    });
  });

  return (
    <>
      {/* Never drawn: lets the scene warm-up compile the card shader before any results exist. */}
      <mesh geometry={geometry} visible={false}>
        <meshBasicMaterial map={placeholder} transparent toneMapped={false} alphaTest={0.5} />
      </mesh>
      {results.map((recipe, i) => (
        <mesh
          key={recipe.id}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          geometry={geometry}
          visible={false}
          renderOrder={11}
          onClick={(e) => {
            e.stopPropagation();
            if (useKitchen.getState().phase === "results") useKitchen.getState().select(recipe.id);
          }}
          onPointerOver={() => (document.body.style.cursor = "pointer")}
          onPointerOut={() => (document.body.style.cursor = "")}
        >
          <meshBasicMaterial
            map={textures[i]}
            transparent
            opacity={0}
            toneMapped={false}
            // Cards write depth so depth of field keeps them sharp (otherwise they take the wall's
            // depth behind them and blur with it); the cutoff trims the rounded corners.
            alphaTest={0.5}
          />
        </mesh>
      ))}
    </>
  );
}
