"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Floating emoji labels for every ingredient in ONE draw call: an instanced, camera-facing quad
 * that samples a dynamically filled emoji atlas. Ingredients register a label and update its
 * position/scale each frame; this layer writes the instance matrices.
 */

const CELLS = 8; // 8×8 = 64 distinct emoji
const CELL_PX = 64;
// 24 on the counter (MAX_ON_COUNTER) + 12 jars on the pantry shelf, with room to spare.
const MAX_LABELS = 48;

type Label = { position: THREE.Vector3; scale: number; emoji: string };
const labels = new Map<number, Label>();
let nextId = 1;

export function registerLabel(emoji: string): { id: number; label: Label } {
  const label: Label = { position: new THREE.Vector3(0, -10, 0), scale: 0, emoji };
  const id = nextId++;
  labels.set(id, label);
  return { id, label };
}

export function unregisterLabel(id: number) {
  labels.delete(id);
}

/** Lazily draws each new emoji (on a cream disc) into the next free atlas cell. */
class EmojiAtlas {
  canvas = document.createElement("canvas");
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  cells = new Map<string, number>();

  constructor() {
    this.canvas.width = this.canvas.height = CELLS * CELL_PX;
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  cell(emoji: string): number {
    const hit = this.cells.get(emoji);
    if (hit !== undefined) return hit;
    const index = this.cells.size % (CELLS * CELLS);
    this.cells.set(emoji, index);
    const x = (index % CELLS) * CELL_PX;
    const y = Math.floor(index / CELLS) * CELL_PX;
    const c = this.ctx;
    c.clearRect(x, y, CELL_PX, CELL_PX);
    c.fillStyle = "rgba(255,248,238,0.92)";
    c.beginPath();
    c.arc(x + CELL_PX / 2, y + CELL_PX / 2, CELL_PX / 2 - 3, 0, Math.PI * 2);
    c.fill();
    c.font = `${CELL_PX * 0.56}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(emoji, x + CELL_PX / 2, y + CELL_PX / 2 + 3);
    this.texture.needsUpdate = true;
    return index;
  }
}

const vertexShader = /* glsl */ `
  attribute vec2 aCell;
  uniform float uCells;
  varying vec2 vUv;
  void main() {
    // Atlas rows are top-down in the canvas, UVs are bottom-up.
    vUv = vec2((uv.x + aCell.x) / uCells, 1.0 - (1.0 - uv.y + aCell.y) / uCells);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  void main() {
    vec4 texel = texture2D(uAtlas, vUv);
    if (texel.a < 0.04) discard;
    gl_FragColor = texel;
    #include <colorspace_fragment>
  }
`;

export function LabelLayer() {
  const camera = useThree((s) => s.camera);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const atlas = useMemo(() => new EmojiAtlas(), []);
  const { geometry, cellAttr } = useMemo(() => {
    const cell = new THREE.InstancedBufferAttribute(new Float32Array(MAX_LABELS * 2), 2);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute("aCell", cell); // the same object we update each frame
    return { geometry: geo, cellAttr: cell };
  }, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { uAtlas: { value: atlas.texture }, uCells: { value: CELLS } },
        transparent: true,
        depthWrite: false,
      }),
    [atlas],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    let n = 0;
    for (const label of labels.values()) {
      if (n >= MAX_LABELS) break;
      const cell = atlas.cell(label.emoji);
      cellAttr.setXY(n, cell % CELLS, Math.floor(cell / CELLS));
      dummy.position.copy(label.position);
      dummy.quaternion.copy(camera.quaternion); // billboard
      dummy.scale.setScalar(label.scale);
      dummy.updateMatrix();
      m.setMatrixAt(n, dummy.matrix);
      n++;
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    cellAttr.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, MAX_LABELS]}
      frustumCulled={false}
      renderOrder={5}
    />
  );
}
