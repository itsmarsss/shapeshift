import { MAX_EXPLODE } from "../viewport/view";

// How much the exploded view opens per unit the hands move apart, as a share
// of the camera image's width.
export const SPREAD_GAIN = 2.5;

// Pinching with both hands and pulling them apart explodes the model; bringing
// them together puts it back.
export function spreadExplode(current: number, spread: number): number {
    return Math.min(MAX_EXPLODE, Math.max(0, current + spread * SPREAD_GAIN));
}
