import { useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
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

// The hand cursor, as the editor draws it: a soft ring that tightens round a
// dot when the fingers pinch.
function Cursor({ pinch, group }: { pinch: MutableRefObject<number>; group: MutableRefObject<THREE.Group | null> }) {
    const ring = useRef<THREE.Mesh>(null);
    const dot = useRef<THREE.Mesh>(null);
    const material = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#6b8dff", emissiveIntensity: 1.1, roughness: 0.3 }), []);
    useFrame(({ camera }) => {
        group.current?.lookAt(camera.position);
        const p = pinch.current;
        ring.current?.scale.setScalar(1 - p * 0.38);
        dot.current?.scale.setScalar(0.05 + p * 0.04);
        material.emissiveIntensity = 1.1 + p * 1.4;
    });
    return (
        <group ref={group} visible={false}>
            <mesh ref={ring} material={material}>
                <torusGeometry args={[0.3, 0.035, 16, 64]} />
            </mesh>
            <mesh ref={dot} material={material}>
                <sphereGeometry args={[1, 20, 14]} />
            </mesh>
        </group>
    );
}

// What the printer lays down: one filament colour, with fine layer lines.
function filament() {
    const material = new THREE.MeshStandardMaterial({ color: "#ff8a3d", roughness: 0.5 });
    material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying float vHeight;")
            .replace("#include <project_vertex>", "#include <project_vertex>\nvHeight = (modelMatrix * vec4(transformed, 1.0)).y;");
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\nvarying float vHeight;")
            .replace(
                "#include <color_fragment>",
                "#include <color_fragment>\nfloat line = smoothstep(0.3, 0.5, abs(fract(vHeight * 22.0) - 0.5));\ndiffuseColor.rgb *= 1.0 - 0.16 * line;",
            );
    };
    return material;
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
    const cursor = useRef<THREE.Group | null>(null);
    const pinch = useRef(0);
    const layer = useRef<THREE.Group>(null);
    const printed = useRef<(THREE.Mesh | null)[]>([]);
    // The scan height: the painted model shows above it, the print below.
    const above = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.5), []);
    const below = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), -0.5), []);
    const plastic = useMemo(() => {
        const m = filament();
        m.clippingPlanes = [below];
        return m;
    }, [below]);
    useMemo(() => parts.forEach((part) => (part.material.clippingPlanes = [above])), [parts, above]);
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

        // The cursor comes in, pinches the roof's front ridge, lifts it with a
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
        const c = cursor.current;
        if (c && roof) {
            c.visible = grab > 0 && grab < 1;
            const ridge = roof.localToWorld(new THREE.Vector3(0, 0.5, 1.1));
            c.position.copy(ridge).add(new THREE.Vector3(1.8, 1.2, 1.4).multiplyScalar(1 - approach + leave));
        }
        (parts[roofIndex].material as THREE.MeshStandardMaterial).color.copy(roofColor).lerp(RED, paint);

        // The scan rises from below the island to above the chimney.
        const height = -0.45 + print * 3.8;
        above.constant = -height;
        below.constant = height;
        printed.current.forEach((m, i) => {
            const source = meshes.current[i];
            if (!m || !source) return;
            m.visible = print > 0;
            m.position.copy(source.position);
            m.quaternion.copy(source.quaternion);
            m.scale.copy(source.scale);
        });
        const l = layer.current;
        if (l) {
            l.visible = print > 0 && print < 1;
            l.position.y = height;
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
            {parts.map(({ o, geometry }, i) => (
                <mesh key={`print-${o.id}`} ref={(m) => void (printed.current[i] = m)} geometry={geometry} material={plastic} visible={false} receiveShadow />
            ))}
            <Cursor pinch={pinch} group={cursor} />
            {/* The scanner: a glowing hoop with a faint sheet of light inside. */}
            <group ref={layer} visible={false}>
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[4.25, 96]} />
                    <meshBasicMaterial color="#6b8dff" transparent opacity={0.09} side={THREE.DoubleSide} depthWrite={false} />
                </mesh>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[4.25, 0.03, 12, 160]} />
                    <meshBasicMaterial color="#8ea8ff" />
                </mesh>
            </group>
            <ContactShadows position={[0, -0.41, 0]} opacity={0.3} scale={14} blur={2.8} far={5} />
        </>
    );
}

export default function StoryScene({ progress }: { progress: MutableRefObject<number> }) {
    return (
        <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ position: [8, 5, 10], fov: 32 }}
            gl={{ alpha: true, antialias: true }}
            // The print scan cuts each piece at its height.
            onCreated={({ gl }) => void (gl.localClippingEnabled = true)}
        >
            <Studio />
            <Story progress={progress} />
        </Canvas>
    );
}
