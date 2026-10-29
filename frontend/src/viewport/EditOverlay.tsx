import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { editableMesh } from "../scene/geometry";
import type { SceneObject } from "../scene/schema";
import { useScene } from "../scene/store";

const HANDLE = new THREE.Color("#c8ccd4");
const HANDLE_SELECTED = new THREE.Color("#4f7cff");

type DragStart = {
    pivot: THREE.Vector3;
    positions: number[];
    inverse: THREE.Matrix4;
};

export function EditOverlay({ object, gizmoBusy }: { object: SceneObject; gizmoBusy: RefObject<boolean> }) {
    const run = useScene((s) => s.run);
    const endCoalesce = useScene((s) => s.endCoalesce);
    const snap = useScene((s) => s.snap);
    const mesh = editableMesh(object.geometry);
    const count = mesh.positions.length / 3;
    const [selected, setSelected] = useState<number[]>([]);
    const [pivot] = useState(() => new THREE.Object3D());
    const groupRef = useRef<THREE.Group>(null);
    const drag = useRef<DragStart | null>(null);

    useEffect(() => setSelected([]), [object.id]);
    const active = useMemo(() => selected.filter((i) => i < count), [selected, count]);

    const pointsGeometry = useMemo(() => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) (active.includes(i) ? HANDLE_SELECTED : HANDLE).toArray(colors, i * 3);
        g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        return g;
    }, [mesh.positions, count, active]);
    useEffect(() => () => pointsGeometry.dispose(), [pointsGeometry]);

    const wireGeometry = useMemo(() => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
        g.setIndex(mesh.indices);
        return new THREE.WireframeGeometry(g);
    }, [mesh.positions, mesh.indices]);
    useEffect(() => () => wireGeometry.dispose(), [wireGeometry]);

    function placePivot(indices: number[]) {
        const group = groupRef.current;
        if (!group || !indices.length) return;
        group.updateMatrixWorld();
        const c = new THREE.Vector3();
        for (const i of indices) c.add(new THREE.Vector3().fromArray(mesh.positions, i * 3));
        c.divideScalar(indices.length).applyMatrix4(group.matrixWorld);
        pivot.position.copy(c);
        pivot.updateMatrixWorld();
    }

    useEffect(() => {
        if (!drag.current) placePivot(active);
    });

    function onPick(e: ThreeEvent<MouseEvent>) {
        e.stopPropagation();
        if (e.index === undefined) return;
        const i = e.index;
        setSelected((prev) => (e.shiftKey ? (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]) : [i]));
    }

    return (
        <>
            <group ref={groupRef} position={object.position} rotation={object.rotation} scale={object.scale}>
                <lineSegments geometry={wireGeometry} raycast={() => null}>
                    <lineBasicMaterial color="#4f7cff" transparent opacity={0.35} depthTest={false} />
                </lineSegments>
                <points geometry={pointsGeometry} onClick={onPick} renderOrder={2}>
                    <pointsMaterial size={9} sizeAttenuation={false} vertexColors depthTest={false} />
                </points>
            </group>
            <primitive object={pivot} />
            {active.length > 0 && (
                <TransformControls
                    object={pivot}
                    mode="translate"
                    size={0.7}
                    translationSnap={snap.enabled ? snap.translate : null}
                    onMouseDown={() => {
                        gizmoBusy.current = true;
                        const group = groupRef.current!;
                        group.updateMatrixWorld();
                        drag.current = {
                            pivot: pivot.position.clone(),
                            positions: mesh.positions.slice(),
                            inverse: group.matrixWorld.clone().invert(),
                        };
                    }}
                    onMouseUp={() => {
                        drag.current = null;
                        endCoalesce();
                        setTimeout(() => {
                            gizmoBusy.current = false;
                        });
                    }}
                    onObjectChange={() => {
                        const start = drag.current;
                        if (!start) return;
                        const from = start.pivot.clone().applyMatrix4(start.inverse);
                        const to = pivot.position.clone().applyMatrix4(start.inverse);
                        const delta = to.sub(from);
                        const positions = start.positions.slice();
                        for (const i of active) {
                            positions[i * 3] += delta.x;
                            positions[i * 3 + 1] += delta.y;
                            positions[i * 3 + 2] += delta.z;
                        }
                        run(
                            { type: "geometry", target: object.id, geometry: { type: "mesh", positions, indices: mesh.indices } },
                            { coalesce: `vertex:${object.id}` }
                        );
                    }}
                />
            )}
        </>
    );
}
