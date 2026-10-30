import { memo, useEffect, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Edges } from "@react-three/drei";
import type * as THREE from "three";
import { buildGeometry } from "../scene/geometry";
import type { SceneObject } from "../scene/schema";
import { usePalette } from "../settings/theme";

type Props = {
    object: SceneObject;
    selected: boolean;
    hovered: boolean;
    // Set when someone else in a shared room has this selected.
    peerColor?: string;
    showSelection: boolean;
    onSelect: (id: string, event: MouseEvent) => void;
    meshRef?: (mesh: THREE.Mesh | null) => void;
};

export const SceneMesh = memo(function SceneMesh({ object, selected, hovered, peerColor, showSelection, onSelect, meshRef }: Props) {
    const geometry = useMemo(() => buildGeometry(object.geometry), [object.geometry]);
    useEffect(() => () => geometry.dispose(), [geometry]);
    const { color, metalness, roughness, opacity, emissive, emissiveIntensity = 0, transmission = 0 } = object.material;
    const glow = { emissive: emissive ?? color, emissiveIntensity };
    const palette = usePalette();

    return (
        <mesh
            ref={meshRef}
            name={object.id}
            geometry={geometry}
            position={object.position}
            rotation={object.rotation}
            scale={object.scale}
            castShadow
            receiveShadow
            onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                onSelect(object.id, e.nativeEvent);
            }}
        >
            {transmission > 0 ? (
                // Physical materials cost more, so only glass gets one.
                <meshPhysicalMaterial
                    color={color}
                    metalness={metalness}
                    roughness={roughness}
                    opacity={opacity}
                    transparent={opacity < 1}
                    transmission={transmission}
                    thickness={0.5}
                    ior={1.5}
                    {...glow}
                />
            ) : (
                <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} opacity={opacity} transparent={opacity < 1} {...glow} />
            )}
            {selected && showSelection && <Edges threshold={20} color={palette.accent} />}
            {peerColor && !selected && <Edges threshold={20} color={peerColor} lineWidth={2} />}
            {hovered && !selected && <Edges threshold={20} color={palette.hover} lineWidth={2} />}
        </mesh>
    );
});
