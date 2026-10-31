import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { CameraControls } from "@react-three/drei";
import * as THREE from "three";
import { useScene } from "../scene/store";
import type { Handedness } from "./gestures";
import { IntentTracker } from "./intents";
import { live, useHandHover } from "./tracker";
import { useHandActivity, useHandMenu, type HandActivity } from "./menu";
import { editableMesh } from "../scene/geometry";
import { nearestVertex, objectMatrix, useEditSelection } from "../viewport/editSelection";
import { useSettings } from "../settings/store";
import type { Vec3 } from "@shapeshift/shared/scene/schema";
import { MAX_FACTOR, MIN_FACTOR, stretched } from "./stretch";
import { clearControls, controlAt, hoverControl, pressControl } from "./pointer";
import { windowToView } from "../viewport/frame";

type Drag =
    | { kind: "object"; id: string; plane: THREE.Plane; offset: THREE.Vector3; reach: number }
    | { kind: "vertex"; id: string; index: number; plane: THREE.Plane; inverse: THREE.Matrix4; positions: number[]; indices: number[] }
    // One hand held an object and the other joined: spreading the hands
    // scales it and twisting them turns it about its upright axis.
    | { kind: "stretch"; id: string; scale: Vec3; rotation: Vec3; factor: number; twist: number }
    | { kind: "orbit" };

// How far an object moves, as a share of its distance, per meter the hand moves toward or away from the camera.
const DEPTH_GAIN = 2.5;
const ORBIT_SPEED = Math.PI * 1.5;
const ZOOM_SPEED = 12;
const PAN_SPEED = 6;
const objectHand = (): Handedness => useSettings.getState().handObject;
const VERTEX_RADIUS = 0.06;


export function HandControls() {
    const camera = useThree((s) => s.camera);
    const size = useThree((s) => s.size);
    const scene = useThree((s) => s.scene);
    const controls = useThree((s) => s.controls) as CameraControls | null;
    const intents = useRef(new IntentTracker());
    const drag = useRef<Drag | null>(null);
    const raycaster = useRef(new THREE.Raycaster());
    const lastHands = useRef(live.hands);

    // Hand positions are shares of the window; the view starts below the top bar.
    const aim = (x: number, y: number) => {
        const [vx, vy] = windowToView(x, y);
        raycaster.current.setFromCamera(new THREE.Vector2(vx * 2 - 1, -(vy * 2 - 1)), camera);
    };

    function pick(x: number, y: number) {
        aim(x, y);
        const ids = new Set(useScene.getState().doc.objects.map((o) => o.id));
        return raycaster.current.intersectObjects(scene.children, false).find((i) => ids.has(i.object.name));
    }

    function vertexAt(x: number, y: number) {
        const state = useScene.getState();
        const selected = state.doc.objects.find((o) => o.id === state.selectedId);
        if (state.mode !== "edit" || !selected) return null;
        const [vx, vy] = windowToView(x, y);
        const ndc = new THREE.Vector2(vx * 2 - 1, -(vy * 2 - 1));
        const hit = nearestVertex(selected, camera, ndc, size.width / size.height, VERTEX_RADIUS);
        return hit ? { object: selected, ...hit } : null;
    }

    function hover() {
        // A hand that's over the interface points at a control instead of the scene.
        for (const hand of ["Left", "Right"] as const) {
            const h = live.hands.find((x) => x.handedness === hand);
            if (!h) hoverControl(hand, null);
            else if (!h.pinching) hoverControl(hand, controlAt(h.x, h.y));
        }
        const h = live.hands.find((hand) => hand.handedness === objectHand() && !hand.pinching && !controlAt(hand.x, hand.y));
        const idle = h && useScene.getState().mode !== "render" && !drag.current;
        const vertex = idle ? vertexAt(h.x, h.y) : null;
        const id = idle && !vertex ? pick(h.x, h.y)?.object.name ?? null : null;
        if (useHandHover.getState().hoveredId !== id) useHandHover.setState({ hoveredId: id });
        const index = vertex?.index ?? null;
        if (useEditSelection.getState().hoverVertex !== index) useEditSelection.setState({ hoverVertex: index });
    }

    function start(handedness: Handedness, x: number, y: number) {
        // Pinching over a button presses it, and the pinch does nothing else.
        const control = controlAt(x, y);
        if (control) {
            drag.current = null;
            pressControl(control);
            return;
        }
        drag.current = { kind: "orbit" };
        if (handedness !== objectHand()) return;
        const vertex = vertexAt(x, y);
        if (vertex) {
            const mesh = editableMesh(vertex.object.geometry);
            useEditSelection.getState().setVertices([vertex.index]);
            drag.current = {
                kind: "vertex",
                id: vertex.object.id,
                index: vertex.index,
                plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), vertex.world),
                inverse: objectMatrix(vertex.object).invert(),
                positions: mesh.positions.slice(),
                indices: mesh.indices,
            };
            return;
        }
        const state = useScene.getState();
        const hit = pick(x, y);
        if (!hit || state.mode === "render") return;
        state.select(hit.object.name);
        if (state.mode !== "object") return;
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), hit.object.position);
        const onPlane = raycaster.current.ray.intersectPlane(plane, new THREE.Vector3());
        if (onPlane)
            drag.current = {
                kind: "object",
                id: hit.object.name,
                plane,
                offset: hit.object.position.clone().sub(onPlane),
                reach: camera.position.distanceTo(hit.object.position),
            };
    }

    function move(x: number, y: number, dx: number, dy: number, depth = 0) {
        const d = drag.current;
        if (d?.kind === "orbit") {
            const speed = ORBIT_SPEED * useSettings.getState().handOrbitSpeed;
            controls?.rotate(-dx * speed, -dy * speed, false);
            return;
        }
        if (d?.kind === "vertex") {
            aim(x, y);
            const p = raycaster.current.ray.intersectPlane(d.plane, new THREE.Vector3());
            if (!p) return;
            const { enabled, translate } = useScene.getState().snap;
            if (enabled) p.set(...(p.toArray().map((v) => Math.round(v / translate) * translate) as [number, number, number]));
            const local = p.applyMatrix4(d.inverse);
            const positions = d.positions.slice();
            positions.splice(d.index * 3, 3, local.x, local.y, local.z);
            useScene
                .getState()
                .run({ type: "geometry", target: d.id, geometry: { type: "mesh", positions, indices: d.indices } }, { coalesce: `vertex:${d.id}` });
            return;
        }
        if (d?.kind !== "object") return;
        aim(x, y);
        // Bringing the hand closer to the camera pulls the object closer, and
        // pushing it away sends the object back, scaled to how far away the
        // object is. The object stays under the pinch either way.
        const pull = Math.min(depth * DEPTH_GAIN * d.reach, d.reach * 0.9);
        const plane = d.plane.clone().translate(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-pull));
        const p = raycaster.current.ray.intersectPlane(plane, new THREE.Vector3());
        if (!p) return;
        p.add(d.offset);
        const state = useScene.getState();
        const { enabled, translate } = state.snap;
        const s = (v: number) => (enabled ? Math.round(v / translate) * translate : v);
        state.run({ type: "transform", target: d.id, position: [s(p.x), s(p.y), s(p.z)] }, { coalesce: `hand:${d.id}` });
    }

    // A two-hand pinch without a held object moves the camera.
    const pairing = useRef(false);
    function report() {
        const kind = drag.current?.kind;
        const activity: HandActivity = kind ?? (pairing.current ? "camera" : null);
        if (useHandActivity.getState().activity !== activity) useHandActivity.setState({ activity });
    }

    function pairStart(holding: Handedness | null) {
        pairing.current = true;
        const d = drag.current;
        const object = d?.kind === "object" && holding ? useScene.getState().doc.objects.find((o) => o.id === d.id) : undefined;
        drag.current = object ? { kind: "stretch", id: object.id, scale: object.scale, rotation: object.rotation, factor: 1, twist: 0 } : null;
    }

    function stretch(scale: number, twist: number) {
        const d = drag.current;
        if (d?.kind !== "stretch") return;
        d.factor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, d.factor * scale));
        d.twist += twist;
        const state = useScene.getState();
        const next = stretched(d, d.factor, d.twist, state.snap.enabled ? state.snap.rotate : null);
        state.run({ type: "transform", target: d.id, ...next }, { coalesce: `hand:${d.id}` });
    }

    function end() {
        pairing.current = false;
        const kind = drag.current?.kind;
        if (kind === "object" || kind === "vertex" || kind === "stretch") useScene.getState().endCoalesce();
        drag.current = null;
    }

    useEffect(() => clearControls, []);

    useFrame(() => {
        if (live.hands === lastHands.current) return;
        lastHands.current = live.hands;
        const pending = intents.current.update(live.hands);
        // The hand menu owns the hands while it's open. Intents are still read
        // so the pinch that picks from the menu doesn't start a drag after.
        if (useHandMenu.getState().open) {
            if (drag.current) end();
            clearControls();
            if (useHandHover.getState().hoveredId !== null) useHandHover.setState({ hoveredId: null });
            report();
            return;
        }
        for (const intent of pending) {
            if (intent.type === "start") {
                const spent = useHandMenu.getState().spent;
                const pinchId = live.hands.find((h) => h.handedness === intent.handedness)?.pinchId;
                if (spent?.handedness === intent.handedness && spent.pinchId === pinchId) drag.current = null;
                else start(intent.handedness, intent.x, intent.y);
            }
            else if (intent.type === "move") move(intent.x, intent.y, intent.dx, intent.dy, intent.depth);
            else if (intent.type === "end") end();
            else if (intent.type === "pairStart") pairStart(intent.holding);
            else if (drag.current?.kind === "stretch") stretch(intent.scale, intent.twist);
            else if (controls) {
                controls.dolly(intent.zoom * ZOOM_SPEED * useSettings.getState().handZoomSpeed, false);
                controls.truck(-intent.panX * PAN_SPEED, -intent.panY * PAN_SPEED, false);
            }
        }
        hover();
        report();
    });

    return null;
}
