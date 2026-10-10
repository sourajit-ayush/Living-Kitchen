"use client";

import { useEffect, useState } from "react";
import { useScene } from "@/store/useScene";

type GlStats = { info: { render: { calls: number; triangles: number } } };

/**
 * `?debug=1` overlay: FPS, quality tier and draw calls, for checking the docs/03 §7 budget on
 * real devices (60 fps desktop, 30+ fps mid-range Android, < 100 draw calls).
 */
export function DebugHud() {
  const tier = useScene((s) => s.tier);
  const [enabled, setEnabled] = useState(false);
  const [stats, setStats] = useState({ fps: 0, calls: 0, tris: 0 });

  useEffect(() => {
    setEnabled(new URLSearchParams(window.location.search).get("debug") === "1");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      frames++;
      if (now - last >= 1000) {
        const gl = (window as unknown as { __lkGl?: GlStats }).__lkGl;
        setStats({
          fps: Math.round((frames * 1000) / (now - last)),
          calls: gl?.info.render.calls ?? 0,
          tris: gl?.info.render.triangles ?? 0,
        });
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed top-16 left-2 z-50 rounded-md bg-walnut-900/85 px-2 py-1 font-mono text-[11px] leading-tight text-cream-50 tabular"
    >
      {stats.fps} fps · {tier ?? "…"} · {stats.calls} calls · {(stats.tris / 1000).toFixed(1)}k tris
    </div>
  );
}
