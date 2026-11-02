import { useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Grid, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { live } from "../hands/tracker";
import type { Handedness } from "../hands/gestures";
import { Studio } from "./Studio";

// A small ShapeShift to try hand control in, on the landing page. It works
// like the editor: point and pinch to grab a shape, reach toward the screen
// to push it away, let go to drop it; pinch empty space to turn the view, and
// pinch with both hands to zoom.

export type DemoState = "none" | "idle" | "near" | "holding" | "orbit" | "zoom";
export type DemoStatus = { state: DemoState };

type Kind = "box" | "sphere" | "cone" | "torus" | "cylinder";
const SHAPES: { kind: Kind; color: string; at: [number, number, number] }[] = [
    { kind: "box", color: "#4f7bff", at: [-2.2, 0.45, 0.2] },
    { kind: "sphere", color: "#ec4899", at: [-0.9, 0.5, -0.6] },
    { kind: "cone", color: "#f5a524", at: [0.4, 0.55, 0.5] },
    { kind: "torus", color: "#22c55e", at: [1.6, 0.55, -0.5] },
    { kind: "cylinder", color: "#a855f7", at: [2.6, 0.45, 0.6] },
];

const ORBIT_SPEED = Math.PI * 1.4;
const ZOOM_SPEED = 9;
// How far a held shape moves per meter the hand moves toward or away, as a share of its distance.
const DEPTH_GAIN = 2.5;
const DEPTH_DEAD_ZONE = 0.03;
const TARGET = new THREE.Vector3(0, 0.5, 0);

type Hold = { index: number; plane: THREE.Plane; offset: THREE.Vector3; reach: number; startDepth: number | null; pinchId: number; hand: Handedness };

function Shape({ kind, color, at, meshRef }: { kind: Kind; color: string; at: [number, number, number]; meshRef: (m: THREE.Mesh | null) => void }) {
    const material = <meshStandardMaterial color={color} roughness={0.45} emissive={color} emissiveIntensity={0} />;
    if (kind === "box")
        return (
            <RoundedBox ref={meshRef} args={[0.9, 0.9, 0.9]} radius={0.08} position={at} castShadow>
                {material}
            </RoundedBox>
        );
    return (
        <mesh ref={meshRef} position={at} castShadow>
            {kind === "sphere" && <sphereGeometry args={[0.5, 48, 32]} />}
            {kind === "cone" && <coneGeometry args={[0.5, 1.1, 48]} />}
            {kind === "torus" && <torusGeometry args={[0.4, 0.15, 24, 64]} />}
            {kind === "cylinder" && <cylinderGeometry args={[0.42, 0.42, 0.9, 48]} />}
            {material}
        </mesh>
    );
}

// The hand cursor, as in the editor: a soft ring that tightens when it pinches.
function Cursor({ group }: { group: (g: THREE.Group | null) => void }) {
    return (
        <group ref={group} visible={false}>
            {/* Drawn over the scene, so a shape never hides it. */}
            <mesh renderOrder={10}>
                <torusGeometry args={[0.26, 0.035, 12, 56]} />
                <meshBasicMaterial color="#6b8dff" depthTest={false} transparent />
            </mesh>
            <mesh scale={0.055} renderOrder={10}>
                <sphereGeometry args={[1, 16, 12]} />
                <meshBasicMaterial color="#ffffff" depthTest={false} transparent />
            </mesh>
        </group>
    );
}

function Playground({ status }: { status: MutableRefObject<DemoStatus> }) {
    const camera = useThree((s) => s.camera);
    const meshes = useRef<(THREE.Mesh | null)[]>([]);
    const cursors = useRef<Record<Handedness, THREE.Group | null>>({ Left: null, Right: null });
    const hold = useRef<Hold | null>(null);
    const seen = useRef<Record<Handedness, number>>({ Left: -1, Right: -1 });
    const last = useRef<Record<Handedness, { x: number; y: number } | null>>({ Left: null, Right: null });
    const pair = useRef<number | null>(null);
    const view = useRef({ azimuth: 0.35, polar: 1.12, distance: 8.5 });
    const ray = useMemo(() => new THREE.Raycaster(), []);

    const aim = (x: number, y: number) => ray.setFromCamera(new THREE.Vector2(x * 2 - 1, -(y * 2 - 1)), camera);
    const shapeAt = (x: number, y: number) => {
        aim(x, y);
        const hit = ray.intersectObjects(meshes.current.filter(Boolean) as THREE.Mesh[], false)[0];
        return hit ? meshes.current.indexOf(hit.object as THREE.Mesh) : -1;
    };

    useFrame((_, dt) => {
        const hands = live.hands;
        const pinching = hands.filter((h) => h.pinching);
        let state: DemoState = hands.length ? "idle" : "none";
        let hovered = -1;

        // Both hands pinching: zoom by spreading them.
        if (pinching.length >= 2 && !hold.current) {
            const [a, b] = pinching;
            const spread = Math.hypot(a.x - b.x, a.y - b.y);
            if (pair.current !== null) view.current.distance = THREE.MathUtils.clamp(view.current.distance - (spread - pair.current) * ZOOM_SPEED, 4, 14);
            pair.current = spread;
            state = "zoom";
        } else pair.current = null;

        for (const h of hands) {
            const prev = last.current[h.handedness];
            last.current[h.handedness] = { x: h.x, y: h.y };
            if (h.pinching && seen.current[h.handedness] !== h.pinchId) {
                seen.current[h.handedness] = h.pinchId;
                const index = pinching.length < 2 ? shapeAt(h.x, h.y) : -1;
                const mesh = meshes.current[index];
                if (mesh && !hold.current) {
                    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), mesh.position);
                    aim(h.x, h.y);
                    const onPlane = ray.ray.intersectPlane(plane, new THREE.Vector3()) ?? mesh.position.clone();
                    hold.current = {
                        index,
                        plane,
                        offset: mesh.position.clone().sub(onPlane),
                        reach: camera.position.distanceTo(mesh.position),
                        startDepth: h.depth,
                        pinchId: h.pinchId,
                        hand: h.handedness,
                    };
                }
            }
            const held = hold.current;
            if (held && held.hand === h.handedness) {
                if (!h.pinching || h.pinchId !== held.pinchId) hold.current = null;
                else {
                    // Reaching toward the screen pushes the shape away, as in the editor.
                    let depth = held.startDepth !== null && h.depth !== null ? held.startDepth - h.depth : 0;
                    depth = Math.abs(depth) < DEPTH_DEAD_ZONE ? 0 : depth - Math.sign(depth) * DEPTH_DEAD_ZONE;
                    const push = THREE.MathUtils.clamp(depth * DEPTH_GAIN * held.reach, -held.reach * 0.7, held.reach * 2);
                    const plane = held.plane.clone().translate(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(push));
                    aim(h.x, h.y);
                    const p = ray.ray.intersectPlane(plane, new THREE.Vector3());
                    const mesh = meshes.current[held.index];
                    if (p && mesh) {
                        p.add(held.offset);
                        p.y = Math.max(p.y, SHAPES[held.index].at[1]);
                        mesh.position.lerp(p, Math.min(1, dt * 18));
                    }
                    state = "holding";
                }
            } else if (h.pinching && pinching.length === 1 && prev && !hold.current) {
                // One hand pinching empty space turns the view.
                view.current.azimuth -= (h.x - prev.x) * ORBIT_SPEED;
                view.current.polar = THREE.MathUtils.clamp(view.current.polar - (h.y - prev.y) * ORBIT_SPEED, 0.45, 1.45);
                state = "orbit";
            } else if (!h.pinching && !hold.current) {
                const index = shapeAt(h.x, h.y);
                if (index >= 0) {
                    hovered = index;
                    state = "near";
                }
            }

            // The ring floats a little in front of the scene, under the hand.
            const ring = cursors.current[h.handedness];
            if (ring) {
                aim(h.x, h.y);
                ring.visible = true;
                ring.position.copy(ray.ray.at(camera.position.distanceTo(TARGET) * 0.75, new THREE.Vector3()));
                ring.lookAt(camera.position);
                ring.scale.lerp(new THREE.Vector3().setScalar(h.pinching ? 0.7 : 1), Math.min(1, dt * 16));
            }
        }
        for (const side of ["Left", "Right"] as const) {
            if (hands.some((h) => h.handedness === side)) continue;
            const ring = cursors.current[side];
            if (ring) ring.visible = false;
            last.current[side] = null;
            if (hold.current?.hand === side) hold.current = null;
        }

        meshes.current.forEach((m, i) => {
            if (!m) return;
            const rest = SHAPES[i].at[1];
            const held = hold.current?.index === i;
            // Let go, a shape drops back down to the floor.
            if (!held) m.position.y += (rest - m.position.y) * Math.min(1, dt * 6);
            m.rotation.y += dt * (held ? 1.6 : 0.25);
            const material = m.material as THREE.MeshStandardMaterial;
            material.emissiveIntensity += ((held ? 0.35 : hovered === i ? 0.22 : 0) - material.emissiveIntensity) * Math.min(1, dt * 12);
            const s = held ? 1.08 : 1;
            m.scale.lerp(new THREE.Vector3(s, s, s), Math.min(1, dt * 10));
        });

        const v = view.current;
        camera.position.set(
            TARGET.x + v.distance * Math.sin(v.polar) * Math.sin(v.azimuth),
            TARGET.y + v.distance * Math.cos(v.polar),
            TARGET.z + v.distance * Math.sin(v.polar) * Math.cos(v.azimuth),
        );
        camera.lookAt(TARGET);
        status.current.state = state;
    });

    return (
        <>
            {SHAPES.map((s, i) => (
                <Shape key={s.kind} kind={s.kind} color={s.color} at={s.at} meshRef={(m) => void (meshes.current[i] = m)} />
            ))}
            <Cursor group={(g) => void (cursors.current.Left = g)} />
            <Cursor group={(g) => void (cursors.current.Right = g)} />
            <Grid
                args={[30, 30]}
                cellSize={0.5}
                cellThickness={0.6}
                cellColor="#9aa3b5"
                sectionSize={2.5}
                sectionThickness={1}
                sectionColor="#6b8dff"
                fadeDistance={22}
                fadeStrength={1.6}
                infiniteGrid
            />
            <ContactShadows position={[0, 0.005, 0]} opacity={0.4} scale={14} blur={2.2} far={4} />
        </>
    );
}

export default function HandDemoScene({ status }: { status: MutableRefObject<DemoStatus> }) {
    return (
        <Canvas shadows dpr={[1, 2]} camera={{ position: [3, 4, 7.5], fov: 40 }} gl={{ alpha: true, antialias: true }}>
            <Studio />
            <Playground status={status} />
        </Canvas>
    );
}
