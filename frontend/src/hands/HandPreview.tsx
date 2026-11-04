import { COMPACT } from "../ui/compact";
import { spin } from "../ui/keyframes";
import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { CameraSlash, CircleNotch, Play, Record, Stop } from "@phosphor-icons/react";
import { download } from "../scene/io";
import { live, recording, replay, useHands, type Recording } from "./tracker";
import { IconButton, TextButton } from "../components/ui";
import { useDraggable } from "../ui/hooks";
import { useSettings } from "../settings/store";

// Small, beside the toolbar, and it stays put when panels open; drag it
// anywhere by the picture.
const Box = styled.div`
    position: absolute;
    bottom: calc(var(--gap) + 28px + var(--bottom-offset, 0px));
    left: calc(70px + var(--gap));
    width: 176px;
    padding: 4px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    // Above docked and floating panels, so it can't end up hidden behind one
    // after it's dragged.
    z-index: 65;

    @media ${COMPACT} {
        top: calc(var(--topbar) + var(--gap));
        bottom: auto;
        width: 150px;
    }
`;

const Frame = styled.div`
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--bg);

    canvas {
        width: 100%;
        height: 100%;
        display: block;
    }
`;

const Overlay = styled.div`
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;

    .spin {
        animation: ${spin} 0.9s linear infinite;
    }
`;

const Bar = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 4px 4px 0;
    font-size: 11px;
    color: var(--text-muted);

    .live {
        display: inline-flex;
        align-items: center;
        gap: 5px;
    }
    .live i {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--success);
    }
`;

// Opens beside the preview, wide enough to read in a line each.
const Legend = styled.div`
    position: absolute;
    left: calc(100% + 8px);
    bottom: 0;
    width: 270px;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 10px;
    padding: 10px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    @media ${COMPACT} {
        left: 0;
        bottom: auto;
        top: calc(100% + 8px);
        width: min(270px, calc(100vw - 24px));
    }
    color: var(--text-faint);
    font-size: 11px;

    b {
        color: var(--text-muted);
        font-weight: 500;
    }
`;

const DevTools = styled.div`
    position: absolute;
    top: 6px;
    right: 6px;
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: var(--radius);
    background: var(--surface);
`;

const BONES = [
    [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

const canRecord = new URLSearchParams(location.search).has("record");

export function HandPreview() {
    const status = useHands((s) => s.status);
    const error = useHands((s) => s.error);
    const stage = useHands((s) => s.stage);
    const canvas = useRef<HTMLCanvasElement>(null);
    const [rec, setRec] = useState(false);
    const showPreview = useSettings((s) => s.showHandPreview);
    const fileRef = useRef<HTMLInputElement>(null);
    const [showGestures, setShowGestures] = useState(false);
    const drag = useDraggable<HTMLDivElement>("hand-preview");

    useEffect(() => {
        let raf = 0;
        const tick = () => {
            raf = requestAnimationFrame(tick);
            const c = canvas.current;
            const ctx = c?.getContext("2d");
            if (!c || !ctx) return;
            c.width = 424;
            c.height = 238;
            ctx.save();
            ctx.translate(c.width, 0);
            ctx.scale(-1, 1);
            if (live.video) ctx.drawImage(live.video, 0, 0, c.width, c.height);
            ctx.strokeStyle = "rgba(236, 236, 238, 0.7)";
            ctx.lineWidth = 2;
            for (const hand of useSettings.getState().showSkeleton ? live.frames : []) {
                const l = hand.landmarks;
                ctx.beginPath();
                for (const [a, b] of BONES) {
                    ctx.moveTo(l[a * 3] * c.width, l[a * 3 + 1] * c.height);
                    ctx.lineTo(l[b * 3] * c.width, l[b * 3 + 1] * c.height);
                }
                ctx.stroke();
            }
            ctx.restore();
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    if (status === "off" || (!showPreview && status === "running")) return null;

    function toggleRecording() {
        if (rec) {
            recording.active = false;
            download(JSON.stringify(recording.frames), "hand-recording.json", "application/json");
        } else {
            recording.frames = [];
            recording.active = true;
        }
        setRec(!rec);
    }

    return (
        <Box ref={drag.ref} style={drag.style}>
            <Frame {...drag.handle} title="Drag to move">
                <canvas ref={canvas} />
                {status === "starting" && (
                    <Overlay>
                        <CircleNotch className="spin" size={18} />
                        {stage === "camera" ? "Starting the camera…" : "Getting ready…"}
                    </Overlay>
                )}
                {status === "error" && (
                    <Overlay>
                        <CameraSlash size={18} />
                        {error}
                    </Overlay>
                )}
                {canRecord && status === "running" && (
                    <DevTools>
                        <IconButton $size={24} title={rec ? "Stop and download" : "Record landmarks"} onClick={toggleRecording}>
                            {rec ? <Stop size={14} weight="fill" /> : <Record size={14} weight="fill" />}
                        </IconButton>
                        <IconButton $size={24} title="Replay a recording" onClick={() => fileRef.current?.click()}>
                            <Play size={14} weight="fill" />
                        </IconButton>
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".json"
                            hidden
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (file) replay(JSON.parse(await file.text()) as Recording);
                            }}
                        />
                    </DevTools>
                )}
            </Frame>
            {status === "running" && (
                <Bar>
                    <span className="live">
                        <i /> Tracking
                    </span>
                    <TextButton $size="sm" aria-expanded={showGestures} onClick={() => setShowGestures(!showGestures)}>
                        {showGestures ? "Hide gestures" : "Gestures"}
                    </TextButton>
                </Bar>
            )}
            {status === "running" && showGestures && (
                <Legend>
                    <b>Pinch an object</b>
                    <span>Grab and move it</span>
                    <b>Pinch + reach</b>
                    <span>Push or pull what you hold</span>
                    <b>Hold + other hand</b>
                    <span>Spread to resize, twist to turn</span>
                    <b>Pinch empty space</b>
                    <span>Look around</span>
                    <b>Hold an open hand</b>
                    <span>Menu: add shapes, copy, delete</span>
                    <b>Thumb + middle</b>
                    <span>Talk to the assistant</span>
                    <b>Thumb + ring</b>
                    <span>Preview, and back</span>
                    <b>Thumb + pinky</b>
                    <span>Undo</span>
                </Legend>
            )}
        </Box>
    );
}
