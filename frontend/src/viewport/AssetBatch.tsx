import { memo, useLayoutEffect, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneObject } from "@shapeshift/shared/scene/schema";
import { useMeshGeometry } from "../scene/meshStore";
import { ModelMaterial } from "./SceneMesh";

type Props = {
    hash: string;
    objects: SceneObject[];
    onSelect: (id: string, event: MouseEvent) => void;
};

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();
const euler = new THREE.Euler();
const color = new THREE.Color();

// Every copy of one imported part, such as all the bolts in an assembly,
// drawn in a single call.
export const AssetBatch = memo(function AssetBatch({ hash, objects, onSelect }: Props) {
    const geometry = useMeshGeometry(hash);
    const ref = useRef<THREE.InstancedMesh>(null);

    useLayoutEffect(() => {
        const mesh = ref.current;
        if (!mesh) return;
        objects.forEach((o, i) => {
            matrix.compose(position.set(...o.position), quaternion.setFromEuler(euler.set(...o.rotation)), scale.set(...o.scale));
            mesh.setMatrixAt(i, matrix);
            mesh.setColorAt(i, color.set(o.material.color));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.computeBoundingBox();
    }, [objects, geometry]);

    if (!geometry) return null;
    return (
        <instancedMesh
            key={objects.length}
            ref={ref}
            args={[geometry, undefined, objects.length]}
            userData={{ ids: objects.map((o) => o.id) }}
            castShadow
            receiveShadow
            onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                const id = e.instanceId === undefined ? undefined : objects[e.instanceId]?.id;
                if (id) onSelect(id, e.nativeEvent);
            }}
        >
            <ModelMaterial material={objects[0].material} vertexColors={!!geometry.getAttribute("color")} color="#ffffff" />
        </instancedMesh>
    );
});
