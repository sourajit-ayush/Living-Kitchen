"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "@/i18n/navigation";
import { useQualitySetting, useScene } from "@/store/useScene";
import type { Layout } from "./cameraShots";
import { DebugHud } from "./DebugHud";
import { initialTier, readEnvironment } from "./quality";

// The whole Three.js / R3F / rapier stack lives in this lazy chunk (golden rule 3).
const KitchenScene = dynamic(() => import("./KitchenScene"), { ssr: false, loading: () => null });

function useMedia(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const on = () => setMatches(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

/**
 * Background layer: the static poster renders immediately (never block on 3D, golden rule 2) and
 * the canvas fades in over it once its first frames are drawn. Desktop: full-bleed behind the UI.
 * Mobile: the top ~45% of the screen, above the bottom sheet. Cook Mode (docs/03 §6.8): full
 * screen on every layout, blurred and dimmed behind the step text.
 */
/**
 * What the kitchen does behind each page: the counter (kitchen), the stove blurred dark (Cook
 * Mode), the pantry shelf, the recipe book on the counter, or a soft blurred backdrop (list,
 * sign-in). One scene for all of them, so moving between pages never rebuilds the 3D.
 */
export type SceneMode = "kitchen" | "cook" | "pantry" | "book" | "quiet";
export function sceneModeFor(pathname: string): SceneMode {
  if (pathname.startsWith("/cook/")) return "cook";
  if (pathname.startsWith("/pantry")) return "pantry";
  if (pathname.startsWith("/book")) return "book";
  if (pathname === "/" || pathname === "") return "kitchen";
  return "quiet";
}

export function SceneRoot() {
  const tier = useScene((s) => s.tier);
  const ready = useScene((s) => s.ready);
  const onCounter = useScene((s) => s.onCounter);
  const potOpen = useScene((s) => s.potOpen);
  const inPot = useScene((s) => s.inPot);
  const wheel = useScene((s) => s.wheel);
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const desktop = useMedia("(min-width: 1024px)");
  const layout: Layout = desktop ? "desktop" : "mobile";
  const [active, setActive] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const mode = sceneModeFor(usePathname());
  const cookMode = mode === "cook";
  const quiet = mode === "quiet";

  useEffect(() => {
    useScene.getState().setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  // Decide the tier (which probes WebGL) and start fetching the heavy 3D chunk only once the page
  // has loaded and the browser is idle, so neither competes with the poster (LCP) or hydration.
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let idleId: number | undefined;
    const decide = async () => {
      await useQualitySetting.persist.rehydrate();
      if (cancelled) return;
      const setting = useQualitySetting.getState().setting;
      const env = await readEnvironment(setting);
      if (cancelled) return;
      useScene.getState().setTier(initialTier(setting, env));
      setIdle(true);
    };
    const go = () => {
      const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
      idleId = ric(() => void decide(), { timeout: 2500 });
    };
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", go);
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
    };
  }, []);

  // Pause rendering when the tab is hidden or the canvas is scrolled off-screen (docs/03 §7).
  useEffect(() => {
    let visible = !document.hidden;
    let onScreen = true;
    const update = () => setActive(visible && onScreen);
    const onVis = () => {
      visible = !document.hidden;
      update();
    };
    document.addEventListener("visibilitychange", onVis);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      update();
    });
    if (root.current) io.observe(root.current);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      io.disconnect();
    };
  }, []);

  const show3d = idle && tier !== null && tier !== "off";

  return (
    <>
      <DebugHud />
      <div
        ref={root}
        aria-hidden="true"
        data-scene-tier={tier ?? "pending"}
        data-scene-ready={ready ? "true" : "false"}
        data-on-counter={onCounter}
        data-pot={potOpen ? "open" : "closed"}
        data-in-pot={inPot}
        data-wheel={wheel}
        data-mode={mode}
        className={`fixed -z-10 overflow-hidden transition-[filter,transform] duration-700 ease-out ${
          cookMode ? "inset-0" : "inset-x-0 top-0 h-[45dvh] lg:inset-0 lg:h-auto"
        }`}
        // Cook Mode: soft, dark and out of focus, so big step text reads on top (the slight scale
        // hides the blur's soft edges).
        style={
          cookMode
            ? { filter: "blur(6px) brightness(0.42) saturate(0.85)", transform: "scale(1.06)" }
            : quiet
              ? { filter: "blur(5px) brightness(0.96) saturate(0.9)", transform: "scale(1.04)" }
              : undefined
        }
      >
        <Poster />
        {show3d && (
          <div
            className="absolute inset-0 transition-opacity duration-700 ease-out"
            style={{ opacity: ready ? 1 : 0 }}
          >
            <KitchenScene
              tier={tier}
              layout={layout}
              reducedMotion={reducedMotion}
              active={active}
              mode={mode}
            />
          </div>
        )}
      </div>
    </>
  );
}

/**
 * The instant LCP layer and the no-3D view: stills rendered from this very scene
 * (public/hero-poster*.webp, regenerate after big scene changes; see docs/DECISIONS.md).
 */
function Poster() {
  // One <picture> rather than two next/image "priority" images: those preloaded both stills on
  // every device. The HTML preload scanner still finds this img immediately.
  return (
    <picture>
      <source media="(min-width: 1024px)" srcSet="/hero-poster.webp" width={1600} height={1000} />
      <img
        src="/hero-poster-mobile.webp"
        alt=""
        width={900}
        height={900}
        fetchPriority="high"
        decoding="sync"
        data-poster
        className="absolute inset-0 size-full object-cover object-center lg:object-top"
      />
    </picture>
  );
}
