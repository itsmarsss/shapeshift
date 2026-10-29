// Minimal placeholder to keep types and structure ready; full port available on request
import { useCallback, useRef } from "react";
import type { Hand } from "../objects/hand";
import type { InteractionState } from "../objects/InteractionState";

interface ImageSize {
    width: number;
    height: number;
}

export default function useSkeleton({
    overlayCanvasRef,
    updateInteractionState,
}: {
    overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
    updateInteractionState: (s: InteractionState) => void;
}) {
    // History for holding detection (thumb-index and middle-thumb distances)
    const distanceHistoryIndexThumb = useRef<
        Record<"Left" | "Right", number[]>
    >({
        Left: [],
        Right: [],
    });
    const distanceHistoryMiddleThumb = useRef<
        Record<"Left" | "Right", number[]>
    >({
        Left: [],
        Right: [],
    });
    const historyTimeIndexThumb = useRef<Record<"Left" | "Right", number[]>>({
        Left: [],
        Right: [],
    });
    const historyTimeMiddleThumb = useRef<Record<"Left" | "Right", number[]>>({
        Left: [],
        Right: [],
    });

    // Cursor smoothing
    const previousCursor = useRef<
        Record<"Left" | "Right", { x: number; y: number } | null>
    >({
        Left: null,
        Right: null,
    });

    // Lower smoothing to reduce latency of cursor and drawings
    const smoothingFactor = 0.2;

    const smoothValue = (previous: number | null, current: number) => {
        if (previous === null) return current;
        return previous * (1 - smoothingFactor) + current * smoothingFactor;
    };

    const processHands = useCallback(
        (
            hands: Hand[],
            imageSize: ImageSize,
            ctx: CanvasRenderingContext2D
        ) => {
            const state: InteractionState = { Left: null, Right: null, angleBetween: 0 };

            // Get actual canvas dimensions
            const targetW = overlayCanvasRef.current?.width || imageSize.width;
            const targetH =
                overlayCanvasRef.current?.height || imageSize.height;

            // Scale from original video resolution to current canvas size
            const scaleX = targetW / imageSize.width;
            const scaleY = targetH / imageSize.height;

            hands.forEach((hand) => {
                const thumb = hand.landmarks[4];
                const index = hand.landmarks[8];
                const middle = hand.landmarks[12];

                const cx = (thumb[0] + index[0]) / 2;
                const cy = (thumb[1] + index[1]) / 2;

                // Smooth cursor
                const prev = previousCursor.current[hand.handedness];
                const smoothed = {
                    x: smoothValue(prev?.x ?? null, cx),
                    y: smoothValue(prev?.y ?? null, cy),
                } as { x: number; y: number };
                previousCursor.current[hand.handedness] = smoothed;

                // Depth estimation based on hand size
                const xVals = hand.landmarks.map((lm) => lm[0] * scaleX);
                const yVals = hand.landmarks.map((lm) => lm[1] * scaleY);
                const minX = Math.min(...xVals);
                const maxX = Math.max(...xVals);
                const minY = Math.min(...yVals);
                const maxY = Math.max(...yVals);
                const handDiag = Math.hypot(maxX - minX, maxY - minY);
                const canvasDiag = Math.hypot(targetW, targetH);
                const depth =
                    1 - Math.min(Math.max(handDiag / canvasDiag, 0), 1);

                // Distances for holding detection (scaled to canvas)
                const distIndexThumb = Math.hypot(
                    (index[0] - thumb[0]) * scaleX,
                    (index[1] - thumb[1]) * scaleY
                );
                const distMiddleThumb = Math.hypot(
                    (middle[0] - thumb[0]) * scaleX,
                    (middle[1] - thumb[1]) * scaleY
                );
                const now = Date.now();
                const side = hand.handedness;
                distanceHistoryIndexThumb.current[side].push(distIndexThumb);
                historyTimeIndexThumb.current[side].push(now);
                distanceHistoryMiddleThumb.current[side].push(distMiddleThumb);
                historyTimeMiddleThumb.current[side].push(now);
                // Keep last ~50ms
                while (
                    historyTimeIndexThumb.current[side].length > 0 &&
                    now - historyTimeIndexThumb.current[side][0] > 50
                ) {
                    historyTimeIndexThumb.current[side].shift();
                    distanceHistoryIndexThumb.current[side].shift();
                }
                while (
                    historyTimeMiddleThumb.current[side].length > 0 &&
                    now - historyTimeMiddleThumb.current[side][0] > 50
                ) {
                    historyTimeMiddleThumb.current[side].shift();
                    distanceHistoryMiddleThumb.current[side].shift();
                }

                // Compute moving average and variability
                const arr = distanceHistoryIndexThumb.current[side];
                const avg =
                    arr.reduce((a, b) => a + b, 0) / Math.max(arr.length, 1);
                const variance =
                    arr.reduce((s, v) => s + Math.pow(v - avg, 2), 0) /
                    Math.max(arr.length, 1);
                const std = Math.sqrt(variance);

                // Hand spread baseline
                const spread = (maxX - minX + (maxY - minY)) / 2;
                const holdThreshold = 0.25 * spread;
                const stabilityThreshold = 0.05 * spread;
                const isHolding =
                    avg < holdThreshold && std < stabilityThreshold;

                // Simple pinching based on clustered fingertips near centroid
                const fingertipIndices = [4, 8, 12, 16, 20];
                const fingertipPoints = fingertipIndices.map(
                    (i) => hand.landmarks[i]
                );
                const centroid = [
                    fingertipPoints.reduce((s, p) => s + p[0], 0) /
                        fingertipPoints.length,
                    fingertipPoints.reduce((s, p) => s + p[1], 0) /
                        fingertipPoints.length,
                ];
                const distances = fingertipPoints.map((p) =>
                    Math.hypot(p[0] - centroid[0], p[1] - centroid[1])
                );
                const maxDistance = Math.max(...distances);
                const pinchThreshold = 0.3 * spread;
                const isPinching = maxDistance < pinchThreshold;

                const handState = {
                    isHolding,
                    isPinching,
                    cursor: {
                        coords: {
                            x: smoothed.x * scaleX,
                            y: smoothed.y * scaleY,
                        },
                        angle: 0,
                    },
                    depth,
                };
                state[side] = handState;

                // draw cursor dot and simple bone lines scaled to canvas size
                if (overlayCanvasRef.current) {
                    ctx.save();
                    ctx.fillStyle = isHolding
                        ? "#ffaa00"
                        : isPinching
                        ? "#4caf50"
                        : "#f44336";
                    ctx.beginPath();
                    ctx.arc(
                        smoothed.x * scaleX,
                        smoothed.y * scaleY,
                        6,
                        0,
                        Math.PI * 2
                    );
                    ctx.fill();
                    if (hand.connections) {
                        ctx.strokeStyle = "#88aaff";
                        ctx.lineWidth = 2;
                        for (const [a, b] of hand.connections) {
                            const p = hand.landmarks[a];
                            const q = hand.landmarks[b];
                            ctx.beginPath();
                            ctx.moveTo(p[0] * scaleX, p[1] * scaleY);
                            ctx.lineTo(q[0] * scaleX, q[1] * scaleY);
                            ctx.stroke();
                        }
                    }
                    ctx.restore();
                }
            });

            updateInteractionState(state);
        },
        [overlayCanvasRef, updateInteractionState]
    );
    return { processHands };
}
