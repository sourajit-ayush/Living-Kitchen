/**
 * Creating a first WebGL context makes the browser start its GPU process, which blocks the
 * calling thread for up to ~0.5 s (software GL in particular). Probing here, on an OffscreenCanvas
 * in a worker, keeps that off the main thread and warms the GPU process for the real canvas.
 */
export type GpuProbeResult =
  | { webgl: true; strict: boolean; renderer: string }
  /** No WebGL on OffscreenCanvas here (older browsers): the caller probes on the main thread. */
  | { webgl: false };

type Gl = WebGLRenderingContext | WebGL2RenderingContext;
const scope = self as unknown as {
  onmessage: (() => void) | null;
  postMessage: (r: GpuProbeResult) => void;
};

function context(attrs?: WebGLContextAttributes): Gl | null {
  const canvas = new OffscreenCanvas(1, 1);
  return (canvas.getContext("webgl2", attrs) ?? canvas.getContext("webgl", attrs)) as Gl | null;
}

scope.onmessage = () => {
  let result: GpuProbeResult = { webgl: false };
  try {
    // Browsers refuse a context with this flag when they would fall back to software rendering.
    const strict = context({ failIfMajorPerformanceCaveat: true });
    const gl = strict ?? context();
    if (gl) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      result = { webgl: true, strict: !!strict, renderer };
    }
  } catch {
    // reported as unavailable; the caller falls back to probing on the main thread
  }
  scope.postMessage(result);
};
