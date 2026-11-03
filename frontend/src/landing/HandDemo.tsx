import { lazy, Suspense, useEffect, useRef, useState, type RefObject } from "react";
import { spin } from "../ui/keyframes";
import styled from "styled-components";
import { ArrowRight, ArrowsIn, ArrowsOut, Camera, CameraSlash, CircleNotch, HandGrabbing, ShieldCheck } from "@phosphor-icons/react";
import { live, useHands, warmUpHands } from "../hands/tracker";
import type { DemoStatus } from "./HandDemoScene";

const HandDemoScene = lazy(() => import("./HandDemoScene"));

const LABEL: Record<DemoStatus["state"], string> = {
    none: "Hold a hand up to the camera",
    idle: "Point the ring at a shape",
    near: "Pinch to grab it",
    holding: "Move it, reach in or pull back · open your fingers to drop",
    orbit: "Turning the view",
    zoom: "Spread to zoom · twist to turn",
};

const GESTURES = [
    ["Pinch a shape", "grab it"],
    ["Reach toward the screen", "push it away"],
    ["Pinch empty space", "turn the view"],
    ["Pinch with both hands", "spread to zoom, twist to turn"],
];

// MediaPipe's hand: which landmarks the lines in the camera preview join.
const BONES: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const Section = styled.section`
    width: min(1120px, 100%);
    margin: 0 auto;
    padding: 96px 24px;
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
    gap: 48px;
    align-items: center;

    @media (max-width: 860px) {
        grid-template-columns: 1fr;
        padding: 56px 16px;
        gap: 28px;
    }
`;

const Copy = styled.div`
    .kicker {
        color: var(--accent);
        font-weight: 700;
        font-size: 13px;
        letter-spacing: 0.04em;
    }
    h2 {
        margin: 12px 0 14px;
        font-size: clamp(30px, 4vw, 46px);
        line-height: 1.05;
        letter-spacing: -0.035em;
    }
    p {
        margin: 0 0 20px;
        color: var(--text-muted);
        font-size: 17px;
        line-height: 1.55;
    }
    small {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 14px;
        color: var(--text-faint);
    }
`;

const Guide = styled.ul`
    margin: 0 0 24px;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 6px;

    li {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 9px 14px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: var(--surface);
        font-weight: 600;
    }
    li span {
        color: var(--text-muted);
        font-weight: 400;
    }
`;

const Button = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 10px;
    height: 48px;
    padding: 0 22px;
    border-radius: 12px;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--accent-text);
    font-size: 15px;
    font-weight: 700;

    &[data-on] {
        background: transparent;
        color: var(--text);
        border-color: var(--border-strong);
    }
    .spin {
        animation: ${spin} 1s linear infinite;
    }
`;

// The playground. Full screen covers the whole window, even where the
// browser has no full-screen mode (iPhones).
const Box = styled.div`
    position: relative;
    aspect-ratio: 16 / 10;
    border-radius: 24px;
    border: 1px solid var(--border-strong);
    background:
        radial-gradient(500px 260px at 50% 100%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%),
        linear-gradient(170deg, var(--surface), var(--surface-raised));
    overflow: hidden;

    &[data-full] {
        position: fixed;
        inset: 0;
        z-index: 2000;
        aspect-ratio: auto;
        border-radius: 0;
        border: 0;
        background: var(--bg);
    }
`;

const Off = styled.div`
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 10px;
    color: var(--text-muted);
    text-align: center;
    padding: 20px;

    svg {
        color: var(--accent);
    }
`;

const Bar = styled.div`
    position: absolute;
    top: 14px;
    left: 14px;
    right: calc(min(26%, 220px) + 28px);
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    z-index: 1;

    a,
    button {
        height: 36px;
        padding: 0 12px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 10px;
        border: 1px solid var(--border-strong);
        background: color-mix(in srgb, var(--surface) 88%, transparent);
        backdrop-filter: blur(8px);
        color: var(--text);
        font-weight: 600;
        font-size: 13px;
        text-decoration: none;
        white-space: nowrap;
    }
    a {
        background: var(--accent);
        border-color: var(--accent);
        color: var(--accent-text);
    }
`;

const Status = styled.div`
    position: absolute;
    left: 50%;
    bottom: 16px;
    translate: -50% 0;
    max-width: calc(100% - 32px);
    padding: 8px 14px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    font-weight: 600;
    font-size: 13px;
    text-align: center;
`;

// What the camera sees, mirrored like a mirror, with the tracked hand on top.
const Preview = styled.div`
    position: absolute;
    top: 14px;
    right: 14px;
    width: min(26%, 220px);
    aspect-ratio: 16 / 9;
    border-radius: 12px;
    border: 1px solid var(--border-strong);
    overflow: hidden;
    background: #000;
    transform: scaleX(-1);

    video,
    canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
`;

// Draws the hand the tracker sees over the camera picture.
function useSkeleton(canvas: RefObject<HTMLCanvasElement | null>, on: boolean) {
    useEffect(() => {
        if (!on) return;
        let raf = 0;
        const draw = () => {
            raf = requestAnimationFrame(draw);
            const c = canvas.current;
            const ctx = c?.getContext("2d");
            if (!c || !ctx) return;
            const w = (c.width = c.clientWidth * 2);
            const h = (c.height = c.clientHeight * 2);
            ctx.clearRect(0, 0, w, h);
            ctx.lineWidth = 3;
            ctx.strokeStyle = "rgba(160, 185, 255, 0.95)";
            ctx.fillStyle = "#ffffff";
            for (const { landmarks: l } of live.frames) {
                ctx.beginPath();
                for (const [a, b] of BONES) {
                    ctx.moveTo(l[a * 3] * w, l[a * 3 + 1] * h);
                    ctx.lineTo(l[b * 3] * w, l[b * 3 + 1] * h);
                }
                ctx.stroke();
                for (let i = 0; i < 21; i++) {
                    ctx.beginPath();
                    ctx.arc(l[i * 3] * w, l[i * 3 + 1] * h, 3.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        };
        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, [canvas, on]);
}

// Try hand control on the landing page itself: a small ShapeShift with a few
// shapes, which can go full screen.
export function HandDemo() {
    const status = useHands((s) => s.status);
    const error = useHands((s) => s.error);
    const stage = useHands((s) => s.stage);
    const progress = useHands((s) => s.progress);
    const [asked, setAsked] = useState(false);
    const [full, setFull] = useState(false);
    const shapeStatus = useRef<DemoStatus>({ state: "none" });
    const box = useRef<HTMLDivElement>(null);
    const label = useRef<HTMLDivElement>(null);
    const video = useRef<HTMLVideoElement>(null);
    const bones = useRef<HTMLCanvasElement>(null);
    const running = status === "running";
    useSkeleton(bones, running);

    // Turned off again on the way out, since only this section uses it here.
    useEffect(() => () => void (useHands.getState().status !== "off" && useHands.getState().setEnabled(false)), []);

    useEffect(() => {
        if (!running) return;
        if (video.current && live.video) video.current.srcObject = live.video.srcObject;
        let raf = 0;
        const tick = () => {
            raf = requestAnimationFrame(tick);
            const text = LABEL[shapeStatus.current.state];
            if (label.current && label.current.textContent !== text) label.current.textContent = text;
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [running]);

    // Escape, or leaving the browser's full screen, closes it here too.
    useEffect(() => {
        if (!full) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
        const onChange = () => !document.fullscreenElement && setFull(false);
        window.addEventListener("keydown", onKey);
        document.addEventListener("fullscreenchange", onChange);
        return () => {
            window.removeEventListener("keydown", onKey);
            document.removeEventListener("fullscreenchange", onChange);
        };
    }, [full]);

    const toggleFull = () => {
        const next = !full;
        setFull(next);
        if (next) box.current?.requestFullscreen?.().catch(() => {});
        else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };

    const toggle = () => {
        setAsked(true);
        void useHands.getState().setEnabled(!running && status !== "starting");
    };

    return (
        <Section aria-label="Try hand tracking">
            <Copy>
                <span className="kicker">TRY IT NOW</span>
                <h2>Your webcam is the controller</h2>
                <p>Turn on your camera and play with a few shapes, right here. It's the same tracking the editor uses.</p>
                <Guide>
                    {GESTURES.map(([gesture, result]) => (
                        <li key={gesture}>
                            {gesture}
                            <span>{result}</span>
                        </li>
                    ))}
                </Guide>
                <Button onClick={toggle} data-on={running || undefined} onPointerEnter={() => void warmUpHands()} onFocus={() => void warmUpHands()}>
                    {status === "starting" ? (
                        <CircleNotch size={20} className="spin" />
                    ) : running ? (
                        <CameraSlash size={20} weight="bold" />
                    ) : (
                        <Camera size={20} weight="bold" />
                    )}
                    {status === "starting" ? (stage === "loading" ? `Loading hand tracking${progress !== null && progress < 1 ? ` · ${Math.round(progress * 100)}%` : "…"}` : "Starting the camera…") : running ? "Turn the camera off" : "Turn on the camera"}
                </Button>
                <small>
                    <ShieldCheck size={16} />
                    Video never leaves your device. Tracking runs in your browser.
                </small>
            </Copy>
            <Box ref={box} data-full={full || undefined}>
                {running ? (
                    <>
                        <Suspense fallback={null}>
                            <HandDemoScene status={shapeStatus} />
                        </Suspense>
                        <Bar>
                            <button onClick={toggleFull} title={full ? "Leave full screen (Esc)" : "Full screen"}>
                                {full ? <ArrowsIn size={16} weight="bold" /> : <ArrowsOut size={16} weight="bold" />}
                                {full ? "Exit" : "Full screen"}
                            </button>
                            {/* Hand control stays on: the editor starts it again by itself. */}
                            <a href="/edit?new=1">
                                Keep going in the editor
                                <ArrowRight size={14} weight="bold" />
                            </a>
                        </Bar>
                        <Preview aria-hidden>
                            <video ref={video} autoPlay muted playsInline />
                            <canvas ref={bones} />
                        </Preview>
                        <Status ref={label} role="status">
                            {LABEL.none}
                        </Status>
                    </>
                ) : (
                    <Off>
                        <HandGrabbing size={44} weight="duotone" />
                        {asked && status === "error" ? error : "Five shapes are waiting for your hands."}
                    </Off>
                )}
            </Box>
        </Section>
    );
}
