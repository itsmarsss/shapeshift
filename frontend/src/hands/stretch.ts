import type { Vec3 } from "@shapeshift/shared/scene/schema";

// Stretching only starts turning past this twist, and only starts scaling past
// this much spread, so a stretch doesn't also wobble the angle and vice versa.
const TWIST_DEAD_ZONE = 0.12;
const SCALE_DEAD_ZONE = 0.06;
export const MIN_FACTOR = 0.05;
export const MAX_FACTOR = 20;

// The scale and rotation for a held object after the hands spread by `factor`
// (their distance's ratio since the stretch began) and twisted by `twist`
// radians clockwise on screen.
export function stretched(start: { scale: Vec3; rotation: Vec3 }, factor: number, twist: number, snapRotate: number | null) {
    const log = Math.log(Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, factor)));
    const spread = Math.abs(log) < SCALE_DEAD_ZONE ? 1 : Math.exp(log - Math.sign(log) * SCALE_DEAD_ZONE);
    let turn = Math.abs(twist) < TWIST_DEAD_ZONE ? 0 : twist - Math.sign(twist) * TWIST_DEAD_ZONE;
    if (snapRotate) turn = Math.round(turn / snapRotate) * snapRotate;
    return {
        scale: start.scale.map((v) => v * spread) as Vec3,
        // Clockwise on screen is clockwise seen from above: a negative turn about Y.
        rotation: [start.rotation[0], start.rotation[1] - turn, start.rotation[2]] as Vec3,
    };
}
