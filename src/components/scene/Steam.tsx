"use client";

import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Steam (docs/03 §6.4): a stack of camera-facing soft sprites with scrolling noise, warm at the
 * base and fading to white. `steamSignal.density` goes 0.2 (idle) → 1.0 (thinking, Phase 3).
 */
export const steamSignal = { density: 0.2 };

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uDensity;
  uniform float uSeed;
  uniform float uFade;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 p = vUv - 0.5;
    // Curl-ish warp: offset sideways by a second noise field so wisps twist as they rise.
    float warp = fbm(vec2(vUv.y * 2.0 + uSeed, uTime * 0.12)) - 0.5;
    p.x += warp * 0.35 * vUv.y;
    float mask = smoothstep(0.5, 0.05, length(p * vec2(1.6, 1.0)));
    float n = fbm(vec2(p.x * 3.0 + uSeed, vUv.y * 2.5 - uTime * 0.35));
    float alpha = mask * smoothstep(0.35, 0.85, n) * uDensity * uFade;
    vec3 warm = vec3(1.0, 0.92, 0.82);
    vec3 col = mix(warm, vec3(1.0), vUv.y);
    gl_FragColor = vec4(col, alpha * 0.75);
  }
`;

function SteamSprite({
  index,
  count,
  origin,
}: {
  index: number;
  count: number;
  origin: THREE.Vector3;
}) {
  const group = useRef<THREE.Group>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uDensity: { value: steamSignal.density },
          uSeed: { value: index * 7.13 },
          uFade: { value: 0 },
        },
      }),
    [index],
  );

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const cycle = (t * 0.12 + index / count) % 1; // each sprite rises and recycles
    const g = group.current;
    if (!g) return;
    g.position.set(
      origin.x + Math.sin(t * 0.5 + index) * 0.02,
      origin.y + 0.08 + cycle * 0.55,
      origin.z,
    );
    g.scale.setScalar(0.22 + cycle * 0.35);
    material.uniforms.uTime.value = t;
    // Ease density towards the signal so Phase 3 transitions are smooth.
    const target = steamSignal.density;
    material.uniforms.uDensity.value +=
      (target - material.uniforms.uDensity.value) * Math.min(1, dt * 2);
    material.uniforms.uFade.value = Math.sin(cycle * Math.PI);
  });

  return (
    <group ref={group}>
      <Billboard>
        <mesh material={material} renderOrder={10}>
          <planeGeometry args={[1, 1.6]} />
        </mesh>
      </Billboard>
    </group>
  );
}

export function Steam({ count, origin }: { count: number; origin: [number, number, number] }) {
  const o = useMemo(() => new THREE.Vector3(...origin), [origin]);
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <SteamSprite key={i} index={i} count={count} origin={o} />
      ))}
    </>
  );
}
