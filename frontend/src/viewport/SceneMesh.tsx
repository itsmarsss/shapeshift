import { memo, useEffect, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Edges } from "@react-three/drei";
import * as THREE from "three";
import { buildGeometry } from "../scene/geometry";
import { useMeshGeometry } from "../scene/meshStore";
import type { Geometry, Material, SceneObject } from "@shapeshift/shared/scene/schema";
import { usePalette } from "../settings/theme";
import { useClipping } from "./clipping";

type Props = {
    object: SceneObject;
    selected: boolean;
    hovered: boolean;
    // Set when someone else in a shared room has this selected.
    peerColor?: string;
    showSelection: boolean;
    onSelect: (id: string, event: MouseEvent) => void;
    // Pressing starts a drag; see useObjectDrag.
    onPress?: (id: string, event: ThreeEvent<PointerEvent>) => void;
    onHover?: (over: boolean) => void;
    meshRef?: (mesh: THREE.Mesh | null) => void;
};

type AssetGeometry = Extract<Geometry, { type: "asset" }>;

// Above this many triangles, finding a part's edges takes too long, so the
// selection shows as its bounding box instead.
const EDGE_LIMIT = 150_000;
const edgeCache = new Map<string, THREE.BufferGeometry>();

function assetEdges(g: AssetGeometry, geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    let edges = edgeCache.get(g.hash);
    if (!edges) {
        edges =
            g.triangles <= EDGE_LIMIT
                ? new THREE.EdgesGeometry(geometry, 20)
                : new THREE.EdgesGeometry(new THREE.BoxGeometry(g.max[0] - g.min[0], g.max[1] - g.min[1], g.max[2] - g.min[2]).translate(
                      (g.min[0] + g.max[0]) / 2,
                      (g.min[1] + g.max[1]) / 2,
                      (g.min[2] + g.max[2]) / 2
                  ));
        edgeCache.set(g.hash, edges);
    }
    return edges;
}

export function ModelMaterial({ material, vertexColors = false, color }: { material: Material; vertexColors?: boolean; color?: string }) {
    const { metalness, roughness, opacity, emissive, emissiveIntensity = 0, transmission = 0 } = material;
    const tint = color ?? material.color;
    const glow = { emissive: emissive ?? material.color, emissiveIntensity };
    const clipping = useClipping();
    const key = clipping.clippingPlanes ? "cut" : "whole";
    return transmission > 0 ? (
        // Physical materials cost more, so only glass gets one.
        <meshPhysicalMaterial
            key={key}
            color={tint}
            metalness={metalness}
            roughness={roughness}
            opacity={opacity}
            transparent={opacity < 1}
            transmission={transmission}
            thickness={0.5}
            ior={1.5}
            vertexColors={vertexColors}
            {...clipping}
            {...glow}
        />
    ) : (
        <meshStandardMaterial
            key={key}
            color={tint}
            metalness={metalness}
            roughness={roughness}
            opacity={opacity}
            transparent={opacity < 1}
            vertexColors={vertexColors}
            {...clipping}
            {...glow}
        />
    );
}

function Outline({ object, geometry, color, lineWidth }: { object: SceneObject; geometry: THREE.BufferGeometry; color: string; lineWidth?: number }) {
    if (object.geometry.type !== "asset") return <Edges threshold={20} color={color} lineWidth={lineWidth} />;
    return (
        <lineSegments geometry={assetEdges(object.geometry, geometry)} raycast={() => null}>
            <lineBasicMaterial color={color} />
        </lineSegments>
    );
}

function useObjectGeometry(g: Geometry): THREE.BufferGeometry | undefined {
    const asset = useMeshGeometry(g.type === "asset" ? g.hash : null);
    const built = useMemo(() => (g.type === "asset" ? null : buildGeometry(g)), [g]);
    useEffect(() => () => built?.dispose(), [built]);
    return built ?? asset;
}

export const SceneMesh = memo(function SceneMesh({ object, selected, hovered, peerColor, showSelection, onSelect, onPress, onHover, meshRef }: Props) {
    const geometry = useObjectGeometry(object.geometry);
    const palette = usePalette();
    if (!geometry) return null;

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
            onPointerDown={onPress && ((e: ThreeEvent<PointerEvent>) => onPress(object.id, e))}
            onPointerOver={onHover && ((e: ThreeEvent<PointerEvent>) => (e.stopPropagation(), onHover(true)))}
            onPointerOut={onHover && (() => onHover(false))}
        >
            <ModelMaterial material={object.material} vertexColors={!!geometry.getAttribute("color")} />
            {selected && showSelection && <Outline object={object} geometry={geometry} color={palette.accent} />}
            {peerColor && !selected && <Outline object={object} geometry={geometry} color={peerColor} lineWidth={2} />}
            {hovered && !selected && <Outline object={object} geometry={geometry} color={palette.hover} lineWidth={2} />}
        </mesh>
    );
});
