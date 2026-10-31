import { COMPACT } from "../ui/compact";
import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { CameraSlash, CircleNotch, Play, Record, Stop } from "@phosphor-icons/react";
import { download } from "../scene/io";
import { live, recording, replay, useHands, type Recording } from "./tracker";
import { IconButton } from "../components/ui";
import { useSettings } from "../settings/store";

const Box = styled.div`
    position: absolute;
    bottom: calc(var(--gap) + var(--bottom-offset, 0px));
    left: var(--gap);
    width: 220px;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    z-index: 20;

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
`;

const Legend = styled.div`
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 8px;
    padding: 6px 6px 2px;
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
    const canvas = useRef<HTMLCanvasElement>(null);
    const [rec, setRec] = useState(false);
    const showPreview = useSettings((s) => s.showHandPreview);
    const fileRef = useRef<HTMLInputElement>(null);

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
        <Box>
            <Frame>
                <canvas ref={canvas} />
                {status === "starting" && (
                    <Overlay>
                        <CircleNotch size={18} />
                        Starting hand tracking
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
                    <span>Next mode</span>
                    <b>Thumb + pinky</b>
                    <span>Undo</span>
                </Legend>
            )}
        </Box>
    );
}
