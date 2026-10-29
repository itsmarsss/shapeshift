import type { Command, Vec3 } from "./schema";
import { isAnimated, useTimeline } from "./timeline";

type Values = { position?: Vec3; rotation?: Vec3; scale?: Vec3; color?: string; intensity?: number };

// Editing something that's animated records a keyframe at the current time
// instead of changing a value the animation would override anyway.
export function editCommand(target: string, values: Values, fallback: Command): Command {
    if (!isAnimated(target)) return fallback;
    const properties = (Object.keys(values) as (keyof Values)[]).filter((k) => values[k] !== undefined);
    return { type: "keyframe", target, time: useTimeline.getState().time, properties, values };
}

export function transformCommand(target: string, values: { position?: Vec3; rotation?: Vec3; scale?: Vec3 }): Command {
    return editCommand(target, values, { type: "transform", target, ...values });
}
