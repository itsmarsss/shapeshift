import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Edges } from "@react-three/drei";
import type * as THREE from "three";
import { buildGeometry } from "../scene/geometry";
import type { SceneObject } from "@shapeshift/shared/scene/schema";
import { usePalette } from "../settings/theme";
import { spawnState } from "../scene/spawn";

export type MeshLook = "solid" | "hole" | "hidden";

type Props = {
    object: SceneObject;
    selected: boolean;
    hovered: boolean;
    // Set when someone else in a shared room has this selected.
    peerColor?: string;
    showSelection: boolean;
    onSelect: (id: string, event: ThreeEvent<MouseEvent>) => void;
    // Pressing starts a drag; see useObjectDrag.
    onPress?: (id: string, event: ThreeEvent<PointerEvent>) => void;
    onHover?: (over: boolean) => void;
    meshRef?: (mesh: THREE.Mesh | null) => void;
    // Replaces the object's own shape, such as a solid with its holes cut out.
    cut?: THREE.BufferGeometry;
    look?: MeshLook;
};

const HOLE_COLOR = "#9a9ea6";

export const SceneMesh = memo(function SceneMesh({ object, selected, hovered, peerColor, showSelection, onSelect, onPress, onHover, meshRef, cut, look = "solid" }: Props) {
    const own = useMemo(() => buildGeometry(object.geometry), [object.geometry]);
    useEffect(() => () => own.dispose(), [own]);
    const { color, metalness, roughness, opacity, emissive, emissiveIntensity = 0, transmission = 0 } = object.material;
    const glow = { emissive: emissive ?? color, emissiveIntensity };
    const palette = usePalette();
    const outlined = look !== "hidden" && !cut;

    // Growing in or glowing after an assistant edit; see spawn.ts.
    const mesh = useRef<THREE.Mesh | null>(null);
    const setMesh = useCallback(
        (m: THREE.Mesh | null) => {
            mesh.current = m;
            meshRef?.(m);
        },
        [meshRef],
    );
    useFrame((state) => {
        const m = mesh.current;
        if (!m) return;
        const now = spawnState(object.id, performance.now());
        const material = m.material as THREE.MeshStandardMaterial;
        if (!now) {
            if (m.userData.spawning) {
                m.userData.spawning = false;
                m.visible = true;
                m.scale.set(...object.scale);
                if ("emissiveIntensity" in material) material.emissiveIntensity = emissiveIntensity;
            }
            return;
        }
        m.userData.spawning = true;
        m.visible = now.scale > 0.001;
        m.scale.set(object.scale[0] * now.scale, object.scale[1] * now.scale, object.scale[2] * now.scale);
        if ("emissiveIntensity" in material) material.emissiveIntensity = emissiveIntensity + now.glow;
        state.invalidate();
    });

    return (
        <mesh
            ref={setMesh}
            name={object.id}
            userData={{ look }}
            geometry={cut ?? own}
            position={object.position}
            rotation={object.rotation}
            scale={object.scale}
            castShadow={look === "solid"}
            receiveShadow={look === "solid"}
            onClick={(e: ThreeEvent<MouseEvent>) => onSelect(object.id, e)}
            onPointerDown={onPress && ((e: ThreeEvent<PointerEvent>) => onPress(object.id, e))}
            onPointerOver={onHover && ((e: ThreeEvent<PointerEvent>) => (e.stopPropagation(), onHover(true)))}
            onPointerOut={onHover && (() => onHover(false))}
        >
            {look === "hole" ? (
                <meshStandardMaterial color={HOLE_COLOR} roughness={0.8} transparent opacity={0.35} depthWrite={false} />
            ) : look === "hidden" ? (
                <meshBasicMaterial visible={false} />
            ) : transmission > 0 ? (
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
            {look === "hole" && !selected && <Edges threshold={20} color={HOLE_COLOR} />}
            {outlined && selected && showSelection && <Edges threshold={20} color={palette.accent} />}
            {outlined && peerColor && !selected && <Edges threshold={20} color={peerColor} lineWidth={2} />}
            {outlined && hovered && !selected && <Edges threshold={20} color={palette.hover} lineWidth={2} />}
        </mesh>
    );
});
