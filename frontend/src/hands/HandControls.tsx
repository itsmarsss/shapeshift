import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { CameraControls } from "@react-three/drei";
import * as THREE from "three";
import { useScene } from "../scene/store";
import type { Handedness } from "./gestures";
import { IntentTracker } from "./intents";
import { live, useHandHover } from "./tracker";
import { handToast, useHandActivity, useHandMenu, type HandActivity } from "./menu";
import { editableMesh } from "../scene/geometry";
import { nearestVertex, objectMatrix, useEditSelection } from "../viewport/editSelection";
import { useSettings } from "../settings/store";
import type { Vec3 } from "@shapeshift/shared/scene/schema";
import { MAX_FACTOR, MIN_FACTOR, stretched } from "./stretch";
import { clearControls, hoverControl, hoveredControl, interfaceAt, isSlider, magnetAt, pressControl, pullToShape, scrollerFor, slideTo } from "./pointer";
import { windowToView } from "../viewport/frame";
import { handHandles, handleNear, type HandleSet } from "../viewport/handHandles";

type Drag =
    | { kind: "object"; id: string; plane: THREE.Plane; offset: THREE.Vector3; reach: number }
    | { kind: "vertex"; id: string; index: number; plane: THREE.Plane; inverse: THREE.Matrix4; positions: number[]; indices: number[] }
    // One hand held an object and the other joined: spreading the hands
    // scales it and twisting them turns it about its upright axis.
    // `tap` is where and when the second hand's pinch began: let go again
    // quickly, without stretching, it's a tap rather than a stretch.
    | { kind: "stretch"; id: string; scale: Vec3; rotation: Vec3; factor: number; twist: number; tap: { at: number; x: number; y: number } | null }
    | { kind: "orbit" }
    // A size handle or a gizmo handle, held as a mouse would; `dx, dy` is how
    // far the handle sat from the hand when grabbed, in pixels.
    | { kind: "handle"; set: HandleSet; dx: number; dy: number }
    // A pinch on the interface: dragging a slider, or scrolling a panel. A
    // pinch that doesn't move presses what it started on when it lets go.
    | { kind: "slider"; el: HTMLInputElement }
    | { kind: "ui"; control: HTMLElement | null; scroller: HTMLElement | null; x: number; y: number; moved: boolean };

// How far an object moves, as a share of its distance, per meter the hand moves toward or away from the camera.
const DEPTH_GAIN = 2.5;
const ORBIT_SPEED = Math.PI * 1.5;
const ZOOM_SPEED = 12;
const PAN_SPEED = 6;
const objectHand = (): Handedness => useSettings.getState().handObject;
const VERTEX_RADIUS = 0.06;
// A second-hand pinch shorter than this, while the other holds a shape, is a tap.
const TAP_MS = 400;
// How close, in pixels, the hand must come to a shape for it to count as pointed at.
const SHAPE_MAGNET = 36;
// How close, in pixels, the hand must come to a handle (gizmo arrows, size boxes) to snap onto it.
const HANDLE_MAGNET = 40;
// How far, in pixels, a pinch on a button can drift and still press it.
const PRESS_SLOP = 28;


export function HandControls() {
    const camera = useThree((s) => s.camera);
    const size = useThree((s) => s.size);
    const scene = useThree((s) => s.scene);
    const gl = useThree((s) => s.gl);
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

    // The shape under the hand, or failing that the one it's close to on
    // screen, so a hand needn't be exactly on it. A shape already pointed at
    // holds on a little further out.
    function shapeAt(x: number, y: number, current: string | null, pull?: Handedness): string | null {
        if (pull) pullToShape(pull, null);
        const hit = pick(x, y)?.object.name;
        if (hit) return hit;
        const [vx, vy] = windowToView(x, y);
        const px = vx * size.width;
        const py = vy * size.height;
        const fov = ((camera as THREE.PerspectiveCamera).fov ?? 45) * (Math.PI / 180);
        let best: string | null = null;
        let bestGap = Infinity;
        let bestAt: [number, number] | null = null;
        for (const o of useScene.getState().doc.objects) {
            const mesh = scene.getObjectByName(o.id) as THREE.Mesh | undefined;
            if (!mesh?.geometry) continue;
            if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
            const sphere = mesh.geometry.boundingSphere!.clone().applyMatrix4(mesh.matrixWorld);
            const p = sphere.center.clone().project(camera);
            if (p.z > 1) continue;
            const distance = camera.position.distanceTo(sphere.center);
            const radius = (sphere.radius / distance) * (size.height / 2 / Math.tan(fov / 2));
            const g = Math.max(0, Math.hypot((p.x + 1) / 2 * size.width - px, (1 - p.y) / 2 * size.height - py) - radius);
            const strength = SHAPE_MAGNET * useSettings.getState().handMagnet;
            const reach = o.id === current ? strength * 1.6 : strength;
            if (g <= reach && g < bestGap) {
                best = o.id;
                bestGap = g;
                bestAt = [((p.x + 1) / 2) * size.width, ((1 - p.y) / 2) * size.height];
            }
        }
        // Draw the cursor most of the way to its edge, so the snap shows.
        if (pull && bestAt) {
            const rect = gl.domElement.getBoundingClientRect();
            pullToShape(pull, [rect.left + px + (bestAt[0] - px) * 0.55, rect.top + py + (bestAt[1] - py) * 0.55]);
        }
        return best;
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
            else if (!h.pinching) hoverControl(hand, magnetAt(hand, h.x, h.y));
        }
        const h = live.hands.find((hand) => hand.handedness === objectHand() && !hand.pinching && !hoveredControl(hand.handedness));
        const idle = h && useScene.getState().mode !== "render" && !drag.current;
        // Handles come first: they sit on top of the shape they change.
        const near = idle ? handleAt(h) : null;
        // A hand closing its fingers on a handle keeps it until the pinch starts a drag.
        const closing = !drag.current && live.hands.some((x) => x.handedness === objectHand() && x.pinching);
        if (drag.current?.kind !== "handle" && !closing) setNearHandle(near);
        const vertex = idle && !near ? vertexAt(h.x, h.y) : null;
        const id = idle && !vertex && !near ? shapeAt(h.x, h.y, useHandHover.getState().hoveredId, h.handedness) : null;
        // The cursor stays snapped to a handle that's near or being dragged.
        const held = drag.current?.kind === "handle" ? objectHand() : near?.hand;
        if (!id) for (const side of ["Left", "Right"] as const) if (side !== held) pullToShape(side, null);
        if (useHandHover.getState().hoveredId !== id) useHandHover.setState({ hoveredId: id });
        const index = vertex?.index ?? null;
        if (useEditSelection.getState().hoverVertex !== index) useEditSelection.setState({ hoverVertex: index });
    }

    // The handle the hand is near, snapping the cursor onto it. One it's
    // already on holds it a little further out.
    function handleAt(h: { handedness: Handedness; x: number; y: number }) {
        const px = h.x * window.innerWidth;
        const py = h.y * window.innerHeight;
        const strength = HANDLE_MAGNET * useSettings.getState().handMagnet;
        const was = handHandles.near[h.handedness];
        let near = handleNear(px, py, strength);
        if (!near && was) {
            const again = handleNear(px, py, strength * 1.6);
            if (again?.set === was.set && again.point.key === was.point.key) near = again;
        }
        pullToShape(h.handedness, near ? [near.point.x, near.point.y] : null);
        return near ? { ...near, hand: h.handedness } : null;
    }

    function setNearHandle(near: (ReturnType<typeof handleAt> & {}) | null) {
        const hand = objectHand();
        const was = handHandles.near[hand];
        if (was && (was.set !== near?.set || was.point.key !== near.point.key)) was.set.hover(null);
        if (near && (was?.set !== near.set || was.point.key !== near.point.key)) near.set.hover(near.point.key);
        handHandles.near[hand] = near;
    }

    function start(handedness: Handedness, x: number, y: number) {
        // A pinch over the interface works it like a finger on a touch screen.
        // The control the hand was on just before pinching counts, since
        // closing the fingers nudges the point.
        const control = hoveredControl(handedness);
        // A handle the hand had snapped onto, ahead of anything but a button.
        const near = !control && handedness === objectHand() ? handHandles.near[handedness] : null;
        if (near && near.set.grab(near.point.key, near.point.x, near.point.y)) {
            drag.current = { kind: "handle", set: near.set, dx: near.point.x - x * window.innerWidth, dy: near.point.y - y * window.innerHeight };
            handHandles.active = { set: near.set, key: near.point.key };
            return;
        }
        const ui = control ?? interfaceAt(x, y);
        if (ui) {
            if (control && isSlider(control)) {
                drag.current = { kind: "slider", el: control };
                slideTo(control, x);
            } else drag.current = { kind: "ui", control, scroller: scrollerFor(ui), x, y, moved: false };
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
        // Likewise the shape it was pointing at.
        const id = useHandHover.getState().hoveredId ?? shapeAt(x, y, null);
        const target = id ? scene.getObjectByName(id) : undefined;
        if (!target || state.mode === "render") return;
        // Picking a held shape back up keeps whatever else is selected with it.
        if (!state.selectedIds.includes(target.name)) state.select(target.name);
        if (state.mode !== "object") return;
        aim(x, y);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), target.position);
        const onPlane = raycaster.current.ray.intersectPlane(plane, new THREE.Vector3());
        if (onPlane)
            drag.current = {
                kind: "object",
                id: target.name,
                plane,
                offset: target.position.clone().sub(onPlane),
                reach: camera.position.distanceTo(target.position),
            };
    }

    function move(x: number, y: number, dx: number, dy: number, depth = 0) {
        const d = drag.current;
        if (d?.kind === "slider") return slideTo(d.el, x);
        if (d?.kind === "handle") {
            const px = x * window.innerWidth + d.dx;
            const py = y * window.innerHeight + d.dy;
            pullToShape(objectHand(), [px, py]);
            return d.set.drag(px, py);
        }
        if (d?.kind === "ui") {
            // Past a small wobble it's a scroll, and no longer a press.
            if (!d.moved && Math.hypot((x - d.x) * window.innerWidth, (y - d.y) * window.innerHeight) > PRESS_SLOP) d.moved = true;
            if (d.moved && d.scroller) {
                d.scroller.scrollTop -= dy * window.innerHeight;
                d.scroller.scrollLeft -= dx * window.innerWidth;
            }
            return;
        }
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
        // Shared so the gesture guide can show how far the push or pull is.
        if (Math.abs(useHandActivity.getState().reach - depth) > 0.003) useHandActivity.setState({ reach: depth });
        // The camera sits at the screen, so reaching toward it reaches into the
        // scene and pushes the object away; pulling the hand back brings it
        // closer. Scaled to how far away the object is, and the object stays
        // under the pinch either way.
        // Never pulled past the camera, nor pushed off into the distance.
        const push = Math.min(Math.max(depth * DEPTH_GAIN * d.reach, -d.reach * 0.9), d.reach * 4);
        const plane = d.plane.clone().translate(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(push));
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
        const d = drag.current;
        const kind = d?.kind === "ui" ? (d.moved ? (d.scroller ? "scroll" : null) : d.control ? "press" : null) : d?.kind;
        const activity: HandActivity = kind ?? (pairing.current ? "camera" : null);
        if (useHandActivity.getState().activity !== activity) useHandActivity.setState({ activity, ...(activity === "object" ? {} : { reach: 0 }) });
    }

    function pairStart(holding: Handedness | null) {
        pairing.current = true;
        const d = drag.current;
        const object = d?.kind === "object" && holding ? useScene.getState().doc.objects.find((o) => o.id === d.id) : undefined;
        const other = live.hands.find((h) => h.handedness !== holding && h.pinching);
        drag.current = object
            ? {
                  kind: "stretch",
                  id: object.id,
                  scale: object.scale,
                  rotation: object.rotation,
                  factor: 1,
                  twist: 0,
                  tap: other ? { at: performance.now(), x: other.startX, y: other.startY } : null,
              }
            : null;
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

    // The free hand tapped while the other held a shape: on another shape it
    // adds that to the selection, on empty space it leaves a copy behind.
    function tapWhileHolding(d: Extract<Drag, { kind: "stretch" }>) {
        const state = useScene.getState();
        // Undo whatever small stretch the tap made.
        state.run({ type: "transform", target: d.id, scale: d.scale, rotation: d.rotation }, { coalesce: `hand:${d.id}` });
        state.endCoalesce();
        const other = d.tap && shapeAt(d.tap.x, d.tap.y, null);
        if (other && other !== d.id) {
            const adding = !state.selectedIds.includes(other);
            state.select(other, { toggle: true });
            // The held shape stays selected too.
            const now = useScene.getState();
            if (!now.selectedIds.includes(d.id)) now.select(d.id, { toggle: true });
            handToast(adding ? "Added to the selection" : "Taken out of the selection");
        } else {
            state.run({ type: "duplicate", target: d.id, offset: [0, 0, 0] }, { select: false });
            handToast("Copy placed");
        }
    }

    function end() {
        pairing.current = false;
        const d = drag.current;
        if (d?.kind === "ui" && !d.moved && d.control) pressControl(d.control);
        if (d?.kind === "stretch" && d.tap && performance.now() - d.tap.at < TAP_MS && Math.abs(d.factor - 1) < 0.06 && Math.abs(d.twist) < 0.1) {
            tapWhileHolding(d);
            drag.current = null;
            return;
        }
        if (d?.kind === "handle") {
            d.set.release();
            handHandles.active = null;
            pullToShape(objectHand(), null);
        }
        const kind = d?.kind;
        if (kind === "object" || kind === "vertex" || kind === "stretch") useScene.getState().endCoalesce();
        drag.current = null;
    }

    useEffect(
        () => () => {
            clearControls();
            setNearHandle(null);
        },
        [], // eslint-disable-line react-hooks/exhaustive-deps
    );

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
                // Twisting the hands, like turning a wheel, turns the view.
                controls.rotate(intent.twist * useSettings.getState().handOrbitSpeed, 0, false);
            }
        }
        hover();
        report();
    });

    return null;
}
