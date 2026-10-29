import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { useVideoStream } from "./VideoStreamContext";
import type { Hand } from "../objects/hand";
import {
    FRAME_HEIGHT,
    FRAME_WIDTH,
    HandTrackerContext,
    type HandData,
} from "./HandTrackerContext";

const WASM_URL =
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm";
const MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const CONNECTIONS = HandLandmarker.HAND_CONNECTIONS.map((c) => [
    c.start,
    c.end,
]);

export const HandTrackerProvider = ({ children }: { children: ReactNode }) => {
    const { videoRef } = useVideoStream();
    const dataRef = useRef<HandData | null>(null);

    useEffect(() => {
        let landmarker: HandLandmarker | null = null;
        let raf = 0;
        let cancelled = false;
        let lastVideoTime = -1;

        const tick = () => {
            const video = videoRef.current;
            if (
                landmarker &&
                video &&
                video.readyState >= 2 &&
                video.currentTime !== lastVideoTime
            ) {
                lastVideoTime = video.currentTime;
                const result = landmarker.detectForVideo(
                    video,
                    performance.now()
                );
                const seen = { Left: false, Right: false };
                const hands: Hand[] = [];
                result.landmarks.forEach((points, i) => {
                    const label = result.handedness[i]?.[0]?.categoryName;
                    const handedness = label === "Left" ? "Right" : "Left";
                    if (seen[handedness]) return;
                    seen[handedness] = true;
                    hands.push({
                        handedness,
                        landmarks: points.map((p) => [
                            (1 - p.x) * FRAME_WIDTH,
                            p.y * FRAME_HEIGHT,
                            p.z,
                        ]),
                        connections: CONNECTIONS,
                    });
                });
                dataRef.current = { hands };
            }
            raf = requestAnimationFrame(tick);
        };

        (async () => {
            const vision = await FilesetResolver.forVisionTasks(WASM_URL);
            const created = await HandLandmarker.createFromOptions(vision, {
                baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
                runningMode: "VIDEO",
                numHands: 2,
                minHandDetectionConfidence: 0.65,
                minHandPresenceConfidence: 0.65,
                minTrackingConfidence: 0.65,
            });
            if (cancelled) {
                created.close();
                return;
            }
            landmarker = created;
            raf = requestAnimationFrame(tick);
        })().catch((e) => console.error("Hand tracker failed to load", e));

        return () => {
            cancelled = true;
            cancelAnimationFrame(raf);
            landmarker?.close();
        };
    }, [videoRef]);

    const value = useMemo(
        () => ({ getData: () => dataRef.current }),
        []
    );

    return (
        <HandTrackerContext.Provider value={value}>
            {children}
        </HandTrackerContext.Provider>
    );
};
