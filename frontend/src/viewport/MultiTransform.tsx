import { useRef, useState, type MutableRefObject } from "react";
import { TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { groupPivot } from "../scene/commands";
import type { Command, SceneObject, Vec3 } from "../scene/schema";
import { useScene } from "../scene/store";
import { transformCommand } from "../scene/autokey";

type Start = { pivot: THREE.Matrix4; members: { id: string; matrix: THREE.Matrix4 }[] };

function matrixOf(o: SceneObject) {
    return new THREE.Matrix4().compose(
        new THREE.Vector3(...o.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.rotation)),
        new THREE.Vector3(...o.scale)
    );
}

// One gizmo for several selected objects. It drags a pivot at their center and
// applies the pivot's change to every object, so a drag is one undo step.
export function MultiTransform({ objects, gizmoBusy }: { objects: SceneObject[]; gizmoBusy: MutableRefObject<boolean> }) {
    const transformMode = useScene((s) => s.transformMode);
    const snap = useScene((s) => s.snap);
    const [pivot, setPivot] = useState<THREE.Group | null>(null);
    // Remounting the pivot after each drag resets its rotation and scale.
    const [generation, setGeneration] = useState(0);
    const start = useRef<Start | null>(null);
    const center = groupPivot(objects);

    return (
        <>
            <group key={generation} ref={setPivot} position={start.current ? undefined : center} />
            {pivot && (
                <TransformControls
                    object={pivot}
                    mode={transformMode}
                    translationSnap={snap.enabled ? snap.translate : null}
                    rotationSnap={snap.enabled ? snap.rotate : null}
                    scaleSnap={snap.enabled ? snap.scale : null}
                    onMouseDown={() => {
                        gizmoBusy.current = true;
                        pivot.updateMatrixWorld();
                        start.current = {
                            pivot: pivot.matrixWorld.clone().invert(),
                            members: objects.map((o) => ({ id: o.id, matrix: matrixOf(o) })),
                        };
                    }}
                    onMouseUp={() => {
                        useScene.getState().endCoalesce();
                        start.current = null;
                        setGeneration((g) => g + 1);
                        setTimeout(() => {
                            gizmoBusy.current = false;
                        });
                    }}
                    onObjectChange={() => {
                        const s = start.current;
                        if (!s) return;
                        pivot.updateMatrixWorld();
                        const delta = pivot.matrixWorld.clone().multiply(s.pivot);
                        const position = new THREE.Vector3();
                        const quaternion = new THREE.Quaternion();
                        const scale = new THREE.Vector3();
                        const commands: Command[] = s.members.map(({ id, matrix }) => {
                            delta.clone().multiply(matrix).decompose(position, quaternion, scale);
                            const rotation = new THREE.Euler().setFromQuaternion(quaternion);
                            return transformCommand(id, {
                                position: position.toArray() as Vec3,
                                rotation: [rotation.x, rotation.y, rotation.z],
                                scale: scale.toArray() as Vec3,
                            });
                        });
                        useScene.getState().run(commands, { coalesce: "gizmo:selection", select: false });
                    }}
                />
            )}
        </>
    );
}
