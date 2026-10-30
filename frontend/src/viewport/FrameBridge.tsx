import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { CameraControls } from "@react-three/drei";
import * as THREE from "three";
import { worldBounds } from "../assistant/assistant";
import { useScene } from "../scene/store";
import { useFrameRequest } from "./frame";

// Moves the camera to show the whole scene, or just some objects, when asked to.
export function FrameBridge() {
    const controls = useThree((s) => s.controls) as unknown as CameraControls | null;
    const count = useFrameRequest((s) => s.count);
    useEffect(() => {
        const { ids } = useFrameRequest.getState();
        const all = useScene.getState().doc.objects;
        const wanted = ids && new Set(ids);
        const objects = wanted ? all.filter((o) => wanted.has(o.id)) : all;
        if (!count || !controls || !objects.length) return;
        // Leave out flat ground planes, so the camera frames the subject.
        const solid = objects.filter((o) => o.geometry.type !== "plane");
        const box = new THREE.Box3();
        for (const o of solid.length ? solid : objects) {
            const b = worldBounds(o);
            box.expandByPoint(new THREE.Vector3(...b.min)).expandByPoint(new THREE.Vector3(...b.max));
        }
        if (wanted) {
            // A model that was just opened is shown from a three-quarter view, at
            // whatever size it is.
            void controls.rotateTo(Math.PI / 5, Math.PI / 3, false);
            void controls.fitToSphere(box.getBoundingSphere(new THREE.Sphere()), true);
            return;
        }
        const pad = box.getSize(new THREE.Vector3()).length() * 0.15;
        void controls.fitToBox(box, true, { paddingTop: pad, paddingBottom: pad, paddingLeft: pad, paddingRight: pad });
    }, [count, controls]);
    return null;
}
