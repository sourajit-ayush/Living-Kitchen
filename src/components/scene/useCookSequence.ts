"use client";

import { useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect } from "react";
import { playSound, setBubbling } from "@/lib/sound";
import { useKitchen, type KitchenPhase } from "@/store/useKitchen";
import { useScene } from "@/store/useScene";
import { bodies, cook, glass, hopRanks, pot, potLookFor, setVessel, steamFor } from "./cookSignals";
import { emitSplash } from "./PotFx";
import { steamSignal } from "./Steam";

const COOKED: KitchenPhase[] = ["cooking", "revealing", "results", "recipe", "error"];

/** How full the glass looks and how hard it fizzes in Cook Mode, per step action. */
export function glassLookFor(action: string): { liquid: number; fizz: number; straw: number } {
  switch (action) {
    case "grind": // blending
      return { liquid: 0.75, fizz: 0.9, straw: 0 };
    case "mix": // shaking or stirring together
      return { liquid: 0.7, fizz: 0.6, straw: 0 };
    case "rest": // chilling or steeping
      return { liquid: 0.8, fizz: 0.08, straw: 0 };
    case "plate": // pour and garnish
      return { liquid: 0.9, fizz: 0.25, straw: 1 };
    default:
      return { liquid: 0.6, fizz: 0.3, straw: 0 };
  }
}

/**
 * The Cook sequence director (docs/03 §6.3). Watches the kitchen store and drives the pot (lid,
 * liquid, bubbles, flame) or, for drinks, the glass (fill, fizz, straw), plus steam density, the
 * ingredient hop schedule and sounds. The recipe cards (RecipeCards3D) and the camera
 * (KitchenScene → CameraRig) follow the same phases. A named dish ("Name a dish") leaves the
 * counter alone: nothing hops, the pot or glass just works on it.
 */
export function useCookSequence(reducedMotion: boolean) {
  const clock = useThree((s) => s.clock);

  useEffect(() => {
    const tween = (vars: gsap.TweenVars) =>
      gsap.to(pot, { overwrite: "auto", ease: "power2.out", ...vars });
    const pour = (vars: gsap.TweenVars) =>
      gsap.to(glass, { overwrite: "auto", ease: "power2.out", ...vars });
    const instant = reducedMotion;
    const drinking = () => cook.vessel === "glass";

    const intoTheVessel = () => {
      const { requestCategory, mode, ingredients } = useKitchen.getState();
      setVessel(requestCategory === "drink" ? "glass" : "pot");
      // Rank whatever is on the counter by distance to the vessel; each hops on its turn.
      const positions =
        mode === "dish"
          ? []
          : [...bodies].map(([key, read]) => [key, read()] as [string, { x: number; z: number }]);
      cook.rank = hopRanks(positions, cook.target);
      cook.keys = mode === "dish" ? new Set() : new Set(ingredients.map((i) => i.key));
      const landed = 0.4 + positions.length * 0.06 + 0.6;

      if (drinking()) {
        // The glass appears first, then the ingredients drop in and the drink rises.
        cook.startAt = clock.elapsedTime + (instant ? 0 : 0.6);
        pour({ show: 1, duration: instant ? 0 : 0.5, ease: "back.out(1.7)" });
        pour({ liquid: 0.25, duration: instant ? 0 : 0.8, delay: instant ? 0 : 0.5 });
        pour({
          liquid: Math.min(0.7, 0.3 + positions.length * 0.06),
          fizz: 0.3,
          duration: 0.8,
          delay: instant ? 0 : landed + 0.2,
        });
        playSound("plop");
        return;
      }

      cook.startAt = clock.elapsedTime + (instant ? 0 : 0.4);
      tween({ lid: 1, duration: instant ? 0 : 0.5, ease: "back.out(1.6)" });
      useScene.setState({ potOpen: true });
      tween({ flame: 0.6, duration: 0.6 });
      tween({ liquid: Math.min(1, 0.3 + positions.length * 0.08), duration: 0.8, delay: landed });
      tween({ bubbles: 0.3, duration: 0.8, delay: instant ? 0 : 0.6 });
      playSound("sizzle");
      setBubbling(0.3);
    };

    const backToCounter = () => {
      cook.startAt = -1;
      cook.rank = new Map();
      cook.keys = new Set();
      cook.popGeneration++; // everything in the pot or glass pops back out (Ingredient3D)
      if (drinking()) {
        // Let the ingredients pop out first, then the glass empties and goes away.
        pour({ fizz: 0, straw: 0, liquid: 0, duration: 0.5 });
        pour({
          show: 0,
          duration: instant ? 0 : 0.4,
          delay: instant ? 0 : 0.9,
          ease: "back.in(1.6)",
        });
        gsap.delayedCall(instant ? 0 : 1.4, () => {
          if (useKitchen.getState().phase === "idle") setVessel("pot");
        });
        return;
      }
      tween({ bubbles: 0, liquid: 0, flame: 0, duration: 0.5 });
      tween({ lid: 0, duration: instant ? 0 : 0.45, delay: instant ? 0 : 0.7, ease: "bounce.out" });
      useScene.setState({ potOpen: false });
      setBubbling(0);
    };

    const boilOver = () => {
      playSound("boilOver");
      setBubbling(0);
      if (drinking()) {
        // The glass fizzes over instead.
        if (!instant)
          [0, 0.15, 0.3].forEach((d) => gsap.delayedCall(d, () => emitSplash(1.2, "#f4ead8")));
        pour({ fizz: 1, duration: 0.15 });
        pour({ fizz: 0.1, duration: 1.2, delay: 0.6 });
        return;
      }
      if (!instant) {
        steamSignal.density = 1.6;
        gsap.delayedCall(0.7, () => (steamSignal.density = steamFor("error", 0)));
        [0, 0.15, 0.3].forEach((d) => gsap.delayedCall(d, () => emitSplash(1.8, "#f4ead8")));
      }
      tween({ bubbles: 1, duration: 0.15 });
      tween({ bubbles: 0.15, flame: 0.1, duration: 1.2, delay: 0.6 });
    };

    const onPhase = (next: KitchenPhase, prev: KitchenPhase) => {
      // The glass makes no steam: the pot keeps its idle wisp while a drink is mixed.
      steamSignal.density = drinking()
        ? steamFor("idle", 0)
        : steamFor(next, useKitchen.getState().progress);
      switch (next) {
        case "cooking":
          intoTheVessel();
          if (drinking()) steamSignal.density = steamFor("idle", 0);
          break;
        case "revealing":
          playSound("ding");
          if (drinking()) {
            pour({ fizz: 0.5, liquid: 0.9, duration: 0.6 });
            pour({ straw: 1, duration: instant ? 0 : 0.5, delay: instant ? 0 : 0.2 });
          } else {
            setBubbling(0.15);
            tween({ bubbles: 0.5, flame: 0.45, duration: 0.6 });
          }
          break;
        case "results":
        case "recipe":
          if (drinking()) {
            pour({ fizz: 0.25, liquid: 0.9, straw: 1, duration: 1 });
          } else {
            setBubbling(0);
            tween({ bubbles: 0.25, flame: 0.3, duration: 1 });
          }
          break;
        case "error":
          boilOver();
          break;
        case "idle":
          if (COOKED.includes(prev)) backToCounter();
          else steamSignal.density = steamFor("idle", 0);
          break;
      }
    };

    const onProgress = (progress: number) => {
      // The thinking loop follows the SSE progress (docs/03 §6.3.4): the pot bubbles, steams and
      // flares; the glass fills and fizzes.
      if (drinking()) {
        pour({ fizz: 0.3 + 0.7 * progress, liquid: 0.5 + 0.35 * progress, duration: 0.4 });
        return;
      }
      steamSignal.density = steamFor("cooking", progress);
      tween({ bubbles: 0.3 + 0.7 * progress, flame: 0.6 + 0.4 * progress, duration: 0.4 });
      setBubbling(0.3 + 0.7 * progress);
    };

    // Cook Mode (docs/03 §6.8): the pot, or the glass for a drink, acts out the current step
    // behind the blurred text. A drink's brewing steps (chai on the boil) still use the pot.
    let sizzle: ReturnType<typeof setInterval> | undefined;
    const onCookAction = (action: string | null) => {
      clearInterval(sizzle);
      if (action) {
        const drink = useScene.getState().cookCategory === "drink";
        const atPot = !drink || action === "boil" || action === "stir" || action === "fry";
        setVessel(drink && !atPot ? "glass" : "pot");
        if (drink) {
          const look = glassLookFor(action);
          pour({ show: 1, liquid: look.liquid, fizz: look.fizz, straw: look.straw, duration: 0.8 });
        } else {
          pour({ show: 0, duration: 0.4 });
        }
        const look = atPot
          ? potLookFor(action)
          : { lid: 0, bubbles: 0, flame: 0, liquid: 0, steam: steamFor("idle", 0) };
        tween({
          lid: look.lid,
          bubbles: look.bubbles,
          flame: look.flame,
          liquid: look.liquid,
          duration: 0.8,
        });
        steamSignal.density = look.steam;
        useScene.setState({ potOpen: look.lid > 0.5 });
        if (action === "fry" && !instant) {
          sizzle = setInterval(() => emitSplash(0.35, "#e8b04a"), 220); // spitting oil
        }
      } else {
        // Back in the kitchen: the look of the current phase (lid open once something cooked).
        const { phase, requestCategory } = useKitchen.getState();
        const cooked = COOKED.includes(phase);
        setVessel(cooked && requestCategory === "drink" ? "glass" : "pot");
        if (!cooked || !drinking()) pour({ show: 0, fizz: 0, straw: 0, liquid: 0, duration: 0.4 });
        onPhase(phase, phase);
        const potCooked = cooked && !drinking();
        tween({ lid: potCooked ? 1 : 0, liquid: potCooked ? pot.liquid : 0, duration: 0.6 });
        useScene.setState({ potOpen: potCooked });
      }
    };

    // The scene can load after a cook already started: catch up without replaying the past.
    const now = useKitchen.getState().phase;
    if (now !== "idle") onPhase(now, "idle");
    const action = useScene.getState().cookAction;
    if (action) onCookAction(action);

    const unsubscribe = useKitchen.subscribe((s, p) => {
      if (useScene.getState().cookAction) return; // Cook Mode owns the pot meanwhile
      if (s.phase !== p.phase) onPhase(s.phase, p.phase);
      else if (s.phase === "cooking" && s.progress !== p.progress) onProgress(s.progress);
    });
    const unsubscribeCook = useScene.subscribe((s, p) => {
      if (s.cookAction !== p.cookAction || s.cookCategory !== p.cookCategory)
        onCookAction(s.cookAction);
    });
    return () => {
      unsubscribe();
      unsubscribeCook();
      clearInterval(sizzle);
      gsap.killTweensOf(pot);
      gsap.killTweensOf(glass);
      setBubbling(0);
    };
  }, [clock, reducedMotion]);
}

/** Mount point for the director inside the Canvas. */
export function CookDirector({ reducedMotion }: { reducedMotion: boolean }) {
  useCookSequence(reducedMotion);
  return null;
}
