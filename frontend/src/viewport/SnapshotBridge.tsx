import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { framedCamera, isHelper, setSnapshotTaker } from "./snapshot";

// Mounted inside the Canvas. Renders straight to the canvas and reads it back
// in the same task, so the browser never shows the extra frame.
export function SnapshotBridge() {
    const gl = useThree((s) => s.gl);
    const scene = useThree((s) => s.scene);
    const camera = useThree((s) => s.camera);

    useEffect(() => {
        setSnapshotTaker(({ view, targets, maxSize = 768, format = "jpeg", supersample = 1, clean = false }) => {
            const canvas = gl.domElement;
            const pixelRatio = gl.getPixelRatio();
            if (supersample > 1) gl.setPixelRatio(pixelRatio * supersample);
            const aspect = canvas.width / Math.max(1, canvas.height);
            const shot = view === "current" ? camera : framedCamera(scene, view, aspect, targets);
            const hidden: THREE.Object3D[] = [];
            scene.traverse((o) => {
                if (o.visible && (isHelper(o) || (clean && o.userData.grid === true))) {
                    o.visible = false;
                    hidden.push(o);
                }
            });
            try {
                gl.render(scene, shot);
                const scale = Math.min(1, maxSize / Math.max(canvas.width, canvas.height));
                const out = document.createElement("canvas");
                out.width = Math.round(canvas.width * scale);
                out.height = Math.round(canvas.height * scale);
                const ctx = out.getContext("2d");
                if (ctx) {
                    ctx.imageSmoothingQuality = "high";
                    ctx.drawImage(canvas, 0, 0, out.width, out.height);
                }
                return { dataUrl: out.toDataURL(`image/${format}`, 0.9), width: out.width, height: out.height };
            } catch {
                return null;
            } finally {
                for (const o of hidden) o.visible = true;
                if (supersample > 1) gl.setPixelRatio(pixelRatio);
                gl.render(scene, camera);
            }
        });
        return () => setSnapshotTaker(null);
    }, [gl, scene, camera]);

    return null;
}
