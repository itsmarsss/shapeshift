import { useMemo } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Grid } from "@react-three/drei";
import * as THREE from "three";
import { SCENE_COLORS, useResolvedTheme } from "../settings/theme";
import { gridStepFor, useTools, workplaneQuaternion } from "./tools";

const target = new THREE.Vector3();

export function WorkplaneGrid() {
    const workplane = useTools((s) => s.workplane);
    const step = useTools((s) => s.gridStep);
    const colors = SCENE_COLORS[useResolvedTheme()];
    const quaternion = useMemo(() => workplaneQuaternion(workplane), [workplane]);
    const origin = workplane?.origin ?? [0, 0, 0];

    useFrame(({ camera }) => {
        const next = gridStepFor(camera.position.distanceTo(target.set(...origin)));
        if (next !== useTools.getState().gridStep) useTools.getState().setGridStep(next);
    });

    return (
        <group position={origin} quaternion={quaternion}>
            <Grid
                userData={{ grid: true }}
                position={[0, workplane ? 0.0005 : 0, 0]}
                infiniteGrid
                fadeDistance={step * 450}
                cellSize={step}
                sectionSize={step * 10}
                cellThickness={0.6}
                sectionThickness={1}
                cellColor={colors.cell}
                sectionColor={colors.section}
            />
        </group>
    );
}

// An invisible floor that the workplane and ruler tools can click.
export function ToolFloor({ onClick }: { onClick: (e: ThreeEvent<MouseEvent>) => void }) {
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} userData={{ look: "floor" }} onClick={onClick}>
            <planeGeometry args={[1000, 1000]} />
            <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
        </mesh>
    );
}
