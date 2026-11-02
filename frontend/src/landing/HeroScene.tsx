import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, ContactShadows, OrbitControls, useBounds } from "@react-three/drei";
import * as THREE from "three";
import type { SceneDoc } from "@shapeshift/shared/scene/schema";
import { toThreeScene } from "../scene/io";

// Frames the scene whenever it changes, so each one fills the window.
function Fit({ doc }: { doc: SceneDoc }) {
    const bounds = useBounds();
    useEffect(() => {
        bounds.refresh().clip().fit();
    }, [bounds, doc]);
    return null;
}

function Model({ doc }: { doc: SceneDoc }) {
    const scene = useMemo(() => {
        const s = toThreeScene(doc);
        s.traverse((o) => {
            if (o instanceof THREE.Mesh) o.castShadow = true;
            // The page brings its own lights.
            if (o instanceof THREE.Light) o.visible = false;
        });
        return s;
    }, [doc]);
    return <primitive object={scene} />;
}

// A live, slowly turning scene. Drag to look around, unless it's only for show.
export default function HeroScene({ doc, interactive = true }: { doc: SceneDoc; interactive?: boolean }) {
    return (
        <Canvas shadows dpr={[1, 2]} camera={{ position: [5, 3.5, 6], fov: 35 }} gl={{ alpha: true, antialias: true }}>
            <hemisphereLight args={["#ffffff", "#8a8fa3", 1.1]} />
            <directionalLight position={[4, 8, 5]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
            <directionalLight position={[-6, 3, -4]} intensity={0.6} color="#9db4ff" />
            <Bounds margin={1.25}>
                <Model doc={doc} />
                <Fit doc={doc} />
            </Bounds>
            <ContactShadows position={[0, 0.001, 0]} opacity={0.35} scale={14} blur={2.4} far={6} />
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
