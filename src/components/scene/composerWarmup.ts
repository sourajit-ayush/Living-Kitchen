import type { EffectComposer, Pass } from "postprocessing";
import * as THREE from "three";

/** Collect every material owned by the composer's passes, their effects and the effects' passes. */
function collectMaterials(composer: EffectComposer) {
  const found = new Map<THREE.Material, boolean>(); // material → renders to the screen?
  const seen = new Set<object>();
  const walk = (value: unknown, depth: number, toScreen: boolean) => {
    if (!value || typeof value !== "object" || seen.has(value) || depth > 3) return;
    seen.add(value);
    if (value instanceof THREE.Material) {
      if (!found.has(value)) found.set(value, toScreen);
      return;
    }
    if (value instanceof THREE.Object3D || value instanceof THREE.Texture) return;
    // Passes expose their material through a getter (backed by a mesh), not an own property.
    const fullscreen = (value as { fullscreenMaterial?: unknown }).fullscreenMaterial;
    if (fullscreen instanceof THREE.Material && !found.has(fullscreen))
      found.set(fullscreen, false);
    if (value instanceof THREE.WebGLRenderTarget || value instanceof THREE.BufferGeometry) return;
    for (const key of Object.keys(value)) {
      if (key === "renderer" || key === "scene" || key === "camera" || key.startsWith("_"))
        continue;
      walk((value as Record<string, unknown>)[key], depth + 1, false);
    }
  };
  for (const pass of composer.passes as (Pass & {
    effects?: unknown[];
    recompile?: () => void;
  })[]) {
    pass.recompile?.(); // EffectPass builds its merged shader lazily; build it now
    const screen = pass.renderToScreen;
    if (pass.fullscreenMaterial) found.set(pass.fullscreenMaterial, screen);
    walk(pass.effects, 0, false);
  }
  return found;
}

/**
 * Compile the post-processing shaders (bloom mip chain, depth of field, the merged effect shader)
 * with KHR_parallel_shader_compile before the first composited frame; otherwise they compile
 * synchronously on frame one (~250 ms measured on Windows/ANGLE). Intermediate passes render to a
 * buffer and the last one to the screen, so each is compiled with the matching target bound.
 */
export async function warmComposer(gl: THREE.WebGLRenderer, composer: EffectComposer) {
  const materials = collectMaterials(composer);
  const offscreen = new THREE.WebGLRenderTarget(1, 1);
  const camera = new THREE.OrthographicCamera();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const pending: Promise<unknown>[] = [];
  for (const [material, toScreen] of materials) {
    const mesh = new THREE.Mesh(geometry, material);
    const previous = gl.getRenderTarget();
    gl.setRenderTarget(toScreen ? null : offscreen);
    pending.push(gl.compileAsync(mesh, camera).catch(() => undefined));
    gl.setRenderTarget(previous);
  }
  await Promise.all(pending);
  offscreen.dispose();
  geometry.dispose();
}
