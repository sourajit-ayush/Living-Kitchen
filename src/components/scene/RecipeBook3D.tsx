"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { BookEntry } from "@/store/useBook";
import { useBookPages, useBookView } from "@/store/useBookView";
import { pageId, pageTexture, type PageContent } from "./bookPages";
import { BOARD_POSITION } from "./KitchenSet";
import { mergeParts } from "./merge";
import { markShadowsDirty } from "./shadowGate";
import type { Locale } from "@/i18n/routing";

const PAGE_W = 0.24;
const PAGE_D = 0.33;
const PAGE_Y = 0.0285;
const TURN_S = 0.7;
/** The book rests on the cutting board, clear of the ingredients on the counter. */
const BOOK_POSITION: [number, number, number] = [BOARD_POSITION[0], 0.018, BOARD_POSITION[2]];

/**
 * Page curl (docs/03 §6.7): the page is a strip of 32 segments from the spine (x = 0) to its
 * free edge (x = W). It rotates about the spine, and mid-turn the free edge lags a little, so
 * the paper bends instead of swinging like a board. Unlit with a soft fake shade (the paper
 * stays readable), front and back show the two sides of the leaf.
 */
const vertexShader = /* glsl */ `
  uniform float uTurn;  // 0 = lying on the right, 1 = lying on the left
  uniform float uLag;   // +1 turning forward, -1 turning back
  uniform float uWidth;
  varying vec2 vUv;
  varying float vShade;
  void main() {
    vUv = uv;
    float x = position.x;
    float u = x / uWidth;
    float theta = uTurn * 3.14159265;
    float ang = theta - uLag * sin(theta) * 0.55 * u * u;
    vec3 p = vec3(cos(ang) * x, sin(ang) * x + ${PAGE_Y.toFixed(4)} + 0.002, position.z);
    vShade = 0.8 + 0.2 * abs(cos(ang));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const fragmentShader = /* glsl */ `
  uniform sampler2D uFront;
  uniform sampler2D uBack;
  varying vec2 vUv;
  varying float vShade;
  void main() {
    vec4 c = gl_FrontFacing ? texture2D(uFront, vUv) : texture2D(uBack, vec2(1.0 - vUv.x, vUv.y));
    gl_FragColor = vec4(c.rgb * vShade, 1.0);
    #include <colorspace_fragment>
  }
`;

type Spread = { left: PageContent; right: PageContent };

function spreadFor(pages: BookEntry[], index: number, locale: Locale): Spread {
  const e = pages[index];
  if (!e) {
    return {
      left: { kind: "blank", locale, side: "left" },
      right: { kind: "blank", locale, side: "right" },
    };
  }
  return {
    left: { kind: "left", entry: e, index, count: pages.length },
    right: { kind: "right", entry: e },
  };
}

/** Recipe Book in 3D (R2): a leather-bound book on the cutting board, turned to the page the DOM book shows. */
export function RecipeBook3D({
  visible,
  reducedMotion,
  locale,
}: {
  visible: boolean;
  reducedMotion: boolean;
  locale: Locale;
}) {
  const pages = useBookPages();
  const pageKey = useBookView((s) => s.pageKey);
  const index = Math.max(
    0,
    pages.findIndex((e) => e.key === pageKey),
  );
  const spread = spreadFor(pages, index, locale);

  const group = useRef<THREE.Group>(null);
  const leftMat = useRef<THREE.MeshStandardMaterial>(null);
  const rightMat = useRef<THREE.MeshStandardMaterial>(null);
  const turning = useRef<THREE.Mesh>(null);

  // Textures are cached by page contents and dropped once no longer shown.
  const cache = useRef(new Map<string, THREE.CanvasTexture>());
  const texture = (p: PageContent) => {
    const id = pageId(p);
    let t = cache.current.get(id);
    if (!t) {
      t = pageTexture(p);
      cache.current.set(id, t);
    }
    return t;
  };
  useEffect(() => {
    const textures = cache.current;
    return () => textures.forEach((t) => t.dispose());
  }, []);

  const body = useMemo(
    () =>
      mergeParts([
        // leather covers, open flat
        ...[-1, 1].map((s) => ({
          geometry: new THREE.BoxGeometry(PAGE_W + 0.016, 0.012, PAGE_D + 0.02),
          position: [s * (PAGE_W / 2 + 0.008), 0.006, 0] as [number, number, number],
          color: "#6b3a24",
        })),
        // page blocks
        ...[-1, 1].map((s) => ({
          geometry: new THREE.BoxGeometry(PAGE_W, 0.016, PAGE_D),
          position: [s * (PAGE_W / 2), 0.0205, 0] as [number, number, number],
          color: "#efe4d0",
        })),
        // rounded spine
        {
          geometry: new THREE.CylinderGeometry(0.014, 0.014, PAGE_D + 0.02, 12),
          position: [0, 0.008, 0] as [number, number, number],
          rotation: [Math.PI / 2, 0, 0] as [number, number, number],
          color: "#5a2f1d",
        },
      ]),
    [],
  );
  useEffect(() => () => body.dispose(), [body]);

  const pagePlane = useMemo(() => new THREE.PlaneGeometry(PAGE_W, PAGE_D), []);
  const leafGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(PAGE_W, PAGE_D, 32, 1);
    g.translate(PAGE_W / 2, 0, 0);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  useEffect(
    () => () => {
      pagePlane.dispose();
      leafGeo.dispose();
    },
    [pagePlane, leafGeo],
  );
  const leafMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide,
        uniforms: {
          uTurn: { value: 0 },
          uLag: { value: 1 },
          uWidth: { value: PAGE_W },
          uFront: { value: null },
          uBack: { value: null },
        },
      }),
    [],
  );
  useEffect(() => () => leafMat.dispose(), [leafMat]);

  // What the two static pages show, and the leaf in flight (if any).
  const shown = useRef<{ index: number; spread: Spread } | null>(null);
  const turn = useRef<{
    from: number;
    to: number;
    dir: 1 | -1;
    start: number;
    target: Spread;
  } | null>(null);

  const apply = (left: PageContent, right: PageContent) => {
    if (leftMat.current) {
      leftMat.current.map = texture(left);
      leftMat.current.needsUpdate = true;
    }
    if (rightMat.current) {
      rightMat.current.map = texture(right);
      rightMat.current.needsUpdate = true;
    }
  };

  const prune = (keep: PageContent[]) => {
    const ids = new Set(keep.map(pageId));
    for (const [id, t] of cache.current) {
      if (!ids.has(id)) {
        t.dispose();
        cache.current.delete(id);
      }
    }
  };

  // Pages carry a texture from the first frame, so the start-up warm-up compiles the textured
  // variant of their material (a map added later would recompile on the first visit).
  useLayoutEffect(() => {
    apply(spread.left, spread.right);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // Turn the page when the DOM book (or a drag here) moves to another recipe.
  useEffect(() => {
    const prev = shown.current;
    const finishTurn = () => {
      const t = turn.current;
      if (!t) return;
      turn.current = null;
      if (turning.current) turning.current.visible = false;
    };
    finishTurn();
    if (!prev || prev.index === index || reducedMotion || !visible) {
      shown.current = { index, spread };
      apply(spread.left, spread.right);
      prune([spread.left, spread.right]);
      markShadowsDirty();
      return;
    }
    const dir: 1 | -1 = index > prev.index ? 1 : -1;
    const m = leafMat.uniforms;
    if (dir === 1) {
      // The old right page lifts; its back is the new left page.
      m.uFront.value = texture(prev.spread.right);
      m.uBack.value = texture(spread.left);
      apply(prev.spread.left, spread.right);
    } else {
      m.uFront.value = texture(spread.right);
      m.uBack.value = texture(prev.spread.left);
      apply(spread.left, prev.spread.right);
    }
    m.uLag.value = dir;
    m.uTurn.value = dir === 1 ? 0 : 1;
    turn.current = { from: prev.index, to: index, dir, start: performance.now(), target: spread };
    shown.current = { index, spread };
    if (turning.current) turning.current.visible = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spread is derived from these
  }, [index, pages, reducedMotion, visible, locale]);

  useFrame(() => {
    const g = group.current;
    if (g) g.visible = visible;
    const t = turn.current;
    if (!t) return;
    const u = Math.min(1, (performance.now() - t.start) / (TURN_S * 1000));
    const eased = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    leafMat.uniforms.uTurn.value = t.dir === 1 ? eased : 1 - eased;
    if (u >= 1) {
      turn.current = null;
      if (turning.current) turning.current.visible = false;
      apply(t.target.left, t.target.right);
      prune([t.target.left, t.target.right]);
    }
  });

  // Drag sideways across the book to turn its pages (docs/03 §6.7).
  const dragX = useRef<number | null>(null);
  const goTo = (dir: 1 | -1) => {
    const next = pages[index + dir];
    if (next) useBookView.getState().setPage(next.key);
  };

  return (
    <group
      ref={group}
      position={BOOK_POSITION}
      rotation={[0, 0.12, 0]}
      visible={false}
      onPointerDown={(e) => {
        dragX.current = e.nativeEvent.clientX;
      }}
      onPointerUp={(e) => {
        const start = dragX.current;
        dragX.current = null;
        if (start === null) return;
        const dx = e.nativeEvent.clientX - start;
        if (Math.abs(dx) > 40) goTo(dx < 0 ? 1 : -1);
      }}
    >
      <mesh geometry={body} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.8} />
      </mesh>
      <mesh
        geometry={pagePlane}
        position={[-PAGE_W / 2, PAGE_Y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial ref={leftMat} roughness={0.92} />
      </mesh>
      <mesh geometry={pagePlane} position={[PAGE_W / 2, PAGE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshStandardMaterial ref={rightMat} roughness={0.92} />
      </mesh>
      {/* The leaf in flight; visible only while turning (one extra draw call). Kept mounted so the
          start-up warm-up compiles its shader. */}
      <mesh ref={turning} geometry={leafGeo} material={leafMat} visible={false} />
    </group>
  );
}
