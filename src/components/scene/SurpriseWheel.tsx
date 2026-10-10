"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { angleAt, PLATES, STEP } from "@/lib/wheel";
import { useScene } from "@/store/useScene";
import { useSurprise } from "@/store/useSurprise";
import { mergeParts, type Part } from "./merge";
import { markShadowsDirty } from "./shadowGate";

/** On the counter, in front of the drop zone; the stand lifts it clear of the ingredients. */
export const WHEEL_POSITION: [number, number, number] = [0.05, 0, 0.28];
const STAND_H = 0.19;
const DISC_R = 0.26;
const DISC_H = 0.022;
const PLATE_RING = 0.175;
const PLATE_R = 0.062;
const PLATE_TOP = DISC_H + 0.013;
const EMOJI_SIZE = 0.085;
/** Hidden under the counter top when idle. */
const SUNK = -(STAND_H + DISC_H + 0.04);
const RISE_S = 0.6;
const FLOAT_S = 0.7;
const CELL = 128;

const easeOutBack = (u: number) => 1 + 2.4 * (u - 1) ** 3 + 1.4 * (u - 1) ** 2;
const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

/** All eight emoji in one strip, so every plate's dish draws in a single call. */
function emojiAtlas(emojis: string[]): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CELL * PLATES;
  canvas.height = CELL;
  const c = canvas.getContext("2d")!;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `${CELL * 0.78}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;
  emojis.forEach((e, i) => c.fillText(e, i * CELL + CELL / 2, CELL / 2 + 6));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A flat quad lying on a plate, showing atlas cell `cell`, its top edge toward the centre. */
function emojiQuad(cell: number, angle: number, radius: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(EMOJI_SIZE, EMOJI_SIZE);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / PLATES);
  g.rotateX(-Math.PI / 2);
  g.rotateY(angle);
  g.translate(Math.sin(angle) * radius, PLATE_TOP + 0.002, Math.cos(angle) * radius);
  return g;
}

function plateParts(angle: number, radius: number): Part[] {
  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;
  return [
    {
      geometry: new THREE.CylinderGeometry(PLATE_R, PLATE_R * 0.78, 0.012, 24),
      position: [x, DISC_H + 0.006, z],
      color: "#f7f0e4",
    },
    {
      geometry: new THREE.CylinderGeometry(PLATE_R * 0.7, PLATE_R * 0.7, 0.0125, 24),
      position: [x, DISC_H + 0.0065, z],
      color: "#efe3cf",
    },
  ];
}

/**
 * Surprise Me lazy-susan (docs/03 §6.6): rises from the counter with eight mini plates, spins with
 * a long deceleration (the same plan the DOM list follows), and the chosen plate floats up.
 * Draw calls while shown: stand, disc + plates, the emoji strip, and the chosen plate (2).
 */
export function SurpriseWheel({ reducedMotion }: { reducedMotion: boolean }) {
  const ideas = useSurprise((s) => s.ideas);
  const target = useSurprise((s) => s.target);
  const root = useRef<THREE.Group>(null);
  const spinner = useRef<THREE.Group>(null);
  const chosen = useRef<THREE.Group>(null);
  const motion = useRef({ rise: 0, float: 0, theta: 0 });

  const stand = useMemo(
    () =>
      mergeParts([
        {
          geometry: new THREE.CylinderGeometry(0.075, 0.09, 0.016, 28),
          position: [0, 0.008, 0],
          color: "#7a5236",
        },
        {
          geometry: new THREE.CylinderGeometry(0.02, 0.026, STAND_H, 16),
          position: [0, STAND_H / 2, 0],
          color: "#8a5f3f",
        },
        // The saffron pointer at the front: the plate under it is the pick.
        {
          geometry: new THREE.ConeGeometry(0.02, 0.05, 16),
          position: [0, STAND_H + DISC_H + 0.03, DISC_R + 0.03],
          rotation: [-Math.PI / 2, 0, 0],
          color: "#f4b23e",
        },
      ]),
    [],
  );
  useEffect(() => () => stand.dispose(), [stand]);

  const ready = ideas.length === PLATES;
  // Mounted (hidden) from the start with placeholder plates, so the start-up warm-up compiles its
  // shaders and the first spin can't stall on a shader compile.
  const atlas = useMemo(
    () => emojiAtlas(ready ? ideas.map((i) => i.emoji) : Array(PLATES).fill("🍽️")),
    [ideas, ready],
  );
  useEffect(() => () => atlas.dispose(), [atlas]);

  // Everything that turns, except the chosen plate (it is drawn separately so it can float up).
  const { disc, emojis, chosenPlate, chosenEmoji } = useMemo(() => {
    const others = Array.from({ length: PLATES }, (_, i) => i).filter((i) => i !== target);
    return {
      disc: mergeParts([
        {
          geometry: new THREE.CylinderGeometry(DISC_R, DISC_R * 0.97, DISC_H, 48),
          position: [0, DISC_H / 2, 0],
          color: "#b07a4f",
        },
        {
          geometry: new THREE.TorusGeometry(DISC_R - 0.004, 0.006, 8, 64),
          position: [0, DISC_H, 0],
          rotation: [Math.PI / 2, 0, 0],
          color: "#94643f",
        },
        ...others.flatMap((i) => plateParts(i * STEP, PLATE_RING)),
      ]),
      emojis: mergeParts(
        others.map((i) => ({
          geometry: emojiQuad(i, i * STEP, PLATE_RING),
          color: "#ffffff",
        })),
      ),
      chosenPlate: mergeParts(plateParts(0, 0)),
      chosenEmoji: emojiQuad(target, 0, 0),
    };
  }, [target]);
  useEffect(
    () => () => {
      disc.dispose();
      emojis.dispose();
      chosenPlate.dispose();
      chosenEmoji.dispose();
    },
    [disc, emojis, chosenPlate, chosenEmoji],
  );

  useFrame((_, delta) => {
    const g = root.current;
    const s = spinner.current;
    const c = chosen.current;
    if (!g || !s || !c) return;
    const m = motion.current;
    const { status: st, plan, startedAt } = useSurprise.getState();
    const active = ready && (st === "spinning" || st === "landed");
    const dt = Math.min(delta, 0.05);
    const prev = { rise: m.rise, float: m.float, theta: m.theta };

    m.rise = reducedMotion
      ? Number(active)
      : THREE.MathUtils.clamp(m.rise + (active ? dt : -dt) / RISE_S, 0, 1);
    const floatWanted = st === "landed";
    m.float = reducedMotion
      ? Number(floatWanted)
      : THREE.MathUtils.clamp(m.float + (floatWanted ? dt : -dt * 2) / FLOAT_S, 0, 1);
    if (active && plan) m.theta = angleAt(plan, performance.now() - startedAt);

    const wheel = m.rise >= 1 ? "up" : m.rise <= 0 ? "down" : "moving";
    if (useScene.getState().wheel !== wheel) useScene.setState({ wheel });

    g.visible = m.rise > 0.001;
    if (!g.visible) return;
    const rise = active ? easeOutBack(m.rise) : easeInOut(m.rise);
    g.position.y = SUNK * (1 - rise);
    s.rotation.y = m.theta;

    // The chosen plate rides the wheel, then lifts and tilts toward the cook.
    const angle = target * STEP + m.theta;
    const f = easeInOut(m.float);
    const bob = f > 0.99 && !reducedMotion ? Math.sin(performance.now() / 380) * 0.008 : 0;
    c.position.set(
      Math.sin(angle) * PLATE_RING * (1 - f * 0.15),
      STAND_H + f * 0.2 + bob,
      Math.cos(angle) * PLATE_RING * (1 - f * 0.15),
    );
    c.rotation.set(f * 0.75, angle, 0, "YXZ");
    c.scale.setScalar(1 + f * 0.35);

    if (prev.rise !== m.rise || prev.float !== m.float || prev.theta !== m.theta || bob) {
      markShadowsDirty();
    }
  });

  return (
    <group ref={root} position={WHEEL_POSITION} visible={false}>
      <mesh geometry={stand} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.7} />
      </mesh>
      <group ref={spinner} position={[0, STAND_H, 0]}>
        <mesh geometry={disc} castShadow receiveShadow>
          <meshStandardMaterial vertexColors roughness={0.6} />
        </mesh>
        <mesh geometry={emojis}>
          <meshBasicMaterial
            map={atlas}
            transparent
            alphaTest={0.05}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
      <group ref={chosen}>
        <mesh geometry={chosenPlate} castShadow>
          <meshStandardMaterial vertexColors roughness={0.5} />
        </mesh>
        <mesh geometry={chosenEmoji}>
          <meshBasicMaterial
            map={atlas}
            transparent
            alphaTest={0.05}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}
