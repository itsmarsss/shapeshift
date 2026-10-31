import { useCallback } from "react";
import * as THREE from "three";
import { usePalette } from "../settings/theme";
import { trackGizmo } from "./tools";

type GizmoMaterial = THREE.Material & { color?: THREE.Color; tempColor?: THREE.Color };

const PURE = [0xff0000, 0x00ff00, 0x0000ff];
// The two-axis handles (drag in a plane) take the color of the axis they're
// square to, so the floor square is Y's color, like the arrow sticking out of it.
const PLANES: Record<string, number> = { YZ: 0, XZ: 1, XY: 2 };

// The transform gizmo draws its axes in pure red, green and blue and its
// plane handles in yellow, cyan and magenta. This ref callback gives it the
// app's axis colors so it matches the grid and the inspector. The gizmo
// restores each handle's color from `tempColor` every frame, so both change.
export function useGizmoColors() {
    const palette = usePalette();
    return useCallback(
        (controls: THREE.Object3D | null) => {
            if (!controls) return;
            trackGizmo(controls as unknown as { enabled: boolean });
            const target = [palette.axisX, palette.axisY, palette.axisZ].map((c) => new THREE.Color(c));
            controls.traverse((child) => {
                const materials = [(child as THREE.Mesh).material].flat().filter(Boolean) as GizmoMaterial[];
                for (const m of materials) {
                    if (!m.color) continue;
                    m.userData.axisBase ??= (m.tempColor ?? m.color).getHex();
                    const axis = child.name in PLANES ? PLANES[child.name] : PURE.indexOf(m.userData.axisBase as number);
                    if (axis < 0) continue;
                    m.color.copy(target[axis]);
                    m.tempColor?.copy(target[axis]);
                }
            });
        },
        [palette]
    );
}
