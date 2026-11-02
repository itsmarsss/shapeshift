import { Environment, Lightformer } from "@react-three/drei";

// Soft studio light made on the page: big glowing panels reflected in the
// shapes, no picture to download.
export function Studio() {
    return (
        <>
            <hemisphereLight args={["#ffffff", "#9aa0b4", 0.6]} />
            <directionalLight position={[5, 9, 6]} intensity={2} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03}>
                <orthographicCamera attach="shadow-camera" args={[-8, 8, 8, -8, 0.5, 30]} />
            </directionalLight>
            <Environment resolution={256} frames={1}>
                <Lightformer form="rect" intensity={2.2} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
                <Lightformer form="rect" intensity={1.4} position={[-6, 2, 3]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} color="#dfe8ff" />
                <Lightformer form="rect" intensity={1.1} position={[6, 2, -2]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} color="#ffe9d6" />
                <Lightformer form="ring" intensity={0.8} position={[0, 3, 8]} scale={4} />
            </Environment>
        </>
    );
}
