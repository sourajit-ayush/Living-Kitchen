"use client";

import { useKitchen } from "@/store/useKitchen";
import { useSurprise } from "@/store/useSurprise";

/**
 * A 3D moment is playing (ingredients tumbling into the pot, recipes rising out of the steam, the
 * Surprise Me wheel spinning): the floating UI steps aside so the scene can be seen, and comes
 * back when there is something to read or do.
 */
export function useStage(): boolean {
  const cooking = useKitchen((s) => s.phase === "cooking" || s.phase === "revealing");
  const surprise = useSurprise(
    (s) => s.status === "loading" || s.status === "spinning" || s.status === "landed",
  );
  return cooking || surprise;
}
