import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, ContactShadows, OrbitControls, useBounds } from "@react-three/drei";
import * as THREE from "three";
import type { SceneDoc, SceneObject } from "@shapeshift/shared/scene/schema";
import { clayGeometry, clayMaterial } from "./clay";
import { Studio } from "./Studio";

// Frames the scene whenever it changes, so each one fills the window.
function Fit({ doc }: { doc: SceneDoc }) {
    const bounds = useBounds();
    useEffect(() => {
        bounds.refresh().clip().fit();
    }, [bounds, doc]);
    return null;
}

type Part = { o: SceneObject; geometry: THREE.BufferGeometry; material: THREE.Material };

function Model({ parts }: { parts: Part[] }) {
    return (
        <group>
            {parts.map(({ o, geometry, material }) => (
                <mesh key={o.id} geometry={geometry} material={material} position={o.position} rotation={o.rotation} scale={o.scale} castShadow receiveShadow />
            ))}
        </group>
    );
}

// A live, slowly turning scene. Drag to look around, unless it's only for show.
export default function HeroScene({ doc, interactive = true }: { doc: SceneDoc; interactive?: boolean }) {
    // Holes are left out: there's no cutting library on these pages.
    const parts = useMemo(() => doc.objects.filter((o) => !o.hole).map((o) => ({ o, geometry: clayGeometry(o), material: clayMaterial(o) })), [doc]);
    // The shadow goes under the lowest point, wherever the scene sits.
    const floor = useMemo(
        () =>
            Math.min(
                0,
                ...parts.map(({ o, geometry }) => {
                    geometry.computeBoundingBox();
                    return o.position[1] + geometry.boundingBox!.min.y * Math.abs(o.scale[1]);
                }),
            ),
        [parts],
    );
    return (
        <Canvas shadows dpr={[1, 2]} camera={{ position: [5, 3.5, 6], fov: 35 }} gl={{ alpha: true, antialias: true }}>
            <Studio />
            <Bounds margin={1.2}>
                <Model parts={parts} />
                <Fit doc={doc} />
            </Bounds>
            <ContactShadows position={[0, floor - 0.01, 0]} opacity={0.3} scale={16} blur={2.8} far={6} />
            <OrbitControls
                makeDefault
                autoRotate
                autoRotateSpeed={0.9}
                enableRotate={interactive}
                enablePan={false}
                enableZoom={false}
                minPolarAngle={0.5}
                maxPolarAngle={1.4}
            />
        </Canvas>
    );
}
