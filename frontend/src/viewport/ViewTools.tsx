import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import type { CameraControls } from "@react-three/drei";
import * as THREE from "three";
import type { SceneObject } from "@shapeshift/shared/scene/schema";
import { usePalette } from "../settings/theme";
import { SECTION_PLANE } from "./clipping";
import { useView } from "./view";
import { boundsOf, sectionPlane } from "./viewing";

// Keeps the near and far planes in step with how close the camera is, so a
// 5 mm part and a 2 m machine can both be looked at up close.
export function AutoNear() {
    const controls = useThree((s) => s.controls) as unknown as CameraControls | null;
    const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
    useEffect(() => {
        if (!controls) return;
        const update = () => {
            const d = controls.distance;
            const near = Math.min(0.05, Math.max(0.00005, d / 200));
            const far = Math.max(500, d * 40);
            if (Math.abs(camera.near - near) / near > 0.05 || camera.far !== far) {
                camera.near = near;
                camera.far = far;
                camera.updateProjectionMatrix();
            }
        };
        update();
        controls.addEventListener("update", update);
        return () => controls.removeEventListener("update", update);
    }, [controls, camera]);
    return null;
}

// Moves the section cut to match the controls and outlines where it is.
export function SectionCut({ objects }: { objects: SceneObject[] }) {
    const section = useView((s) => s.section);
    const gl = useThree((s) => s.gl);
    const invalidate = useThree((s) => s.invalidate);
    const palette = usePalette();
    const box = useMemo(() => boundsOf(objects), [objects]);

    useEffect(() => {
        gl.localClippingEnabled = section.on;
        SECTION_PLANE.copy(sectionPlane(box, section));
        invalidate();
    }, [gl, box, section, invalidate]);

    const outline = useMemo(() => {
        if (box.isEmpty()) return null;
        const pad = box.getSize(new THREE.Vector3()).multiplyScalar(0.05);
        const min = box.min.clone().sub(pad);
        const max = box.max.clone().add(pad);
        const i = { x: 0, y: 1, z: 2 }[section.axis];
        const at = box.min.getComponent(i) + (box.max.getComponent(i) - box.min.getComponent(i)) * section.at;
        const [a, b] = [0, 1, 2].filter((k) => k !== i);
        const corner = (u: number, v: number) => {
            const p = new THREE.Vector3().setComponent(i, at);
            p.setComponent(a, u ? max.getComponent(a) : min.getComponent(a));
            p.setComponent(b, v ? max.getComponent(b) : min.getComponent(b));
            return p;
        };
        return [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1), corner(0, 0)];
    }, [box, section.axis, section.at]);

    if (!section.on || !outline) return null;
    return <Line points={outline} color={palette.accent} lineWidth={1.5} userData={{ helper: true }} raycast={() => null} />;
}
