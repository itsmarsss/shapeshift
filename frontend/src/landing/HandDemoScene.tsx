import { useRef, type MutableRefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { live } from "../hands/tracker";

// A few shapes to pick up with a pinch, for trying hand tracking on the
// landing page. Reads the same tracker the editor uses.

const SHAPES = [
    { kind: "box", color: "#4f7bff", at: [-1.6, 0.45, 0] },
    { kind: "sphere", color: "#ec4899", at: [0, 0.5, 0.2] },
    { kind: "cone", color: "#f5a524", at: [1.6, 0.55, -0.1] },
] as const;

// How far across and up the hand reaches, in scene units.
const REACH_X = 6.4;
const REACH_Y = 3.6;
const GRAB_RADIUS = 0.9;

export type DemoStatus = { state: "idle" | "near" | "holding" | "none" };

function Shapes({ status }: { status: MutableRefObject<DemoStatus> }) {
    const meshes = useRef<(THREE.Mesh | null)[]>([]);
    const cursor = useRef<THREE.Mesh>(null);
    const held = useRef<number | null>(null);
    const target = useRef(new THREE.Vector3());

    useFrame((_, dt) => {
        const hand = live.hands.find((h) => h.handedness === "Right") ?? live.hands[0];
        const c = cursor.current;
        if (!hand || !c) {
            if (c) c.visible = false;
            held.current = null;
            status.current.state = "none";
        } else {
            c.visible = true;
            target.current.set((hand.x - 0.5) * REACH_X, (0.5 - hand.y) * REACH_Y + 1.2, 0.6);
            c.position.lerp(target.current, Math.min(1, dt * 18));
            c.scale.setScalar(hand.pinching ? 0.7 : 1);

            // The nearest shape, if the hand is close enough to take it.
            let near: number | null = null;
            let best = GRAB_RADIUS;
            meshes.current.forEach((m, i) => {
                const d = m ? m.position.distanceTo(c.position) : Infinity;
                if (d < best) {
                    best = d;
                    near = i;
                }
            });
            if (hand.pinching && held.current === null && near !== null) held.current = near;
            if (!hand.pinching) held.current = null;
            status.current.state = held.current !== null ? "holding" : near !== null ? "near" : "idle";
        }

        meshes.current.forEach((m, i) => {
            if (!m) return;
            const holding = held.current === i;
            // Held shapes follow the hand; let go, they settle back on the floor.
            const goal = holding && c ? c.position : new THREE.Vector3(m.position.x, SHAPES[i].at[1], m.position.z * 0.9);
            m.position.lerp(goal, Math.min(1, dt * (holding ? 14 : 5)));
            m.rotation.y += dt * (holding ? 2.4 : 0.4);
            const s = holding ? 1.15 : 1;
            m.scale.lerp(new THREE.Vector3(s, s, s), Math.min(1, dt * 10));
        });
    });

    return (
        <>
            {SHAPES.map((s, i) => (
                <mesh key={s.kind} ref={(m) => void (meshes.current[i] = m)} position={[...s.at]} castShadow>
                    {s.kind === "box" && <boxGeometry args={[0.85, 0.85, 0.85]} />}
                    {s.kind === "sphere" && <sphereGeometry args={[0.5, 40, 24]} />}
                    {s.kind === "cone" && <coneGeometry args={[0.5, 1.1, 32]} />}
                    <meshStandardMaterial color={s.color} roughness={0.4} />
                </mesh>
            ))}
            <mesh ref={cursor} visible={false}>
                <torusGeometry args={[0.2, 0.045, 12, 40]} />
                <meshStandardMaterial color="#ffffff" emissive="#9db4ff" emissiveIntensity={0.8} />
            </mesh>
            <ContactShadows position={[0, 0, 0]} opacity={0.35} scale={10} blur={2.4} far={4} />
        </>
    );
}

export default function HandDemoScene({ status }: { status: MutableRefObject<DemoStatus> }) {
    return (
        <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 2.4, 6.4], fov: 38 }} gl={{ alpha: true, antialias: true }} onCreated={({ camera }) => camera.lookAt(0, 0.9, 0)}>
            <hemisphereLight args={["#ffffff", "#8a8fa3", 1.1]} />
            <directionalLight position={[3, 7, 5]} intensity={2.2} castShadow />
            <Shapes status={status} />
        </Canvas>
    );
}
