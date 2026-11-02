import { useEffect, useState, type ComponentType } from "react";
import styled, { css, keyframes } from "styled-components";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { ArrowsOut, Check, CursorClick, Hand, HandGrabbing, HandPalm, HandPointing, HandWaving, type IconProps } from "@phosphor-icons/react";
import { useScene } from "../scene/store";
import { useSettings } from "../settings/store";
import { useUI } from "../ui/store";
import { frameSelection } from "../viewport/frame";
import { pop } from "../ui/motion";
import { useHandActivity, useHandMenu } from "./menu";
import { live, useHands } from "./tracker";

// A walk through the gestures the first time hand control is on. Each step
// moves on by itself once the hand has done it; steps the app can't see
// (like pushing an object away) have a button, which a pinch can press too.

type Motion = "wave" | "pinch" | "sway" | "push" | "spread" | "glow" | "tap";

type Step = {
    title: string;
    text: string;
    Icon: ComponentType<IconProps>;
    motion: Motion;
    // Whether the hands have done it yet. Steps without one move on with the button.
    done?: () => boolean;
    // Gets the scene ready for the step.
    setup?: () => void;
};

const activity = () => useHandActivity.getState().activity;

const STEPS: Step[] = [
    {
        title: "Raise a hand",
        text: "Hold a hand up in front of the camera. A ring follows your thumb and finger.",
        Icon: HandWaving,
        motion: "wave",
        done: () => live.hands.length > 0,
    },
    {
        title: "Pinch to look around",
        text: "Over empty space, touch your thumb and index finger together, then move your hand to turn the view.",
        Icon: HandPointing,
        motion: "sway",
        done: () => activity() === "orbit",
    },
    {
        title: "Grab the shape",
        text: "Point at the shape until it lights up, then pinch to pick it up and move it around. Let go to drop it.",
        Icon: HandGrabbing,
        motion: "pinch",
        done: () => activity() === "object",
        setup: () => {
            const scene = useScene.getState();
            scene.setMode("object");
            if (!scene.doc.objects.length) {
                scene.run({ type: "add", primitive: "box" });
                frameSelection();
            }
        },
    },
    {
        title: "Push and pull",
        text: "While you hold a shape, reach toward the screen to push it away, and pull your hand back to bring it closer.",
        Icon: Hand,
        motion: "push",
    },
    {
        title: "Use both hands",
        text: "Pinch with both hands: spread them to zoom, move them together to pan, twist them like a wheel to turn the view. Do it while holding a shape to resize and turn it.",
        Icon: ArrowsOut,
        motion: "spread",
        done: () => activity() === "camera" || activity() === "stretch",
    },
    {
        title: "Two-hand tricks",
        text: "While one hand holds a shape, tap with the other: on empty space it leaves a copy, on another shape it selects that too. Open the other palm for a menu for the shape you're holding.",
        Icon: HandGrabbing,
        motion: "pinch",
    },
    {
        title: "Open your palm",
        text: "Show the camera an open hand and hold it still. A menu appears around it: add shapes, undo, talk to the assistant.",
        Icon: HandPalm,
        motion: "glow",
        done: () => useHandMenu.getState().open !== null,
    },
    {
        title: "Press buttons",
        text: "Point at a button until it's outlined, then pinch and let go to press it. Pinch and move to scroll a panel or drag a slider. Try it on Finish.",
        Icon: CursorClick,
        motion: "tap",
    },
];

const wave = keyframes`
    0%, 100% { transform: rotate(-10deg); }
    50% { transform: rotate(14deg); }
`;
const pinch = keyframes`
    0%, 100% { transform: scale(1); }
    45%, 60% { transform: scale(0.82); }
`;
const sway = keyframes`
    0%, 100% { transform: translateX(-8px); }
    50% { transform: translateX(8px); }
`;
const push = keyframes`
    0%, 100% { transform: scale(1.12); }
    50% { transform: scale(0.8); }
`;
const spread = keyframes`
    0%, 100% { transform: scale(0.85); }
    50% { transform: scale(1.15); }
`;
const glow = keyframes`
    0%, 100% { filter: drop-shadow(0 0 0 var(--accent)); }
    50% { filter: drop-shadow(0 0 10px var(--accent)); }
`;
const tap = keyframes`
    0%, 70%, 100% { transform: translateY(0); }
    80% { transform: translateY(3px) scale(0.92); }
`;
const MOTIONS = { wave, pinch, sway, push, spread, glow, tap };

const Card = styled(m.div)`
    position: absolute;
    top: calc(var(--topbar) + var(--gap) * 2);
    left: calc(50% + (var(--left-inset, 0px) - var(--right-inset, 0px)) / 2);
    translate: -50% 0;
    width: min(440px, calc(100% - 24px));
    padding: 16px 16px 14px;
    display: grid;
    grid-template-columns: 64px 1fr;
    gap: 4px 16px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 18px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
    // Under the hand cursors, above the panels.
    z-index: 80;
`;

const Art = styled.div<{ $motion: Motion; $done: boolean }>`
    grid-row: span 2;
    width: 64px;
    height: 64px;
    border-radius: 16px;
    display: grid;
    place-items: center;
    background: ${(p) => (p.$done ? "color-mix(in srgb, var(--success) 18%, transparent)" : "var(--accent-soft)")};
    color: ${(p) => (p.$done ? "var(--success)" : "var(--accent)")};
    transition: background 0.2s ease, color 0.2s ease;

    svg {
        @media (prefers-reduced-motion: no-preference) {
            ${(p) =>
                !p.$done &&
                css`
                    animation: ${MOTIONS[p.$motion]} 1.6s ease-in-out infinite;
                `}
        }
    }
`;

const Head = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;

    b {
        font-size: 15px;
    }
    small {
        color: var(--text-faint);
        font-variant-numeric: tabular-nums;
    }
`;

const Text = styled.p`
    margin: 0;
    color: var(--text-muted);
    line-height: 1.45;
`;

const Foot = styled.div`
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
`;

const Dots = styled.div`
    display: flex;
    gap: 5px;
    flex: 1;

    i {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--border-strong);
        transition: background 0.2s ease, width 0.2s ease;
    }
    i[data-state="done"] {
        background: var(--success);
    }
    i[data-state="now"] {
        width: 18px;
        border-radius: 4px;
        background: var(--accent);
    }
`;

const Action = styled.button<{ $primary?: boolean }>`
    height: 36px;
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid ${(p) => (p.$primary ? "var(--accent)" : "var(--border-strong)")};
    background: ${(p) => (p.$primary ? "var(--accent)" : "transparent")};
    color: ${(p) => (p.$primary ? "var(--accent-text)" : "var(--text)")};
    font-weight: 600;
`;

// Long enough to see the tick before the next step.
const CELEBRATE_MS = 900;

export function HandTutorial() {
    const running = useHands((s) => s.status === "running");
    const done = useSettings((s) => s.handsTutorialDone);
    const onboarding = useUI((s) => s.showOnboarding);
    const [index, setIndex] = useState(0);
    const [ticked, setTicked] = useState(false);
    const show = running && !done && !onboarding;
    const step = STEPS[index];
    const last = index === STEPS.length - 1;

    const finish = () => useSettings.getState().set({ handsTutorialDone: true });
    const next = () => {
        setTicked(false);
        if (last) finish();
        else setIndex(index + 1);
    };

    useEffect(() => {
        if (show) step.setup?.();
    }, [show, step]);

    // Watches for the step being done, then ticks it and moves on.
    useEffect(() => {
        if (!show || !step.done || ticked) return;
        let raf = 0;
        const watch = () => {
            if (step.done!()) setTicked(true);
            else raf = requestAnimationFrame(watch);
        };
        raf = requestAnimationFrame(watch);
        return () => cancelAnimationFrame(raf);
    }, [show, step, ticked]);

    useEffect(() => {
        if (!ticked) return;
        const timer = setTimeout(() => {
            setTicked(false);
            setIndex((i) => Math.min(i + 1, STEPS.length - 1));
        }, CELEBRATE_MS);
        return () => clearTimeout(timer);
    }, [ticked]);

    return (
        <AnimatePresence>
            {show && (
                <Card key="tutorial" {...pop} role="dialog" aria-label="Hand control tutorial">
                    <Art $motion={step.motion} $done={ticked}>
                        {ticked ? <Check size={30} weight="bold" /> : <step.Icon size={34} weight="duotone" />}
                    </Art>
                    <Head>
                        <b>{ticked ? "Nice!" : step.title}</b>
                        <small>
                            {index + 1} of {STEPS.length}
                        </small>
                    </Head>
                    <Text>{step.text}</Text>
                    <Foot>
                        <Dots aria-hidden>
                            {STEPS.map((_, i) => (
                                <i key={i} data-state={i < index || (i === index && ticked) ? "done" : i === index ? "now" : ""} />
                            ))}
                        </Dots>
                        <Action onClick={finish}>Skip</Action>
                        <Action $primary onClick={next}>
                            {last ? "Finish" : step.done ? "Next" : "Got it"}
                        </Action>
                    </Foot>
                </Card>
            )}
        </AnimatePresence>
    );
}
