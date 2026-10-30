import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { CameraControls } from "@react-three/drei";
import * as THREE from "three";
import { worldBounds } from "../assistant/assistant";
import { useScene } from "../scene/store";
import { useFrameRequest } from "./frame";

// Moves the camera to show the whole scene when asked to.
export function FrameBridge() {
    const controls = useThree((s) => s.controls) as unknown as CameraControls | null;
    const count = useFrameRequest((s) => s.count);
    useEffect(() => {
        const { objects } = useScene.getState().doc;
        if (!count || !controls || !objects.length) return;
        // Leave out flat ground planes, so the camera frames the subject.
        const solid = objects.filter((o) => o.geometry.type !== "plane");
        const box = new THREE.Box3();
        for (const o of solid.length ? solid : objects) {
            const b = worldBounds(o);
            box.expandByPoint(new THREE.Vector3(...b.min)).expandByPoint(new THREE.Vector3(...b.max));
        }
        void controls.fitToBox(box, true, { paddingTop: 0.6, paddingBottom: 0.6, paddingLeft: 0.6, paddingRight: 0.6 });
    }, [count, controls]);
    return null;
}
