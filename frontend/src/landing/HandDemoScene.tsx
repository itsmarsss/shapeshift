import { useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { live } from "../hands/tracker";
import { Studio } from "./Studio";

// A few shapes to pick up with a pinch, for trying hand tracking on the
// landing page. The visitor's own hand is drawn as the tracker sees it: 21
// points and the bones between them. Reads the same tracker the editor uses.

const SHAPES = [
    { kind: "box", color: "#4f7bff", at: [-1.7, 0.45, 0] },
    { kind: "sphere", color: "#ec4899", at: [0, 0.5, 0.2] },
    { kind: "cone", color: "#f5a524", at: [1.7, 0.55, -0.1] },
] as const;

// MediaPipe's hand: which landmarks the bones join.
const BONES: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
const TIPS = new Set([4, 8, 12, 16, 20]);

// How far across and up the camera's view reaches, in scene units.
const REACH_X = 7;
const REACH_Y = 4.4;
const GRAB_RADIUS = 0.85;
const HAND_SCALE = 1.8;
const UP = new THREE.Vector3(0, 1, 0);

export type DemoStatus = { state: "idle" | "near" | "holding" | "none" };

// A landmark (0 to 1 across and down the camera image) as a point in the
// scene, mirrored so the hand moves like a reflection.
function toScene(l: number[], i: number, out: THREE.Vector3) {
    return out.set((0.5 - l[i * 3]) * REACH_X, (0.5 - l[i * 3 + 1]) * REACH_Y + 1.5, 0.9 - l[i * 3 + 2] * REACH_X * 0.6);
}

function Scene({ status }: { status: MutableRefObject<DemoStatus> }) {
    const meshes = useRef<(THREE.Mesh | null)[]>([]);
    const joints = useRef<THREE.InstancedMesh>(null);
    const bones = useRef<THREE.InstancedMesh>(null);
    const spark = useRef<THREE.Mesh>(null);
    const held = useRef<number | null>(null);
    // The shape close enough to grab, if any.
    const reach = useRef<number | null>(null);
    const points = useMemo(() => Array.from({ length: 21 }, () => new THREE.Vector3()), []);
    const pinchAt = useMemo(() => new THREE.Vector3(), []);
    const matrix = useMemo(() => new THREE.Object3D(), []);

    useFrame((_, dt) => {
        const frame = live.frames.find((f) => f.handedness === "Right") ?? live.frames[0];
        const hand = frame && live.hands.find((h) => h.handedness === frame.handedness);
        const seen = Boolean(frame?.landmarks?.length);
        if (joints.current) joints.current.visible = seen;
        if (bones.current) bones.current.visible = seen;
        if (spark.current) spark.current.visible = seen;

        if (!seen || !frame) {
            held.current = null;
            reach.current = null;
            status.current.state = "none";
        } else {
            points.forEach((p, i) => toScene(frame.landmarks, i, p));
            // Drawn larger than life around the palm, so it's easy to see.
            const palm = points[9].clone();
            points.forEach((p) => p.sub(palm).multiplyScalar(HAND_SCALE).add(palm));
            points.forEach((p, i) => {
                matrix.position.copy(p);
                matrix.quaternion.identity();
                matrix.scale.setScalar(TIPS.has(i) ? 0.075 : 0.06);
                matrix.updateMatrix();
                joints.current?.setMatrixAt(i, matrix.matrix);
            });
            BONES.forEach(([a, b], i) => {
                const d = points[b].clone().sub(points[a]);
                matrix.position.copy(points[a]).addScaledVector(d, 0.5);
                matrix.quaternion.setFromUnitVectors(UP, d.clone().normalize());
                matrix.scale.set(0.03, d.length(), 0.03);
                matrix.updateMatrix();
                bones.current?.setMatrixAt(i, matrix.matrix);
            });
            if (joints.current) joints.current.instanceMatrix.needsUpdate = true;
            if (bones.current) bones.current.instanceMatrix.needsUpdate = true;

            // Between the thumb and index tips is what grabs.
            pinchAt.copy(points[4]).add(points[8]).multiplyScalar(0.5);
            const pinching = Boolean(hand?.pinching);
            if (spark.current) {
                spark.current.position.copy(pinchAt);
                spark.current.scale.lerp(new THREE.Vector3().setScalar(pinching ? 0.16 : 0.08), Math.min(1, dt * 14));
                (spark.current.material as THREE.MeshStandardMaterial).emissiveIntensity = pinching ? 2 : 0.6;
            }

            let near: number | null = null;
            let best = GRAB_RADIUS;
            meshes.current.forEach((m, i) => {
                const d = m ? m.position.distanceTo(pinchAt) : Infinity;
                if (d < best) {
                    best = d;
                    near = i;
                }
            });
            reach.current = near;
            if (pinching && held.current === null && near !== null) held.current = near;
            if (!pinching) held.current = null;
            status.current.state = held.current !== null ? "holding" : near !== null ? "near" : "idle";
        }

        meshes.current.forEach((m, i) => {
            if (!m) return;
            const holding = held.current === i;
            // Held shapes follow the pinch; let go, they settle back on the floor.
            const goal = holding ? pinchAt : new THREE.Vector3(m.position.x, SHAPES[i].at[1], m.position.z * 0.9);
            m.position.lerp(goal, Math.min(1, dt * (holding ? 16 : 5)));
            m.rotation.y += dt * (holding ? 2.2 : 0.35);
            const s = holding ? 1.12 : held.current === null && reach.current === i ? 1.08 : 1;
            m.scale.lerp(new THREE.Vector3(s, s, s), Math.min(1, dt * 10));
        });
    });

    return (
        <>
            {SHAPES.map((s, i) =>
                s.kind === "box" ? (
                    <RoundedBox key={s.kind} ref={(m: THREE.Mesh | null) => void (meshes.current[i] = m)} args={[0.85, 0.85, 0.85]} radius={0.12} position={[...s.at]} castShadow>
                        <meshStandardMaterial color={s.color} roughness={0.5} />
                    </RoundedBox>
                ) : (
                    <mesh key={s.kind} ref={(m) => void (meshes.current[i] = m)} position={[...s.at]} castShadow>
                        {s.kind === "sphere" ? <sphereGeometry args={[0.5, 48, 32]} /> : <coneGeometry args={[0.5, 1.1, 48]} />}
                        <meshStandardMaterial color={s.color} roughness={0.5} />
                    </mesh>
                ),
            )}
            <instancedMesh ref={joints} args={[undefined, undefined, 21]} visible={false}>
                <sphereGeometry args={[1, 14, 10]} />
                <meshStandardMaterial color="#ffffff" roughness={0.35} />
            </instancedMesh>
            <instancedMesh ref={bones} args={[undefined, undefined, BONES.length]} visible={false}>
                <cylinderGeometry args={[1, 1, 1, 10]} />
                <meshStandardMaterial color="#c9d6ff" roughness={0.4} />
            </instancedMesh>
            <mesh ref={spark} visible={false}>
                <sphereGeometry args={[1, 18, 12]} />
                <meshStandardMaterial color="#5b84ff" emissive="#5b84ff" emissiveIntensity={0.6} />
            </mesh>
            <ContactShadows position={[0, 0, 0]} opacity={0.35} scale={12} blur={2.4} far={4} />
        </>
    );
}

export default function HandDemoScene({ status }: { status: MutableRefObject<DemoStatus> }) {
    return (
        <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 2.6, 7], fov: 40 }} gl={{ alpha: true, antialias: true }} onCreated={({ camera }) => camera.lookAt(0, 1, 0)}>
            <Studio />
            <Scene status={status} />
        </Canvas>
    );
}
