"use client";

import { createPortal, useThree } from "@react-three/fiber";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useState } from "react";
import * as THREE from "three";

let pendingBake: ((gl: THREE.WebGLRenderer) => Promise<void>) | null = null;

/** Render the environment cube once; called by the scene warm-up (sceneWarmup.ts). */
export async function bakeEnvironment(gl: THREE.WebGLRenderer) {
  await pendingBake?.(gl);
}

/**
 * A procedural environment map (children are Lightformers), like drei's <Environment frames={1}>
 * but baked when the warm-up says so. drei renders the cube in a mount effect, before any shader is
 * ready, which froze the main thread for ~160 ms compiling synchronously. Here the light-panel
 * shaders compile in the background first, then the cube is rendered once.
 */
export function BakedEnvironment({
  resolution,
  intensity,
  children,
}: {
  resolution: number;
  intensity: number;
  children: ReactNode;
}) {
  const scene = useThree((s) => s.scene);
  const [virtualScene] = useState(() => new THREE.Scene());
  const { fbo, cubeCamera } = useMemo(() => {
    const target = new THREE.WebGLCubeRenderTarget(resolution);
    target.texture.type = THREE.HalfFloatType;
    return { fbo: target, cubeCamera: new THREE.CubeCamera(1, 1000, target) };
  }, [resolution]);
  useEffect(() => () => fbo.dispose(), [fbo]);

  useLayoutEffect(() => {
    const previous = { env: scene.environment, intensity: scene.environmentIntensity };
    scene.environment = fbo.texture;
    scene.environmentIntensity = intensity;
    pendingBake = async (gl) => {
      await gl.compileAsync(virtualScene, cubeCamera.children[0] as THREE.Camera).catch(() => {});
      const autoClear = gl.autoClear;
      gl.autoClear = true;
      cubeCamera.update(gl, virtualScene); // also flags the texture for PMREM conversion
      gl.autoClear = autoClear;
    };
    return () => {
      scene.environment = previous.env;
      scene.environmentIntensity = previous.intensity;
      pendingBake = null;
    };
  }, [scene, fbo, cubeCamera, virtualScene, intensity]);

  return createPortal(children, virtualScene);
}
