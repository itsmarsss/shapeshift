import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { CameraControls } from "@react-three/drei";
import { attachControls, useCameraAngles } from "./frame";

// Gives the camera moves in frame.ts the canvas's camera controls, and keeps
// the view cube in step with the camera.
export function CameraBridge() {
    const controls = useThree((s) => s.controls) as unknown as CameraControls | null;
    const invalidate = useThree((s) => s.invalidate);
    useEffect(() => {
        attachControls(controls, invalidate);
        if (!controls) return;
        const update = () => useCameraAngles.setState({ azimuth: controls.azimuthAngle, polar: controls.polarAngle });
        update();
        controls.addEventListener("update", update);
        return () => {
            controls.removeEventListener("update", update);
            attachControls(null);
        };
    }, [controls, invalidate]);
    return null;
}
