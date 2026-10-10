import { LOOKS, type LightingLook } from "@/lib/daypart";

/**
 * The lighting look being shown right now (R9). The day/night director in Lighting eases it
 * toward the chosen part of day; the window, moon, pendant lamp and candle read it every frame.
 */
export const look: { current: LightingLook } = { current: { ...LOOKS.golden } };
