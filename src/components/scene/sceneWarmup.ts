import * as THREE from "three";
import { bakeEnvironment } from "./BakedEnvironment";
import { warmContactShadows } from "./ContactShadowLayer";
import { warmPmrem } from "./pmremWarmup";

const SLICE_MS = 8;

/**
 * Extra warm-ups registered by scene parts that own shaders the scene graph can't see (e.g. the
 * post-processing composer). Registered in a layout effect, so they exist before warmScene runs.
 */
export const extraWarmups = new Set<(gl: THREE.WebGLRenderer) => Promise<void>>();

/** Yield to the event loop so input and rendering can run between slices. */
const yieldToMain = () =>
  new Promise<void>((resolve) => {
    const channel = new MessageChannel(); // unlike setTimeout(0), never clamped to 4 ms
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(null);
  });

/**
 * Wait, without blocking, until the GPU has worked through everything queued so far (a new
 * context's set-up). The first synchronous WebGL query otherwise sits out that wait on the main
 * thread: ~140 ms measured. Sync-object status updates between tasks, so polling it is free.
 */
async function gpuCaughtUp(gl: THREE.WebGLRenderer) {
  const ctx = gl.getContext();
  if (typeof WebGL2RenderingContext === "undefined" || !(ctx instanceof WebGL2RenderingContext)) {
    return;
  }
  const sync = ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!sync) return;
  ctx.flush();
  const start = performance.now();
  while (
    ctx.getSyncParameter(sync, ctx.SYNC_STATUS) !== ctx.SIGNALED &&
    performance.now() - start < 3000
  ) {
    await new Promise((resolve) => setTimeout(resolve, 8));
  }
  ctx.deleteSync(sync);
}

/**
 * Prepare everything the first frame needs without long main-thread tasks: upload textures, warm
 * the environment map's PMREM shaders and bake the environment, then compile every object's
 * shaders with KHR_parallel_shader_compile (`compileAsync`). Work is cut into ~8 ms slices;
 * three's own shader assembly for ~20 programs was otherwise one ~200 ms task. Resolves with a
 * disposer for the PMREM warm-up (call it once the scene has rendered), or undefined if cancelled.
 */
export async function warmScene(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  cancelled: () => boolean,
  envResolution: number,
  /**
   * The scene renders into an off-screen buffer (post-processing on). Programs are keyed on the
   * output target (tone mapping, colour space), so compile for that, not for the screen.
   */
  offscreen: boolean,
): Promise<(() => void) | undefined> {
  const textures = new Set<THREE.Texture>();
  const objects: THREE.Object3D[] = [];
  scene.traverse((o) => {
    const material = (o as THREE.Mesh).material;
    if (!material) return;
    objects.push(o);
    for (const m of Array.isArray(material) ? material : [material]) {
      const map = (m as THREE.MeshStandardMaterial).map;
      if (map) textures.add(map);
    }
  });

  let slice = performance.now();
  const maybeYield = async () => {
    if (performance.now() - slice < SLICE_MS) return;
    await yieldToMain();
    slice = performance.now();
  };

  await gpuCaughtUp(gl);
  if (cancelled()) return undefined;
  slice = performance.now();

  for (const texture of textures) {
    gl.initTexture(texture);
    await maybeYield();
    if (cancelled()) return undefined;
  }

  // Environment before the scene: compiling a standard material converts the environment map
  // (PMREM), so its shaders must be warm and the cube already rendered by then.
  const release = await warmPmrem(gl, envResolution).catch(() => undefined);
  if (cancelled()) return (release?.(), undefined);
  await yieldToMain();
  await bakeEnvironment(gl).catch(() => undefined);
  if (cancelled()) return (release?.(), undefined);

  // A failed warm-up only means compiling on first draw instead.
  const pending: Promise<unknown>[] = [
    warmContactShadows(gl).catch(() => undefined),
    ...[...extraWarmups].map((warm) => warm(gl).catch(() => undefined)),
  ];
  const target = offscreen ? new THREE.WebGLRenderTarget(1, 1) : null;
  for (const object of objects) {
    const previous = gl.getRenderTarget();
    gl.setRenderTarget(target); // compile() reads the bound target synchronously
    pending.push(gl.compileAsync(object, camera, scene).catch(() => undefined));
    gl.setRenderTarget(previous);
    await maybeYield();
    if (cancelled()) return (target?.dispose(), release?.(), undefined);
  }
  await Promise.all(pending);
  target?.dispose();
  return release ?? (() => undefined);
}
