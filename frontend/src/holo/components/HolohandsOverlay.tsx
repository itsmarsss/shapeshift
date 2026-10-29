import { useEffect, useRef } from "react";
import {
    FRAME_HEIGHT,
    FRAME_WIDTH,
    useHandTracker,
} from "../provider/HandTrackerContext";
import { HandTrackerProvider } from "../provider/HandTrackerProvider";
import { ThreeDProvider } from "../provider/ThreeDProvider";
import Editable3DObject from "./ThreeRenderer";
import { useViewportActions } from "../../provider/ViewportContext";
import useSkeleton from "../hooks/useSkeleton";
import type {
    InteractionState,
    InteractionStateRef,
} from "../objects/InteractionState";

function OverlayInner() {
    const {
        startHandDrag,
        updateHandDragNormalized,
        endHandDrag,
        orbitRotate,
        orbitPan,
        orbitDolly,
    } = useViewportActions();
    const { getData } = useHandTracker();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const fpsRef = useRef<number>(0);
    const interactionRef: InteractionStateRef = useRef<InteractionState>({
        Left: null,
        Right: null,
        angleBetween: 0,
    });
    const prevPinchingRef = useRef<boolean>(false);

    const { processHands } = useSkeleton({
        overlayCanvasRef: canvasRef,
        updateInteractionState: (s: InteractionState) => {
            interactionRef.current = s;
        },
    });

    // Use the Three.js renderer's canvas for hand overlay
    useEffect(() => {
        const getRendererCanvas = () => {
            const rendererCanvas = interactionRef.canvasOverlayRef?.current;
            if (rendererCanvas) {
                canvasRef.current = rendererCanvas;
                ctxRef.current = rendererCanvas.getContext("2d", {
                    alpha: true,
                    desynchronized: true,
                });

                // Force initial size sync
                const mount = rendererCanvas.parentElement;
                if (mount) {
                    const { clientWidth, clientHeight } = mount;
                    rendererCanvas.width = clientWidth;
                    rendererCanvas.height = clientHeight;
                    rendererCanvas.style.width = `${clientWidth}px`;
                    rendererCanvas.style.height = `${clientHeight}px`;
                }
            }
        };

        // Try immediately and retry if not ready
        getRendererCanvas();
        const interval = setInterval(() => {
            if (!canvasRef.current) getRendererCanvas();
            else clearInterval(interval);
        }, 100);

        return () => clearInterval(interval);
    }, []);

    // Initialize cached 2D context
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        // desynchronized hint can reduce latency on some browsers/GPUs
        ctxRef.current = canvas.getContext("2d", {
            alpha: true,
            desynchronized: true,
        });
    }, []);

    // Main loop: draw every frame; capture/send runs asynchronously when acked
    useEffect(() => {
        let raf: number;
        let prevL: { x: number; y: number } | null = null;
        let prevR: { x: number; y: number } | null = null;
        let prevDist: number | null = null;

        // FPS counters
        const frameCountRef = { value: 0 } as { value: number };
        const lastTimeRef = { value: Date.now() } as { value: number };

        const tick = () => {
            const canvas = canvasRef.current;
            if (canvas) {
                const ctx =
                    ctxRef.current ||
                    (canvas.getContext(
                        "2d"
                    ) as CanvasRenderingContext2D | null);
                if (ctx) {
                    if (!ctxRef.current) ctxRef.current = ctx;

                    const data = getData();
                    if (
                        data &&
                        data.hands &&
                        canvas.width > 0 &&
                        canvas.height > 0
                    ) {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        const size = {
                            width: FRAME_WIDTH,
                            height: FRAME_HEIGHT,
                        };
                        processHands(data.hands, size, ctx);

                        const anyPinch = Boolean(
                            (interactionRef.current.Left &&
                                interactionRef.current.Left.isPinching) ||
                                (interactionRef.current.Right &&
                                    interactionRef.current.Right.isPinching)
                        );
                        if (anyPinch && !prevPinchingRef.current)
                            startHandDrag();
                        const refHand =
                            interactionRef.current.Right ||
                            interactionRef.current.Left;
                        if (refHand && refHand.cursor) {
                            const u = Math.max(
                                0,
                                Math.min(
                                    1,
                                    refHand.cursor.coords.x / size.width
                                )
                            );
                            const v = Math.max(
                                0,
                                Math.min(
                                    1,
                                    1 - refHand.cursor.coords.y / size.height
                                )
                            );
                            updateHandDragNormalized(u, v);
                        }
                        const L = interactionRef.current.Left;
                        const R = interactionRef.current.Right;
                        const lHold = Boolean(L?.isHolding);
                        const rHold = Boolean(R?.isHolding);

                        if (lHold && rHold && L?.cursor && R?.cursor) {
                            const dxPan =
                                (L.cursor.coords.x -
                                    (prevL?.x ?? L.cursor.coords.x)) /
                                size.width;
                            const dyPan =
                                (L.cursor.coords.y -
                                    (prevL?.y ?? L.cursor.coords.y)) /
                                size.height;
                            orbitPan(dxPan, dyPan);
                            prevL = {
                                x: L.cursor.coords.x,
                                y: L.cursor.coords.y,
                            };

                            const currDist = Math.hypot(
                                R.cursor.coords.x - L.cursor.coords.x,
                                R.cursor.coords.y - L.cursor.coords.y
                            );
                            if (prevDist != null) {
                                const deltaZoom =
                                    (prevDist - currDist) / size.width;
                                orbitDolly(deltaZoom);
                            }
                            prevDist = currDist;
                        } else if (
                            (lHold && L?.cursor) ||
                            (rHold && R?.cursor)
                        ) {
                            const H = rHold ? R! : L!;
                            const prev = rHold ? prevR : prevL;
                            const dx =
                                (H.cursor!.coords.x -
                                    (prev?.x ?? H.cursor!.coords.x)) /
                                size.width;
                            const dy =
                                (H.cursor!.coords.y -
                                    (prev?.y ?? H.cursor!.coords.y)) /
                                size.height;
                            orbitRotate(dx, dy);
                            if (rHold)
                                prevR = {
                                    x: H.cursor!.coords.x,
                                    y: H.cursor!.coords.y,
                                };
                            else
                                prevL = {
                                    x: H.cursor!.coords.x,
                                    y: H.cursor!.coords.y,
                                };
                            prevDist = null;
                        } else {
                            prevL = prevR = null;
                            prevDist = null;
                        }
                        if (!anyPinch && prevPinchingRef.current) endHandDrag();
                        prevPinchingRef.current = anyPinch;
                    }

                    // FPS calc
                    frameCountRef.value += 1;
                    const deltaMs = Date.now() - lastTimeRef.value;
                    if (deltaMs >= 1000) {
                        fpsRef.current = frameCountRef.value;
                        frameCountRef.value = 0;
                        lastTimeRef.value = Date.now();
                    }
                }
            }

            raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [
        getData,
        processHands,
        startHandDrag,
        updateHandDragNormalized,
        endHandDrag,
        orbitRotate,
        orbitPan,
        orbitDolly,
    ]);

    // Force rerenders on status changes; data is consumed directly in loop

    return (
        <div
            style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 48,
                bottom: 0,
            }}
        >
            <div
                ref={viewportRef}
                style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                }}
            >
                <ThreeDProvider>
                    <Editable3DObject
                        interactionStateRef={interactionRef}
                    />
                </ThreeDProvider>
            </div>
        </div>
    );
}

export default function HolohandsOverlay() {
    return (
        <HandTrackerProvider>
            <OverlayInner />
        </HandTrackerProvider>
    );
}
