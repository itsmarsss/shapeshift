import { Environment, Lightformer } from "@react-three/drei";
import type { Environment as EnvironmentName } from "../scene/schema";

// Lighting environments built from light panels rather than downloaded HDR
// images, so they load instantly and work offline.
export function SceneEnvironment({ preset }: { preset: EnvironmentName }) {
    if (preset === "none") return null;
    return (
        <Environment resolution={256} frames={1}>
            {preset === "studio" && (
                <>
                    <Lightformer form="rect" intensity={3} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 6, 1]} />
                    <Lightformer form="rect" intensity={2} position={[-6, 2, 2]} rotation-y={Math.PI / 2} scale={[6, 4, 1]} />
                    <Lightformer form="rect" intensity={1.2} position={[6, 2, -2]} rotation-y={-Math.PI / 2} scale={[6, 4, 1]} />
                    <Lightformer form="ring" intensity={1} position={[0, 2, 8]} scale={3} />
                </>
            )}
            {preset === "sunset" && (
                <>
                    <color attach="background" args={["#2a1a2e"]} />
                    <Lightformer form="rect" intensity={4} color="#ff8a3d" position={[0, 1.5, -10]} scale={[20, 3, 1]} />
                    <Lightformer form="rect" intensity={1.5} color="#ff5e7a" position={[0, 5, -9]} scale={[20, 4, 1]} />
                    <Lightformer form="circle" intensity={8} color="#ffd08a" position={[4, 2, -9]} scale={2} />
                    <Lightformer form="rect" intensity={0.6} color="#5b6cff" position={[0, 8, 6]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
                </>
            )}
            {preset === "city" && (
                <>
                    <color attach="background" args={["#1b2230"]} />
                    {[-6, -3, 0, 3, 6].map((x, i) => (
                        <Lightformer key={x} form="rect" intensity={1.5 + (i % 2)} color={i % 2 ? "#cfe3ff" : "#fff1d6"} position={[x, 3, -8]} scale={[1.5, 5, 1]} />
                    ))}
                    <Lightformer form="rect" intensity={2} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
                    <Lightformer form="rect" intensity={1} color="#9fb6ff" position={[8, 2, 4]} rotation-y={-Math.PI / 2} scale={[8, 4, 1]} />
                </>
            )}
            {preset === "night" && (
                <>
                    <color attach="background" args={["#05070d"]} />
                    <Lightformer form="rect" intensity={0.8} color="#4a6cff" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} />
                    <Lightformer form="circle" intensity={3} color="#dfe8ff" position={[-5, 6, -6]} scale={1} />
                    <Lightformer form="rect" intensity={1.2} color="#ff4fd8" position={[7, 1.5, 0]} rotation-y={-Math.PI / 2} scale={[6, 1, 1]} />
                </>
            )}
        </Environment>
    );
}
