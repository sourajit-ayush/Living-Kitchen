import * as THREE from "three";

/** The bits of three's PMREMGenerator this relies on (stable since r15x, private by convention). */
type PmremInternals = THREE.PMREMGenerator & {
  _setSize(cubeSize: number): void;
  _allocateTargets(): THREE.WebGLRenderTarget;
  _compileMaterial(material: THREE.Material): void;
  _cubemapMaterial: THREE.ShaderMaterial | null;
  _blurMaterial: THREE.ShaderMaterial | null;
  _ggxMaterial: THREE.ShaderMaterial | null;
  _lodMeshes: THREE.Mesh[];
};

/**
 * The procedural environment (BakedEnvironment) is turned into a reflection map by three's PMREM
 * generator, whose two big shaders (CubemapToCubeUV, PMREMGGXConvolution) compile synchronously:
 * ~0.6 s of frozen main thread on Windows/ANGLE. This builds the same materials on a throwaway
 * generator and compiles them with KHR_parallel_shader_compile instead; three's program cache then
 * hands the finished programs to the real generator. Keep the returned disposer until the scene
 * has rendered, so the cached programs aren't released early.
 */
export async function warmPmrem(gl: THREE.WebGLRenderer, cubeSize: number): Promise<() => void> {
  const pmrem = new THREE.PMREMGenerator(gl) as PmremInternals;
  if (typeof pmrem._allocateTargets !== "function") return () => pmrem.dispose(); // three changed

  pmrem._compileMaterial = () => undefined; // collect the materials without the blocking compile
  pmrem._setSize(cubeSize);
  const target = pmrem._allocateTargets();
  pmrem.compileCubemapShader();

  const scene = new THREE.Scene();
  const geometry = pmrem._lodMeshes[0]?.geometry ?? new THREE.BufferGeometry();
  for (const m of [pmrem._cubemapMaterial, pmrem._ggxMaterial, pmrem._blurMaterial]) {
    if (m) scene.add(new THREE.Mesh(geometry, m));
  }

  // PMREM renders into a float target (no tone mapping, linear output); bind one while compiling
  // so the program cache keys match the real run.
  const previous = gl.getRenderTarget();
  gl.setRenderTarget(target);
  const compiled = gl.compileAsync(scene, new THREE.OrthographicCamera());
  gl.setRenderTarget(previous);
  await compiled.catch(() => undefined);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    pmrem.dispose();
    target.dispose();
  };
}
