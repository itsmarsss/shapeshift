import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import * as THREE from "three";
import type { SceneDoc } from "@shapeshift/shared/scene/schema";
import { worldBounds } from "../assistant/assistant";
import { evaluate } from "../scene/animation";
import { useCsg } from "../scene/csg";
import { cutGeometries } from "../scene/holes";
import { SceneEnvironment } from "../viewport/SceneEnvironment";
import { SceneLight } from "../viewport/SceneLight";
import { SceneMesh } from "../viewport/SceneMesh";
import { SCENE_COLORS } from "../settings/theme";
import { setCapture } from "./capture";

// A scene to look at but not edit: the share page, and the Model lab's live views.
//
// The share page is dark; the Model lab looks like the editor (its light
// background and ground), so a run is judged as the person would see it.
export type SceneLook = "share" | "editor";

function Capture() {
    const gl = useThree((s) => s.gl);
    const scene = useThree((s) => s.scene);
    const camera = useThree((s) => s.camera);
    useEffect(() => {
        setCapture(() => {
            gl.render(scene, camera);
            return gl.domElement;
        });
        return () => setCapture(null);
    }, [gl, scene, camera]);
    return null;
}

// Points the camera at everything in the scene once it loads.
function Frame({ doc }: { doc: SceneDoc }) {
    const controls = useThree((s) => s.controls) as unknown as CameraControls | null;
    useEffect(() => {
        if (!controls || !doc.objects.length) return;
        const box = new THREE.Box3();
        for (const o of doc.objects) {
            const b = worldBounds(o);
            box.expandByPoint(new THREE.Vector3(...b.min)).expandByPoint(new THREE.Vector3(...b.max));
        }
        void controls.fitToBox(box, false, { paddingTop: 0.4, paddingBottom: 0.4, paddingLeft: 0.4, paddingRight: 0.4 });
    }, [controls, doc]);
    return null;
}

function Scene({ doc, look }: { doc: SceneDoc; look: SceneLook }) {
    const [time, setTime] = useState(0);
    const animated = doc.animation.tracks.length > 0;
    const clock = useRef(0);
    useFrame((_, delta) => {
        if (!animated) return;
        clock.current += delta;
        const { duration, loop } = doc.animation;
        setTime(loop ? clock.current % duration : Math.min(clock.current, duration));
    });
    const poses = useMemo(() => (animated ? evaluate(doc.animation, time) : new Map()), [animated, doc, time]);
    const objects = doc.objects.map((o) => {
        const p = poses.get(o.id);
        return p ? { ...o, position: p.position ?? o.position, rotation: p.rotation ?? o.rotation, scale: p.scale ?? o.scale, material: p.color ? { ...o.material, color: p.color } : o.material } : o;
    });
    useCsg((s) => s.ready);
    const cuts = cutGeometries(objects);
    const lights = doc.lights.map((l) => {
        const p = poses.get(l.id);
        return p ? { ...l, position: p.position ?? l.position, color: p.color ?? l.color, intensity: p.intensity ?? l.intensity } : l;
    });
    return (
        <>
            <color attach="background" args={[look === "editor" ? SCENE_COLORS.light.background : "#0d0e10"]} />
            <hemisphereLight args={["#ffffff", look === "editor" ? SCENE_COLORS.light.ground : "#30333a", lights.length ? 0.35 : 0.7]} />
            {!lights.length && <directionalLight position={[-5, 10, 3]} intensity={1.8} castShadow shadow-mapSize={[2048, 2048]} />}
            {lights.map((l) => (
                <SceneLight key={l.id} light={l} selected={false} showMarker={false} onSelect={() => {}} />
            ))}
            <SceneEnvironment preset={doc.environment} />
            {objects.map((o) =>
                o.hole ? null : <SceneMesh key={o.id} object={o} selected={false} hovered={false} showSelection={false} onSelect={() => {}} cut={cuts.get(o.id)} />
            )}
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[200, 200]} />
                <shadowMaterial opacity={0.35} />
            </mesh>
            <CameraControls makeDefault />
            <Frame doc={doc} />
        </>
    );
}

// `capture` keeps the last frame readable, so a picture can be taken of it
// (see capture.ts).
export function SceneView({ doc, capture = false, look = "share" }: { doc: SceneDoc; capture?: boolean; look?: SceneLook }) {
    return (
        <Canvas gl={capture ? { preserveDrawingBuffer: true } : undefined} shadows dpr={[1, 2]} camera={{ position: [4, 3.5, 6], fov: 45, near: 0.05, far: 500 }} style={{ position: "absolute", inset: 0 }}>
            {capture && <Capture />}
            <Scene doc={doc} look={look} />
        </Canvas>
    );
}
