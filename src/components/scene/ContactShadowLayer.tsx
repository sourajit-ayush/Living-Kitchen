"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { HorizontalBlurShader } from "three/examples/jsm/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/examples/jsm/shaders/VerticalBlurShader.js";
import { shadowFrame } from "./shadowGate";

/** Only meshes on this layer (shadow casters, tagged each pass) draw into the contact shadow. */
const CONTACT_LAYER = 7;

let pendingWarm: ((gl: THREE.WebGLRenderer) => Promise<void>) | null = null;

/** Compile the contact-shadow shaders off the main thread; called by sceneWarmup.ts. */
export async function warmContactShadows(gl: THREE.WebGLRenderer) {
  await pendingWarm?.(gl);
}

/**
 * Soft contact shadows under the counter items, adapted from drei's <ContactShadows> (MIT) with
 * two changes for a jank-free start: only shadow-casting meshes are drawn (so a single depth-shader
 * variant exists, which the warm-up pre-compiles instead of compiling mid-frame), and it renders
 * only on the frames shadowGate.ts schedules for it.
 */
export function ContactShadowLayer({
  position,
  scale: [width, height],
  far,
  blur,
  opacity,
  resolution,
  color,
}: {
  position: [number, number, number];
  scale: [number, number];
  far: number;
  blur: number;
  opacity: number;
  resolution: number;
  color: string;
}) {
  const scene = useThree((s) => s.scene);
  const group = useRef<THREE.Group>(null);
  const shadowCamera = useRef<THREE.OrthographicCamera>(null);

  const parts = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(resolution, resolution);
    const targetBlur = new THREE.WebGLRenderTarget(resolution, resolution);
    target.texture.generateMipmaps = targetBlur.texture.generateMipmaps = false;
    const plane = new THREE.PlaneGeometry(width, height).rotateX(Math.PI / 2);
    const blurPlane = new THREE.Mesh(plane);
    const depth = new THREE.MeshDepthMaterial();
    depth.depthTest = depth.depthWrite = false;
    depth.onBeforeCompile = (shader) => {
      shader.uniforms.ucolor = { value: new THREE.Color(color) };
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", "uniform vec3 ucolor;\nvoid main() {")
        // colourise, and fade with height so the contact point stays darkest
        .replace(
          "vec4( vec3( 1.0 - fragCoordZ ), opacity );",
          "vec4( ucolor * fragCoordZ * 2.0, ( 1.0 - fragCoordZ ) * 1.0 );",
        );
    };
    const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader);
    const vBlur = new THREE.ShaderMaterial(VerticalBlurShader);
    hBlur.depthTest = vBlur.depthTest = false;
    return { target, targetBlur, plane, blurPlane, depth, hBlur, vBlur };
  }, [resolution, width, height, color]);

  useEffect(
    () => () => {
      const { target, targetBlur, plane, depth, hBlur, vBlur } = parts;
      [target, targetBlur, plane, depth, hBlur, vBlur].forEach((d) => d.dispose());
    },
    [parts],
  );

  useLayoutEffect(() => {
    shadowCamera.current?.layers.set(CONTACT_LAYER);
    pendingWarm = async (gl) => {
      const cam = shadowCamera.current;
      if (!cam) return;
      const warm = new THREE.Scene();
      warm.add(new THREE.Mesh(parts.plane, parts.depth));
      warm.add(new THREE.Mesh(parts.plane, parts.hBlur), new THREE.Mesh(parts.plane, parts.vBlur));
      const previous = gl.getRenderTarget();
      gl.setRenderTarget(parts.target); // same program keys as the real (off-screen) passes
      const compiled = gl.compileAsync(warm, cam);
      gl.setRenderTarget(previous);
      await compiled.catch(() => undefined);
    };
    return () => {
      pendingWarm = null;
    };
  }, [parts]);

  useFrame(({ gl }) => {
    const cam = shadowCamera.current;
    const root = group.current;
    if (!cam || !root || !shadowFrame.contact) return;

    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.castShadow && !(o as THREE.InstancedMesh).isInstancedMesh) {
        o.layers.enable(CONTACT_LAYER);
      }
    });
    const { target, targetBlur, blurPlane, depth, hBlur, vBlur } = parts;
    const background = scene.background;
    root.visible = false;
    scene.background = null;
    scene.overrideMaterial = depth;
    gl.setRenderTarget(target);
    gl.render(scene, cam);
    scene.overrideMaterial = null;

    const blurPass = (amount: number) => {
      blurPlane.visible = true;
      blurPlane.material = hBlur;
      hBlur.uniforms.tDiffuse.value = target.texture;
      hBlur.uniforms.h.value = amount / 256;
      gl.setRenderTarget(targetBlur);
      gl.render(blurPlane, cam);
      blurPlane.material = vBlur;
      vBlur.uniforms.tDiffuse.value = targetBlur.texture;
      vBlur.uniforms.v.value = amount / 256;
      gl.setRenderTarget(target);
      gl.render(blurPlane, cam);
      blurPlane.visible = false;
    };
    blurPass(blur);
    blurPass(blur * 0.4);

    gl.setRenderTarget(null);
    root.visible = true;
    scene.background = background;
  });

  return (
    <group ref={group} position={position} rotation-x={Math.PI / 2}>
      <mesh geometry={parts.plane} scale={[1, -1, 1]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial
          transparent
          map={parts.target.texture}
          opacity={opacity}
          depthWrite={false}
        />
      </mesh>
      <orthographicCamera
        ref={shadowCamera}
        args={[-width / 2, width / 2, height / 2, -height / 2, 0, far]}
      />
    </group>
  );
}
