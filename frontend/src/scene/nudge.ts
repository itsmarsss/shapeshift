import type { Vec3 } from "@shapeshift/shared/scene/schema";
import { useScene } from "./store";
import { transformCommand } from "./autokey";

export type Arrow = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

// Which way an arrow key moves things on the floor, given how far the camera
// has turned around (its azimuth; 0 looks from the front). Up is away from
// the camera and Right is to its right, rounded to the nearest grid axis so
// nudges stay lined up with the grid.
export function nudgeDirection(arrow: Arrow, azimuth: number): [number, number] {
    const forward: [number, number] = [-Math.sin(azimuth), -Math.cos(azimuth)];
    const right: [number, number] = [Math.cos(azimuth), -Math.sin(azimuth)];
    const v = arrow === "ArrowUp" ? forward : arrow === "ArrowDown" ? [-forward[0], -forward[1]] : arrow === "ArrowRight" ? right : [-right[0], -right[1]];
    return Math.abs(v[0]) >= Math.abs(v[1]) ? [Math.sign(v[0]), 0] : [0, Math.sign(v[1])];
}

// Moves everything selected by an offset, as one undo step while the key is
// held (the caller ends the step when the key goes up).
export function nudgeSelection(offset: Vec3) {
    const { doc, selectedIds, run } = useScene.getState();
    const items = [...doc.objects, ...doc.lights].filter((o) => selectedIds.includes(o.id));
    if (!items.length) return false;
    run(
        items.map((o) => transformCommand(o.id, { position: [o.position[0] + offset[0], o.position[1] + offset[1], o.position[2] + offset[2]] })),
        { coalesce: "nudge", select: false }
    );
    return true;
}
