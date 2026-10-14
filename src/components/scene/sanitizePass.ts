import { ShaderPass } from "postprocessing";
import * as THREE from "three";

/** HDR headroom kept for bloom: the brightest real highlights (flame, bulb) stay well below it. */
const MAX_VALUE = "32.0";

/**
 * Cleans the rendered frame before any effect reads it. Phone GPUs compute in lower precision, so
 * a hot specular highlight can overflow to Infinity or turn into NaN. Bloom's mipmap blur then
 * spreads that one bad pixel into big black squares (seen on Android: stepped black blocks over the
 * wall and window). NaN becomes black, Infinity and anything above MAX_VALUE is capped, and
 * negative values are clamped to 0, so no later pass can produce NaN from it either.
 */
export class SanitizePass extends ShaderPass {
  constructor() {
    super(
      new THREE.ShaderMaterial({
        name: "SanitizeMaterial",
        uniforms: { inputBuffer: new THREE.Uniform(null) },
        defines: { MAX_VALUE },
        blending: THREE.NoBlending,
        toneMapped: false,
        depthWrite: false,
        depthTest: false,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = position.xy * 0.5 + 0.5;
            gl_Position = vec4(position.xy, 1.0, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          #ifdef FRAMEBUFFER_PRECISION_HIGH
            uniform mediump sampler2D inputBuffer;
          #else
            uniform lowp sampler2D inputBuffer;
          #endif
          varying vec2 vUv;
          void main() {
            vec4 color = texture2D(inputBuffer, vUv);
            vec3 rgb = any(isnan(color.rgb)) ? vec3(0.0) : color.rgb;
            float alpha = isnan(color.a) ? 1.0 : clamp(color.a, 0.0, 1.0);
            gl_FragColor = vec4(clamp(rgb, vec3(0.0), vec3(MAX_VALUE)), alpha);
          }`,
      }),
      "inputBuffer",
    );
    this.name = "SanitizePass";
  }
}
