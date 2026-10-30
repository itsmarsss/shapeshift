import { memo, useEffect, useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { Light } from "../scene/schema";
import { usePalette } from "../settings/theme";

type Props = {
    light: Light;
    selected: boolean;
    showMarker: boolean;
    onSelect: (id: string) => void;
    markerRef?: (mesh: THREE.Mesh | null) => void;
};

const SHADOW = {
    "shadow-mapSize": [1024, 1024] as [number, number],
    "shadow-bias": -0.0005,
    "shadow-normalBias": 0.02,
};

export const SceneLight = memo(function SceneLight({ light, selected, showMarker, onSelect, markerRef }: Props) {
    // Spot and directional lights point at a target object, which has to be in
    // the scene graph for its matrix to update.
    const target = useMemo(() => new THREE.Object3D(), []);
    const lightRef = useRef<THREE.SpotLight | THREE.DirectionalLight>(null);
    useEffect(() => {
        if (lightRef.current) lightRef.current.target = target;
    }, [target, light.type]);

    const aimed = light.type !== "point";
    const accent = usePalette().accent;

    return (
        <>
            {light.type === "point" && (
                <pointLight position={light.position} color={light.color} intensity={light.intensity} distance={light.distance} decay={2} castShadow {...SHADOW} />
            )}
            {light.type === "spot" && (
                <spotLight
                    ref={lightRef as React.Ref<THREE.SpotLight>}
                    position={light.position}
                    color={light.color}
                    intensity={light.intensity}
                    distance={light.distance}
                    angle={light.angle}
                    penumbra={0.35}
                    decay={2}
                    castShadow
                    {...SHADOW}
                />
            )}
            {light.type === "directional" && (
                <directionalLight
                    ref={lightRef as React.Ref<THREE.DirectionalLight>}
                    position={light.position}
                    color={light.color}
                    intensity={light.intensity}
                    castShadow
                    shadow-camera-left={-12}
                    shadow-camera-right={12}
                    shadow-camera-top={12}
                    shadow-camera-bottom={-12}
                    {...SHADOW}
                />
            )}
            <primitive object={target} position={light.aim} />

            {showMarker && (
                <>
                    <mesh
                        ref={markerRef}
                        name={light.id}
                        position={light.position}
                        userData={{ helper: true }}
                        onClick={(e: ThreeEvent<MouseEvent>) => {
                            e.stopPropagation();
                            onSelect(light.id);
                        }}
                    >
                        <sphereGeometry args={[light.type === "directional" ? 0.16 : 0.11, 16, 12]} />
                        <meshBasicMaterial color={light.color} toneMapped={false} />
                    </mesh>
                    <mesh position={light.position} userData={{ helper: true }} raycast={() => null}>
                        <sphereGeometry args={[light.type === "directional" ? 0.24 : 0.18, 16, 12]} />
                        <meshBasicMaterial color={selected ? accent : light.color} transparent opacity={selected ? 0.45 : 0.18} depthWrite={false} />
                    </mesh>
                    {aimed && (
                        <Line
                            points={[light.position, light.aim]}
                            color={selected ? accent : light.color}
                            lineWidth={1}
                            dashed
                            dashSize={0.15}
                            gapSize={0.1}
                            transparent
                            opacity={0.6}
                            userData={{ helper: true }}
                        />
                    )}
                </>
            )}
        </>
    );
});
