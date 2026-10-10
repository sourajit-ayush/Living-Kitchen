"use client";

import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  INTRO_SECONDS,
  PARALLAX_DEG,
  SHOT_SECONDS,
  SHOTS,
  swayAngles,
  type Layout,
  type Pose,
  type ShotName,
} from "./cameraShots";
import { markMoving } from "./shadowGate";

type Base = { px: number; py: number; pz: number; tx: number; ty: number; tz: number; fov: number };

const toBase = (p: Pose): Base => ({
  px: p.position[0],
  py: p.position[1],
  pz: p.position[2],
  tx: p.target[0],
  ty: p.target[1],
  tz: p.target[2],
  fov: p.fov,
});

/**
 * GSAP tweens a base pose between shots; every frame adds idle sway and pointer parallax on top
 * (both off for reduced motion and touch). The UI never moves the camera directly.
 */
export function CameraRig({
  shot,
  layout,
  reducedMotion,
}: {
  shot: ShotName;
  layout: Layout;
  reducedMotion: boolean;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const base = useRef<Base>(toBase(SHOTS[reducedMotion ? "counter" : "intro"][layout]));
  const started = useRef(false);
  const pointer = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
  const tmp = useRef({
    offset: new THREE.Vector3(),
    target: new THREE.Vector3(),
    right: new THREE.Vector3(),
  });

  useEffect(() => {
    const goal = toBase(SHOTS[shot][layout]);
    gsap.killTweensOf(base.current);
    if (reducedMotion) {
      Object.assign(base.current, goal);
    } else if (!started.current) {
      gsap.to(base.current, { ...goal, duration: INTRO_SECONDS, ease: "power2.inOut" });
    } else {
      gsap.to(base.current, { ...goal, duration: SHOT_SECONDS, ease: "power3.inOut" });
    }
    started.current = true;
  }, [shot, layout, reducedMotion]);

  useEffect(() => () => void gsap.killTweensOf(base.current), []);

  useEffect(() => {
    if (reducedMotion || !window.matchMedia("(pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reducedMotion]);

  useFrame(({ clock }, dt) => {
    const b = base.current;
    if (gsap.isTweening(b)) markMoving();
    const { offset, target, right } = tmp.current;
    target.set(b.tx, b.ty, b.tz);
    offset.set(b.px - b.tx, b.py - b.ty, b.pz - b.tz);

    if (!reducedMotion) {
      const p = pointer.current;
      const k = Math.min(1, dt * 3);
      p.sx += (p.x - p.sx) * k;
      p.sy += (p.y - p.sy) * k;
      const sway = swayAngles(clock.elapsedTime);
      const deg = Math.PI / 180;
      const yaw = sway.yaw - p.sx * PARALLAX_DEG * deg;
      const pitch = sway.pitch + p.sy * PARALLAX_DEG * 0.5 * deg;
      offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      right.crossVectors(THREE.Object3D.DEFAULT_UP, offset).normalize();
      offset.applyAxisAngle(right, pitch);
    }

    camera.position.copy(target).add(offset);
    camera.lookAt(target);
    if (Math.abs(camera.fov - b.fov) > 1e-3) {
      camera.fov = b.fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
