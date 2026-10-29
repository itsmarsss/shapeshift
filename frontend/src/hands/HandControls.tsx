import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { CameraControls } from "@react-three/drei";
import * as THREE from "three";
import { useScene } from "../scene/store";
import type { Handedness } from "./gestures";
import { live } from "./tracker";

type Drag =
    | { kind: "object"; id: string; plane: THREE.Plane; offset: THREE.Vector3 }
    | { kind: "orbit" };

const ORBIT_SPEED = Math.PI * 1.5;
const ZOOM_SPEED = 12;
const PAN_SPEED = 6;

export function HandControls() {
    const camera = useThree((s) => s.camera);
    const scene = useThree((s) => s.scene);
    const controls = useThree((s) => s.controls) as CameraControls | null;
    const drag = useRef<Drag | null>(null);
    const pair = useRef<{ dist: number; x: number; y: number } | null>(null);
    const raycaster = useRef(new THREE.Raycaster());

    const ndc = (x: number, y: number) => new THREE.Vector2(x * 2 - 1, -(y * 2 - 1));
    const handled = useRef(new Map<Handedness, number>());
    const orbitFrom = useRef(new Map<Handedness, { x: number; y: number }>());

    function endDrag() {
        if (drag.current?.kind === "object") useScene.getState().endCoalesce();
        drag.current = null;
    }

    useFrame(() => {
        const hands = live.hands;
        const pinching = hands.filter((h) => h.pinching);
        const state = useScene.getState();

        if (pinching.length >= 2) {
            endDrag();
            const [a, b] = pinching;
            const now = { dist: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            if (pair.current && controls) {
                controls.dolly((now.dist - pair.current.dist) * ZOOM_SPEED, false);
                controls.truck(-(now.x - pair.current.x) * PAN_SPEED, -(now.y - pair.current.y) * PAN_SPEED, false);
            }
            pair.current = now;
        } else {
            pair.current = null;
            const h = pinching[0];
            if (!h) {
                endDrag();
            } else {
                const isNew = handled.current.get(h.handedness) !== h.pinchId || !drag.current;
                if (isNew) {
                    handled.current.set(h.handedness, h.pinchId);
                    orbitFrom.current.set(h.handedness, { x: h.startX, y: h.startY });
                    raycaster.current.setFromCamera(ndc(h.startX, h.startY), camera);
                    const ids = new Set(state.doc.objects.map((o) => o.id));
                    const hit = raycaster.current
                        .intersectObjects(scene.children, false)
                        .find((i) => ids.has(i.object.name));
                    if (hit && state.mode !== "render") {
                        state.select(hit.object.name);
                        if (state.mode === "object") {
                            const normal = camera.getWorldDirection(new THREE.Vector3());
                            const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.object.position);
                            const onPlane = raycaster.current.ray.intersectPlane(plane, new THREE.Vector3());
                            drag.current = onPlane
                                ? { kind: "object", id: hit.object.name, plane, offset: hit.object.position.clone().sub(onPlane) }
                                : { kind: "orbit" };
                        } else drag.current = { kind: "orbit" };
                    } else drag.current = { kind: "orbit" };
                }
                if (drag.current?.kind === "object") {
                    raycaster.current.setFromCamera(ndc(h.x, h.y), camera);
                    const p = raycaster.current.ray.intersectPlane(drag.current.plane, new THREE.Vector3());
                    if (p) {
                        p.add(drag.current.offset);
                        const { enabled, translate } = state.snap;
                        const s = (v: number) => (enabled ? Math.round(v / translate) * translate : v);
                        state.run(
                            { type: "transform", target: drag.current.id, position: [s(p.x), s(p.y), s(p.z)] },
                            { coalesce: `hand:${drag.current.id}` }
                        );
                    }
                } else if (drag.current?.kind === "orbit" && controls) {
                    const from = orbitFrom.current.get(h.handedness) ?? h;
                    controls.rotate(-(h.x - from.x) * ORBIT_SPEED, -(h.y - from.y) * ORBIT_SPEED, false);
                    orbitFrom.current.set(h.handedness, { x: h.x, y: h.y });
                }
            }
        }

    });

    return null;
}
