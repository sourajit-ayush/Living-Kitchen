"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

export type SheetSnap = "peek" | "half" | "full";
const ORDER: SheetSnap[] = ["peek", "half", "full"];

const FULL_TOP = 64; // just under the header

/** Sheet top edge per snap point, in px for the current viewport. */
function snapTop(snap: SheetSnap, vh: number) {
  if (snap === "full") return FULL_TOP;
  if (snap === "half") return Math.round(vh * 0.45); // canvas keeps the top 45%
  return vh - 136; // peek: handle + input row
}

/**
 * Mobile bottom sheet with 3 snap points (docs/02 §4). Dragged by its handle; the handle is also
 * a button that cycles snap points for keyboard and screen-reader users. On lg+ the sheet becomes
 * `display: contents`, so its children position themselves as desktop floating panels.
 */
export function BottomSheet({
  snap,
  onSnapChange,
  children,
}: {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("Sheet");
  const [vh, setVh] = useState(800);
  const [dragTop, setDragTop] = useState<number | null>(null);
  const justDragged = useRef(false);
  const drag = useRef<{
    startY: number;
    startTop: number;
    lastY: number;
    lastT: number;
    v: number;
  } | null>(null);

  useEffect(() => {
    const update = () => setVh(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const top = dragTop ?? snapTop(snap, vh);

  const finishDrag = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (!d || dragTop === null) return;
    justDragged.current = true;
    // Flick velocity decides direction; otherwise snap to the nearest point.
    const projected = dragTop + d.v * 180;
    const nearest = ORDER.reduce((best, s) =>
      Math.abs(snapTop(s, vh) - projected) < Math.abs(snapTop(best, vh) - projected) ? s : best,
    );
    setDragTop(null);
    onSnapChange(nearest);
  }, [dragTop, vh, onSnapChange]);

  return (
    <div
      // Full height, moved with a transform: animating `top` relaid out the sheet every frame
      // (CLS ~0.36 per snap). Bottom padding below keeps everything reachable when lowered.
      className="fixed inset-x-0 top-16 bottom-0 z-10 flex flex-col rounded-t-sheet border-b-0 glass transition-transform duration-300 ease-[var(--ease-soft)] will-change-transform data-[dragging=true]:transition-none lg:contents"
      style={{ transform: `translateY(${top - FULL_TOP}px)` }}
      data-dragging={dragTop !== null}
      data-snap={snap}
    >
      <div
        className="flex shrink-0 touch-none justify-center pt-2 pb-1 lg:hidden"
        onPointerDown={(e) => {
          justDragged.current = false;
          drag.current = {
            startY: e.clientY,
            startTop: top,
            lastY: e.clientY,
            lastT: e.timeStamp,
            v: 0,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dt = Math.max(1, e.timeStamp - d.lastT);
          d.v = (e.clientY - d.lastY) / dt;
          d.lastY = e.clientY;
          d.lastT = e.timeStamp;
          if (Math.abs(e.clientY - d.startY) > 4) {
            // Capture only once it's a real drag, so a plain tap still reaches the handle button.
            const el = e.currentTarget as HTMLElement;
            if (!el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId);
            setDragTop(Math.min(vh - 96, Math.max(56, d.startTop + e.clientY - d.startY)));
          }
        }}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <button
          type="button"
          aria-label={t("handle", { state: t(snap) })}
          onClick={() => {
            if (justDragged.current) {
              justDragged.current = false;
              return;
            }
            onSnapChange(ORDER[(ORDER.indexOf(snap) + 1) % ORDER.length]);
          }}
          className="flex h-8 w-24 items-center justify-center rounded-full"
        >
          <span aria-hidden className="h-1.5 w-12 rounded-full bg-walnut-500/50" />
        </button>
      </div>
      <div
        className="flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pt-1 lg:contents"
        style={{ paddingBottom: top - FULL_TOP + 40 }}
      >
        {children}
      </div>
    </div>
  );
}
