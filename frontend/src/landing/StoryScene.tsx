import { useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { TEMPLATES, buildTemplate } from "../scene/templates";
import { clayGeometry, clayMaterial } from "./clay";
import { Studio } from "./Studio";

// The 3D half of the landing page's scroll story, using the Lakeside cabin
// template. `progress` (0 to 1, how far through the story the reader has
// scrolled) drives everything:
//   0.00–0.30  the cabin's pieces fly in and settle into place
//   0.30–0.52  a hand reaches in, pinches the roof, lifts it and puts it back
//   0.52–0.66  "make the roof red": the roof changes colour
//   0.72–1.00  a print layer sweeps up through it as the camera circles

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// 0 before a, 1 after b, eased in between.
const phase = (p: number, a: number, b: number) => {
    const t = clamp01((p - a) / (b - a));
    return t * t * (3 - 2 * t);
};

const RED = new THREE.Color("#d8473a");

// Scattered spots for the pieces to fly in from, the same on every visit.
function scatter(i: number): { from: THREE.Vector3; spin: THREE.Euler } {
    const a = i * 2.39996;
    const r = 5 + (i % 3) * 1.3;
    return {
        from: new THREE.Vector3(Math.cos(a) * r, 2.6 + ((i * 0.73) % 2.6), Math.sin(a) * r),
        spin: new THREE.Euler(((i * 1.37) % 2) * 1.4 - 1.4, ((i * 0.91) % 2) * 1.6 - 1.6, ((i * 1.73) % 2) * 1.2 - 1.2),
    };
}

// A simple hand, palm down: a rounded palm and fingers made of segments.
// Finger tips move between open and pinched; at full pinch the thumb and
// index tips meet at the hand's origin, which is what gets placed on things.
type Finger = { base: [number, number, number]; open: [number, number, number]; shut: [number, number, number]; radius: number };
const FINGERS: Finger[] = [
    { base: [-0.24, 0.5, 0.42], open: [-0.46, 0.22, 0.1], shut: [0.015, -0.005, 0.02], radius: 0.06 }, // thumb
    { base: [-0.15, 0.46, 0.18], open: [-0.2, 0.16, -0.2], shut: [-0.015, 0.01, -0.005], radius: 0.05 }, // index
    { base: [-0.02, 0.46, 0.15], open: [-0.04, 0.14, -0.26], shut: [-0.03, 0.12, -0.09], radius: 0.05 }, // middle
    { base: [0.1, 0.47, 0.17], open: [0.12, 0.16, -0.2], shut: [0.09, 0.17, -0.03], radius: 0.048 }, // ring
    { base: [0.21, 0.49, 0.23], open: [0.27, 0.22, -0.1], shut: [0.2, 0.23, 0.05], radius: 0.042 }, // pinky
];
const UP = new THREE.Vector3(0, 1, 0);

function Hand({ pinch, group }: { pinch: MutableRefObject<number>; group: MutableRefObject<THREE.Group | null> }) {
    const material = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f2f3f7", roughness: 0.42, metalness: 0 }), []);
    const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: "#5b84ff", emissive: "#5b84ff", emissiveIntensity: 1.4, transparent: true }), []);
    const bones = useRef<(THREE.Mesh | null)[]>([]);
    const joints = useRef<(THREE.Mesh | null)[]>([]);
    const spark = useRef<THREE.Mesh>(null);

    useFrame(() => {
        const p = pinch.current;
        FINGERS.forEach((f, i) => {
            const base = new THREE.Vector3(...f.base);
            const tip = new THREE.Vector3(...f.open).lerp(new THREE.Vector3(...f.shut), p);
            // The middle joint arches up and forward, like a knuckle.
            const knuckle = base.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.06 + p * 0.05, -0.03));
            [
                [base, knuckle],
                [knuckle, tip],
            ].forEach(([a, b], s) => {
                const bone = bones.current[i * 2 + s];
                if (!bone) return;
                const d = b.clone().sub(a);
                bone.position.copy(a).addScaledVector(d, 0.5);
                bone.quaternion.setFromUnitVectors(UP, d.clone().normalize());
                bone.scale.set(f.radius, d.length(), f.radius);
            });
            [knuckle, tip].forEach((at, s) => {
                const joint = joints.current[i * 2 + s];
                if (!joint) return;
                joint.position.copy(at);
                joint.scale.setScalar(f.radius);
            });
        });
        // A glint where the fingers meet once they're closed.
        if (spark.current) {
            const on = phase(p, 0.8, 1);
            spark.current.scale.setScalar(0.02 + on * 0.07);
            glow.opacity = on;
        }
    });

    return (
        <group ref={group} visible={false}>
            <RoundedBox args={[0.5, 0.13, 0.42]} radius={0.06} smoothness={4} position={[-0.01, 0.53, 0.37]} rotation={[-0.3, 0, 0]} material={material} castShadow />
            {FINGERS.flatMap((_, i) =>
                [0, 1].map((s) => (
                    <mesh key={`b${i}${s}`} ref={(m) => void (bones.current[i * 2 + s] = m)} material={material} castShadow>
                        <cylinderGeometry args={[1, 1, 1, 14]} />
                    </mesh>
                )),
            )}
            {FINGERS.flatMap((_, i) =>
                [0, 1].map((s) => (
                    <mesh key={`j${i}${s}`} ref={(m) => void (joints.current[i * 2 + s] = m)} material={material} castShadow>
                        <sphereGeometry args={[1, 16, 12]} />
                    </mesh>
                )),
            )}
            <mesh ref={spark} material={glow}>
                <sphereGeometry args={[1, 16, 12]} />
            </mesh>
        </group>
    );
}

const CABIN = buildTemplate(TEMPLATES.find((t) => t.id === "cabin")!);

function Story({ progress }: { progress: MutableRefObject<number> }) {
    // Lowest pieces first, so the island lands before what stands on it.
    const parts = useMemo(
        () =>
            CABIN.objects
                .slice()
                .sort((a, b) => a.position[1] - b.position[1])
                .map((o, i) => ({ o, geometry: clayGeometry(o), material: clayMaterial(o), ...scatter(i) })),
        [],
    );
    const meshes = useRef<(THREE.Mesh | null)[]>([]);
    const roofIndex = parts.findIndex((p) => p.o.name === "Roof");
    const roofColor = useMemo(() => new THREE.Color(parts[roofIndex].o.material.color), [parts, roofIndex]);
    const hand = useRef<THREE.Group | null>(null);
    const pinch = useRef(0);
    const layer = useRef<THREE.Mesh>(null);
    const shown = useRef(0);

    useFrame(({ camera }, dt) => {
        // Eases toward where the reader has scrolled, so the scene glides.
        shown.current += (progress.current - shown.current) * Math.min(1, dt * 5);
        const p = shown.current;
        const build = phase(p, 0.02, 0.3);
        // Nothing shows until the story starts, so the pieces don't litter the page above.
        const appear = phase(p, 0, 0.035);
        const grab = clamp01((p - 0.3) / 0.22);
        const paint = phase(p, 0.52, 0.66);
        const print = phase(p, 0.72, 0.98);
        const now = performance.now();

        parts.forEach(({ o, from, spin }, i) => {
            const mesh = meshes.current[i];
            if (!mesh) return;
            const order = i / parts.length;
            const t = phase(build, order * 0.55, order * 0.55 + 0.45);
            const bob = (1 - t) * Math.sin(now / 700 + i * 1.7) * 0.15;
            mesh.position.set(
                THREE.MathUtils.lerp(from.x, o.position[0], t),
                THREE.MathUtils.lerp(from.y, o.position[1], t) + bob,
                THREE.MathUtils.lerp(from.z, o.position[2], t),
            );
            mesh.rotation.set(o.rotation[0] + spin.x * (1 - t), o.rotation[1] + spin.y * (1 - t), o.rotation[2] + spin.z * (1 - t));
            mesh.scale.set(o.scale[0], o.scale[1], o.scale[2]).multiplyScalar((0.4 + t * 0.6) * appear);
            mesh.visible = appear > 0;
        });

        // The hand comes in, pinches the roof's front ridge, lifts it with a
        // little turn, sets it back and lets go.
        const roof = meshes.current[roofIndex];
        const approach = phase(grab, 0, 0.24);
        pinch.current = phase(grab, 0.2, 0.32) * (1 - phase(grab, 0.84, 0.94));
        const lift = phase(grab, 0.32, 0.5) * (1 - phase(grab, 0.68, 0.84));
        const leave = phase(grab, 0.9, 1);
        if (roof && build >= 1) {
            roof.position.y += lift * 1.1;
            roof.rotation.y += Math.sin(phase(grab, 0.32, 0.84) * Math.PI) * 0.5;
        }
        const h = hand.current;
        if (h && roof) {
            h.visible = grab > 0 && grab < 1;
            const ridge = roof.localToWorld(new THREE.Vector3(0, 0.5, 1.1));
            h.position.copy(ridge).add(new THREE.Vector3(1.8, 1.2, 1.4).multiplyScalar(1 - approach + leave));
            // Reaching in from the side, turned toward the camera so the pinch reads.
            h.rotation.set(0.55, Math.atan2(camera.position.x, camera.position.z) + 0.9, -0.3);
            h.scale.setScalar(1.45);
        }
        (parts[roofIndex].material as THREE.MeshStandardMaterial).color.copy(roofColor).lerp(RED, paint);

        const l = layer.current;
        if (l) {
            l.visible = print > 0 && print < 1;
            l.position.y = -0.4 + print * 3.6;
        }

        // The camera drifts round the cabin the whole way down.
        const angle = -0.6 + p * 1.4 + print * 1.1;
        const distance = 15 - build * 3;
        camera.position.set(Math.sin(angle) * distance, 4.6 + (1 - build) * 1.2, Math.cos(angle) * distance);
        camera.lookAt(0, 0.9, 0);
    });

    return (
        <>
            {parts.map(({ o, geometry, material }, i) => (
                <mesh key={o.id} ref={(m) => void (meshes.current[i] = m)} geometry={geometry} material={material} castShadow receiveShadow />
            ))}
            <Hand pinch={pinch} group={hand} />
            {/* The layer a 3D printer is laying down. */}
            <mesh ref={layer} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[4.2, 64]} />
                <meshBasicMaterial color="#4f7bff" transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <ContactShadows position={[0, -0.41, 0]} opacity={0.3} scale={14} blur={2.8} far={5} />
        </>
    );
}

export default function StoryScene({ progress }: { progress: MutableRefObject<number> }) {
    return (
        <Canvas shadows dpr={[1, 2]} camera={{ position: [8, 5, 10], fov: 32 }} gl={{ alpha: true, antialias: true }}>
            <Studio />
            <Story progress={progress} />
        </Canvas>
    );
}
