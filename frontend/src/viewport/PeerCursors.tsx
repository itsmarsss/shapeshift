import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useCollab } from "../collab/session";
import { useScene } from "../scene/store";

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// Reports where this user's pointer is, on an object or the ground.
function useBroadcastCursor() {
    const gl = useThree((s) => s.gl);
    const camera = useThree((s) => s.camera);
    const scene = useThree((s) => s.scene);
    const live = useCollab((s) => s.status === "live");

    useEffect(() => {
        if (!live) return;
        const raycaster = new THREE.Raycaster();
        const ndc = new THREE.Vector2();
        const el = gl.domElement;
        const move = (e: PointerEvent) => {
            const rect = el.getBoundingClientRect();
            ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
            raycaster.setFromCamera(ndc, camera);
            const ids = new Set(useScene.getState().doc.objects.map((o) => o.id));
            const hit = raycaster.intersectObjects(scene.children, true).find((i) => ids.has(i.object.name));
            const point = hit?.point ?? raycaster.ray.intersectPlane(GROUND, new THREE.Vector3());
            useCollab.getState().moveCursor(point ? (point.toArray() as [number, number, number]) : null);
        };
        const leave = () => useCollab.getState().moveCursor(null);
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerleave", leave);
        return () => {
            el.removeEventListener("pointermove", move);
            el.removeEventListener("pointerleave", leave);
            leave();
        };
    }, [gl, camera, scene, live]);
}

// Everyone else's pointer, as a colored pin with their name.
export function PeerCursors() {
    useBroadcastCursor();
    const peers = useCollab((s) => s.peers);
    return (
        <>
            {Object.values(peers).map((p) =>
                p.presence.cursor ? (
                    <group key={p.id} position={p.presence.cursor} userData={{ helper: true }}>
                        <mesh position={[0, 0.12, 0]} rotation={[Math.PI, 0, 0]} raycast={() => null} userData={{ helper: true }}>
                            <coneGeometry args={[0.06, 0.18, 12]} />
                            <meshBasicMaterial color={p.color} toneMapped={false} />
                        </mesh>
                        <Html position={[0, 0.3, 0]} center zIndexRange={[40, 0]} style={{ pointerEvents: "none" }}>
                            <div
                                style={{
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    background: p.color,
                                    color: "#fff",
                                    font: "600 11px/1.6 -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                                    whiteSpace: "nowrap",
                                    boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                                }}
                            >
                                {p.name}
                            </div>
                        </Html>
                    </group>
                ) : null
            )}
        </>
    );
}
