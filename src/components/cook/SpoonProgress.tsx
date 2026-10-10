"use client";

import { useId } from "react";

/**
 * Recipe progress as a wooden spoon filling up with saffron from the handle to the bowl (F9).
 * A real progressbar for assistive tech; the drawing is decorative.
 */
export function SpoonProgress({
  step,
  total,
  label,
}: {
  step: number;
  total: number;
  label: string;
}) {
  const clip = useId();
  const fraction = total > 0 ? step / total : 0;
  const W = 400;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={step}
      aria-valuetext={`${step} / ${total}`}
      className="w-full"
    >
      <svg
        viewBox={`0 0 ${W} 40`}
        className="h-7 w-full"
        aria-hidden
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <clipPath id={clip}>
            <rect
              x="0"
              y="0"
              height="40"
              width={W * fraction}
              className="transition-[width] duration-500 ease-out"
            />
          </clipPath>
        </defs>
        {/* the spoon, in pale wood */}
        <g fill="#d9b98f" fillOpacity="0.35">
          <rect x="4" y="15" width="296" height="10" rx="5" />
          <ellipse cx="342" cy="20" rx="54" ry="17" />
        </g>
        {/* the same shape, filled up to the current step */}
        <g clipPath={`url(#${clip})`} fill="#f2a03d">
          <rect x="4" y="15" width="296" height="10" rx="5" />
          <ellipse cx="342" cy="20" rx="54" ry="17" />
        </g>
        <ellipse cx="342" cy="20" rx="40" ry="10" fill="#000" fillOpacity="0.12" />
      </svg>
    </div>
  );
}
