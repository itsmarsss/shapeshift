import { lazy, Suspense, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { Camera, CameraSlash, CircleNotch, HandGrabbing, ShieldCheck } from "@phosphor-icons/react";
import { live, useHands } from "../hands/tracker";
import type { DemoStatus } from "./HandDemoScene";

const HandDemoScene = lazy(() => import("./HandDemoScene"));

const LABEL: Record<DemoStatus["state"], string> = {
    none: "Hold a hand up to the camera",
    idle: "Move your fingertips onto a shape",
    near: "Pinch to grab it",
    holding: "Got it. Move it around, open to drop",
};

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
        margin: 0 0 24px;
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
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
`;

const Box = styled.div`
    position: relative;
    aspect-ratio: 16 / 10;
    border-radius: 24px;
    border: 1px solid var(--border-strong);
    background:
        radial-gradient(400px 220px at 50% 100%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%),
        linear-gradient(170deg, var(--surface), var(--surface-raised));
    overflow: hidden;
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

const Status = styled.div`
    position: absolute;
    left: 50%;
    bottom: 16px;
    translate: -50% 0;
    padding: 8px 14px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    font-weight: 600;
    font-size: 13px;
    white-space: nowrap;
`;

// What the camera sees, small in the corner and mirrored like a mirror.
const Preview = styled.video`
    position: absolute;
    top: 14px;
    right: 14px;
    width: 28%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: 12px;
    border: 1px solid var(--border-strong);
    transform: scaleX(-1);
    background: #000;
`;

// Try hand tracking on the landing page itself, with a few shapes to grab.
export function HandDemo() {
    const status = useHands((s) => s.status);
    const error = useHands((s) => s.error);
    const [asked, setAsked] = useState(false);
    const shapeStatus = useRef<DemoStatus>({ state: "none" });
    const label = useRef<HTMLDivElement>(null);
    const preview = useRef<HTMLVideoElement>(null);
    const running = status === "running";

    // Turned off again on the way out, since only this section uses it here.
    useEffect(() => () => void (useHands.getState().status !== "off" && useHands.getState().setEnabled(false)), []);

    useEffect(() => {
        if (!running) return;
        if (preview.current && live.video) preview.current.srcObject = live.video.srcObject;
        let raf = 0;
        const tick = () => {
            raf = requestAnimationFrame(tick);
            const text = LABEL[shapeStatus.current.state];
            if (label.current && label.current.textContent !== text) label.current.textContent = text;
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [running]);

    const toggle = () => {
        setAsked(true);
        void useHands.getState().setEnabled(!running && status !== "starting");
    };

    return (
        <Section aria-label="Try hand tracking">
            <Copy>
                <span className="kicker">TRY IT NOW</span>
                <h2>Your webcam is the controller</h2>
                <p>Turn on your camera, hold up a hand and pinch your thumb and finger together to pick up a shape. This is the same tracking the editor uses.</p>
                <Button onClick={toggle} data-on={running || undefined}>
                    {status === "starting" ? (
                        <CircleNotch size={20} className="spin" />
                    ) : running ? (
                        <CameraSlash size={20} weight="bold" />
                    ) : (
                        <Camera size={20} weight="bold" />
                    )}
                    {status === "starting" ? "Starting the camera…" : running ? "Turn the camera off" : "Turn on the camera"}
                </Button>
                <small>
                    <ShieldCheck size={16} />
                    Video never leaves your device. Tracking runs in your browser.
                </small>
            </Copy>
            <Box>
                {running ? (
                    <>
                        <Suspense fallback={null}>
                            <HandDemoScene status={shapeStatus} />
                        </Suspense>
                        <Preview ref={preview} autoPlay muted playsInline />
                        <Status ref={label} role="status">
                            {LABEL.none}
                        </Status>
                    </>
                ) : (
                    <Off>
                        <HandGrabbing size={44} weight="duotone" />
                        {asked && status === "error" ? error : "Three shapes are waiting for your hand."}
                    </Off>
                )}
            </Box>
        </Section>
    );
}
