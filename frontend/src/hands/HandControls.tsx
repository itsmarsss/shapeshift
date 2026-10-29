import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { CameraControls } from "@react-three/drei";
import * as THREE from "three";
import { useScene } from "../scene/store";
import { IntentTracker } from "./intents";
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
    const intents = useRef(new IntentTracker());
    const drag = useRef<Drag | null>(null);
    const raycaster = useRef(new THREE.Raycaster());
    const lastHands = useRef(live.hands);

    const aim = (x: number, y: number) => raycaster.current.setFromCamera(new THREE.Vector2(x * 2 - 1, -(y * 2 - 1)), camera);

    function start(x: number, y: number) {
        const state = useScene.getState();
        aim(x, y);
        const ids = new Set(state.doc.objects.map((o) => o.id));
        const hit = raycaster.current.intersectObjects(scene.children, false).find((i) => ids.has(i.object.name));
        drag.current = { kind: "orbit" };
        if (!hit || state.mode === "render") return;
        state.select(hit.object.name);
        if (state.mode !== "object") return;
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), hit.object.position);
        const onPlane = raycaster.current.ray.intersectPlane(plane, new THREE.Vector3());
        if (onPlane) drag.current = { kind: "object", id: hit.object.name, plane, offset: hit.object.position.clone().sub(onPlane) };
    }

    function move(x: number, y: number, dx: number, dy: number) {
        const d = drag.current;
        if (d?.kind === "orbit") {
            controls?.rotate(-dx * ORBIT_SPEED, -dy * ORBIT_SPEED, false);
            return;
        }
        if (d?.kind !== "object") return;
        aim(x, y);
        const p = raycaster.current.ray.intersectPlane(d.plane, new THREE.Vector3());
        if (!p) return;
        p.add(d.offset);
        const state = useScene.getState();
        const { enabled, translate } = state.snap;
        const s = (v: number) => (enabled ? Math.round(v / translate) * translate : v);
        state.run({ type: "transform", target: d.id, position: [s(p.x), s(p.y), s(p.z)] }, { coalesce: `hand:${d.id}` });
    }

    function end() {
        if (drag.current?.kind === "object") useScene.getState().endCoalesce();
        drag.current = null;
    }

    useFrame(() => {
        if (live.hands === lastHands.current) return;
        lastHands.current = live.hands;
        for (const intent of intents.current.update(live.hands)) {
            if (intent.type === "start") start(intent.x, intent.y);
            else if (intent.type === "move") move(intent.x, intent.y, intent.dx, intent.dy);
            else if (intent.type === "end") end();
            else if (controls) {
                controls.dolly(intent.zoom * ZOOM_SPEED, false);
                controls.truck(-intent.panX * PAN_SPEED, -intent.panY * PAN_SPEED, false);
            }
        }
    });

    return null;
}
