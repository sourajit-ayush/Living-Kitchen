/**
 * Shadows only need re-rendering while something that casts them moves. Static frames reuse the
 * last shadow map and contact-shadow texture, which is most of the GPU cost on integrated GPUs.
 * Anything that moves a shadow caster (falling ingredients, squash, puff-away, Phase 3 lid lift)
 * calls `markShadowsDirty()` every frame it moves; `ShadowGate` consumes it once per frame.
 */
let dirtyFrames = 0;
let movingUntil = 0;

/** Re-render shadows for at least the next `frames` frames. Moving shadow casters count as motion. */
export function markShadowsDirty(frames = 2) {
  if (frames > dirtyFrames) dirtyFrames = frames;
  markMoving();
}

/**
 * Something on screen is animating (an ingredient falling or bouncing, the camera gliding). The
 * low-frame-rate backdrop pages (list, sign-in, Cook Mode) draw every frame until shortly after
 * it stops, so motion never plays at their 10–30 fps cap.
 */
export function markMoving() {
  movingUntil = performance.now() + 150;
}

export function isMoving() {
  return performance.now() < movingUntil;
}

/**
 * Whether the contact shadows render this frame. Set by GatedShadows (Lighting.tsx), read by
 * ContactShadowLayer: while things move, the sun's shadow map and the contact shadows take turns
 * (30 Hz each), so the busiest frames stay under the draw-call budget.
 */
export const shadowFrame = { contact: false };

/** Called once per frame by ShadowGate: true while shadows should update this frame. */
export function consumeShadowsDirty(): boolean {
  if (dirtyFrames <= 0) return false;
  dirtyFrames--;
  return true;
}
