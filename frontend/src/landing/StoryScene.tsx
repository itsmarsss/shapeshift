import { useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, RoundedBox } from "@react-three/drei";
import * as THREE from "three";

// The 3D half of the landing page's scroll story. `progress` (0 to 1, how far
// through the story the reader has scrolled) drives everything:
//   0.00–0.30  loose shapes fly together into a house
//   0.30–0.52  a hand cursor grabs the roof, lifts it and turns it
//   0.52–0.72  "make the roof red": the roof changes colour
//   0.72–1.00  a print layer sweeps up through it as the camera circles

type Part = {
    shape: "box" | "roof" | "cylinder" | "cone";
    size: [number, number, number];
    at: [number, number, number];
    color: string;
    // Where it floats before the house comes together.
    from: [number, number, number];
    spin: [number, number, number];
};

const PARTS: Record<string, Part> = {
    walls: { shape: "box", size: [2, 1.4, 1.6], at: [0, 0.7, 0], color: "#f3e7d9", from: [-3.2, 2.6, -1.5], spin: [0.6, 0.9, 0.2] },
    roof: { shape: "roof", size: [1.62, 0.95, 4], at: [0, 1.88, 0], color: "#efe2d2", from: [2.8, 3.4, -0.8], spin: [-0.8, 0.4, 0.9] },
    door: { shape: "box", size: [0.42, 0.72, 0.06], at: [-0.3, 0.36, 0.82], color: "#7b4a2c", from: [1.6, -0.2, 2.4], spin: [1.2, -0.5, 0.3] },
    window: { shape: "box", size: [0.42, 0.42, 0.06], at: [0.5, 0.86, 0.82], color: "#a8d8ff", from: [3.4, 1.2, 1.4], spin: [-0.4, 1.4, -0.6] },
    chimney: { shape: "box", size: [0.24, 0.6, 0.24], at: [0.55, 2.1, -0.25], color: "#b9aea2", from: [-1.2, 4.2, 0.6], spin: [0.9, 0.2, 1.1] },
    trunk: { shape: "cylinder", size: [0.1, 0.62, 0.1], at: [-1.95, 0.31, 0.45], color: "#8a5a36", from: [-3.6, 0.4, 2.2], spin: [0.3, 0, 1.3] },
    leaves: { shape: "cone", size: [0.58, 1.25, 0.58], at: [-1.95, 1.22, 0.45], color: "#3fa45b", from: [-2.6, 3.8, 1.8], spin: [-1.1, 0.6, 0.4] },
};

const RED = new THREE.Color("#d8443a");
const ROOF = new THREE.Color(PARTS.roof.color);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// 0 before a, 1 after b, eased in between.
const phase = (p: number, a: number, b: number) => {
    const t = clamp01((p - a) / (b - a));
    return t * t * (3 - 2 * t);
};

function Geometry({ part }: { part: Part }) {
    const [x, y, z] = part.size;
    if (part.shape === "box") return <boxGeometry args={[x, y, z]} />;
    if (part.shape === "cylinder") return <cylinderGeometry args={[x, x, y, 20]} />;
    if (part.shape === "cone") return <coneGeometry args={[x, y, 24]} />;
    // A four-sided pyramid, turned to sit square on the walls.
    return <coneGeometry args={[x, y, z]} />;
}

function Story({ progress }: { progress: MutableRefObject<number> }) {
    const meshes = useRef<Record<string, THREE.Mesh | null>>({});
    const cursor = useRef<THREE.Mesh>(null);
    const layer = useRef<THREE.Mesh>(null);
    const group = useRef<THREE.Group>(null);
    const shown = useRef(0);
    const roofMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: PARTS.roof.color, roughness: 0.55 }), []);

    useFrame(({ camera }, dt) => {
        // Eases toward where the reader has scrolled, so the scene glides.
        shown.current += (progress.current - shown.current) * Math.min(1, dt * 6);
        const p = shown.current;
        const build = phase(p, 0.02, 0.3);
        const grab = phase(p, 0.32, 0.52);
        const paint = phase(p, 0.52, 0.66);
        const print = phase(p, 0.72, 0.98);

        for (const [name, part] of Object.entries(PARTS)) {
            const mesh = meshes.current[name];
            if (!mesh) continue;
            // Each piece arrives a little after the one before.
            const order = Object.keys(PARTS).indexOf(name) / Object.keys(PARTS).length;
            const t = phase(build, order * 0.45, order * 0.45 + 0.55);
            const bob = (1 - t) * Math.sin(performance.now() / 700 + order * 9) * 0.12;
            mesh.position.set(
                THREE.MathUtils.lerp(part.from[0], part.at[0], t),
                THREE.MathUtils.lerp(part.from[1], part.at[1], t) + bob,
                THREE.MathUtils.lerp(part.from[2], part.at[2], t)
            );
            mesh.rotation.set(part.spin[0] * (1 - t), part.spin[1] * (1 - t) + (part.shape === "roof" ? Math.PI / 4 : 0), part.spin[2] * (1 - t));
        }

        // The hand lifts the roof up and gives it a quarter turn, then sets it back.
        const roof = meshes.current.roof;
        const lift = Math.sin(grab * Math.PI);
        if (roof && build >= 1) {
            roof.position.y += lift * 0.9;
            roof.rotation.y += grab * (Math.PI / 2);
        }
        roofMaterial.color.copy(ROOF).lerp(RED, paint);

        const c = cursor.current;
        if (c && roof) {
            const visible = grab > 0 && grab < 1;
            c.visible = visible;
            // In front of the roof's near edge, where a pinch would hold it.
            c.position.set(roof.position.x + 0.35, roof.position.y + 0.15, roof.position.z + 1.25);
            const pinched = grab > 0.12 && grab < 0.88;
            c.scale.setScalar(pinched ? 0.75 : 1);
        }

        const l = layer.current;
        if (l) {
            l.visible = print > 0 && print < 1;
            l.position.y = -0.05 + print * 2.6;
        }

        // The camera drifts round the house the whole way down.
        const angle = -0.7 + p * 1.6 + print * 1.2;
        const distance = 12.5 - build * 2.6;
        camera.position.set(Math.sin(angle) * distance, 3.2 + (1 - build) * 0.8, Math.cos(angle) * distance);
        camera.lookAt(0, 1.05, 0);
        if (group.current) group.current.position.y = Math.sin(performance.now() / 1600) * 0.04;
    });

    return (
        <group ref={group}>
            {Object.entries(PARTS).map(([name, part]) => (
                <mesh key={name} ref={(m) => void (meshes.current[name] = m)} castShadow material={name === "roof" ? roofMaterial : undefined}>
                    <Geometry part={part} />
                    {name !== "roof" && <meshStandardMaterial color={part.color} roughness={0.6} />}
                </mesh>
            ))}
            {/* The ground the house settles on. */}
            <RoundedBox args={[5.4, 0.12, 3.8]} radius={0.06} position={[-0.2, -0.06, 0.1]} receiveShadow>
                <meshStandardMaterial color="#9fd49a" roughness={0.9} />
            </RoundedBox>
            {/* The hand cursor: a ring, smaller while it pinches. */}
            <mesh ref={cursor} visible={false} rotation={[Math.PI / 2.4, 0, 0]}>
                <torusGeometry args={[0.22, 0.05, 12, 40]} />
                <meshStandardMaterial color="#4f7bff" emissive="#4f7bff" emissiveIntensity={0.6} />
            </mesh>
            {/* The layer a 3D printer is laying down. */}
            <mesh ref={layer} visible={false} position={[-0.2, 0, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[5.4, 3.8]} />
                <meshBasicMaterial color="#4f7bff" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <ContactShadows position={[0, -0.12, 0]} opacity={0.3} scale={12} blur={2.6} far={5} />
        </group>
    );
}

export default function StoryScene({ progress }: { progress: MutableRefObject<number> }) {
    return (
        <Canvas shadows dpr={[1, 2]} camera={{ position: [6, 4, 6], fov: 34 }} gl={{ alpha: true, antialias: true }}>
            <hemisphereLight args={["#ffffff", "#8a8fa3", 1.15]} />
            <directionalLight position={[5, 9, 6]} intensity={2.3} castShadow shadow-mapSize={[1024, 1024]} />
            <directionalLight position={[-6, 3, -4]} intensity={0.55} color="#9db4ff" />
            <Story progress={progress} />
        </Canvas>
    );
}
