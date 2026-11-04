import { useEffect, useRef, useState } from "react";
import styled, { keyframes } from "styled-components";
import { ArrowUUpLeft, Cube, HandGrabbing, Microphone, MicrophoneSlash } from "@phosphor-icons/react";
import { useScene } from "../scene/store";
import { toggleLook } from "../scene/look";
import { toggleVoice, useVoice } from "../ui/voice";
import { PoseTracker, type Pose } from "./poses";
import { live, useHands } from "./tracker";
import { useHandToast } from "./menu";


const pop = keyframes`
    from { opacity: 0; transform: translate(-50%, 6px) scale(0.96); }
    to { opacity: 1; transform: translate(-50%, 0) scale(1); }
`;

const Toast = styled.div`
    position: absolute;
    left: 50%;
    bottom: calc(var(--gap) + 64px);
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: 999px;
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    font-weight: 500;
    pointer-events: none;
    z-index: 60;
    animation: ${pop} 0.14s ease-out;
`;

type Notice = { id: number; pose: Pose | null; text: string };

function perform(pose: Pose): string {
    const scene = useScene.getState();
    switch (pose) {
        case "voice": {
            const listening = useVoice.getState().listening;
            toggleVoice();
            return listening ? "Sending to the assistant" : "Listening…";
        }
        case "mode": {
            toggleLook();
            return useScene.getState().mode === "render" ? "Preview" : "Back to editing";
        }
        case "undo": {
            if (!scene.past.length) return "Nothing to undo";
            scene.undo();
            return "Undo";
        }
    }
}

// Turns held hand poses into commands: thumb to middle finger talks to the
// assistant, thumb to ring finger previews (and back), thumb to pinky undoes.
export function HandCommands() {
    const status = useHands((s) => s.status);
    const [notice, setNotice] = useState<Notice | null>(null);
    const counter = useRef(0);

    useEffect(() => {
        if (status !== "running") return;
        const poses = new PoseTracker();
        let last = live.frames;
        let raf = 0;
        let hide: ReturnType<typeof setTimeout> | undefined;
        const tick = () => {
            raf = requestAnimationFrame(tick);
            if (live.frames === last) return;
            last = live.frames;
            for (const { pose } of poses.update(live.frames, performance.now())) {
                const text = perform(pose);
                setNotice({ id: ++counter.current, pose, text });
                clearTimeout(hide);
                hide = setTimeout(() => setNotice(null), 1400);
            }
        };
        raf = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(raf);
            clearTimeout(hide);
        };
    }, [status]);

    // Notes from two-hand gestures.
    useEffect(() => {
        let hide: ReturnType<typeof setTimeout> | undefined;
        const stop = useHandToast.subscribe(({ text }) => {
            setNotice({ id: ++counter.current, pose: null, text });
            clearTimeout(hide);
            hide = setTimeout(() => setNotice(null), 1400);
        });
        return () => {
            stop();
            clearTimeout(hide);
        };
    }, []);

    if (!notice || status !== "running") return null;
    const Icon =
        notice.pose === null
            ? HandGrabbing
            : notice.pose === "voice"
              ? notice.text === "Listening…"
                  ? Microphone
                  : MicrophoneSlash
              : notice.pose === "mode"
                ? Cube
                : ArrowUUpLeft;
    return (
        <Toast key={notice.id} role="status">
            <Icon size={16} weight="bold" />
            {notice.text}
        </Toast>
    );
}
