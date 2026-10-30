import { useCallback } from "react";
import * as THREE from "three";
import { usePalette } from "../settings/theme";

type GizmoMaterial = THREE.Material & { color?: THREE.Color; tempColor?: THREE.Color };

const PURE = [0xff0000, 0x00ff00, 0x0000ff];

// The transform gizmo draws its axes in pure red, green and blue. This ref
// callback gives it the app's axis colors so it matches the grid and the
// inspector. The gizmo restores each handle's color from `tempColor` every
// frame, so both have to change.
export function useGizmoColors() {
    const palette = usePalette();
    return useCallback(
        (controls: THREE.Object3D | null) => {
            if (!controls) return;
            const target = [palette.axisX, palette.axisY, palette.axisZ].map((c) => new THREE.Color(c));
            controls.traverse((child) => {
                const materials = [(child as THREE.Mesh).material].flat().filter(Boolean) as GizmoMaterial[];
                for (const m of materials) {
                    if (!m.color) continue;
                    m.userData.axisBase ??= (m.tempColor ?? m.color).getHex();
                    const axis = PURE.indexOf(m.userData.axisBase as number);
                    if (axis < 0) continue;
                    m.color.copy(target[axis]);
                    m.tempColor?.copy(target[axis]);
                }
            });
        },
        [palette]
    );
}
