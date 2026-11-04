import { useEffect, useState } from "react";
import styled from "styled-components";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { ArrowsOutCardinal, CaretDown, Check, CloudArrowUp, Hand, PaintBrush, Sparkle, X } from "@phosphor-icons/react";
import { useAccount } from "../account/store";
import { warmUpHands } from "../hands/tracker";
import { useScene } from "../scene/store";
import { COMPACT } from "../ui/compact";
import { EASE_OUT, EASE_OUT_CSS, rise } from "../ui/motion";
import { useUI } from "../ui/store";
import { useTools } from "../viewport/tools";
import { STEPS, useFirstSteps, type Step } from "./firstStepsStore";
import { hideGuide, showGuide } from "./guideStore";
import { useDraggable } from "../ui/hooks";
import { Button, IconButton } from "./ui";

// A short checklist for new visitors, in the corner of the editor. Each step
// ticks itself off when they do it, and "Show me" starts it for them.

// Bottom middle until it's dragged somewhere else (by its header).
const Spot = styled.div`
    position: absolute;
    left: 50%;
    translate: -50% 0;
    bottom: calc(var(--gap) + 12px + var(--bottom-offset, 0px));
    width: 290px;
    // Above the panels, so it stays in reach wherever it's dragged.
    z-index: 64;

    @media ${COMPACT} {
        left: 12px;
        right: 12px;
        translate: none;
        width: auto;
        // Under the bottom sheets on phones.
        z-index: 24;
        bottom: calc(var(--gap) * 2 + 48px + env(safe-area-inset-bottom, 0px) + var(--bottom-offset, 0px));
    }
`;

const Card = styled(m.section)`
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14);
    overflow: hidden;

    > header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 8px 10px 12px;
    }
    > header button.toggle {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        padding: 0;
        border: 0;
        background: none;
        color: var(--text);
        text-align: left;
        font-weight: 600;
    }
    > header small {
        display: block;
        color: var(--text-muted);
        font-weight: 400;
        font-size: 12px;
    }
    .caret {
        margin-left: auto;
        color: var(--text-faint);
        transition: transform 0.2s ease;
    }
    .caret[data-open="true"] {
        transform: rotate(180deg);
    }
`;

const Ring = styled.svg`
    flex-shrink: 0;
    circle {
        fill: none;
        stroke-width: 3;
    }
    .track {
        stroke: var(--surface-raised);
    }
    .bar {
        stroke: var(--accent);
        stroke-linecap: round;
        transition: stroke-dashoffset 0.5s ${EASE_OUT_CSS};
    }
`;

const List = styled.ol`
    list-style: none;
    margin: 0;
    padding: 0 8px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const Row = styled.li<{ $done: boolean; $next: boolean }>`
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    padding: 4px 4px 4px 6px;
    border-radius: 10px;
    background: ${(p) => (p.$next ? "var(--accent-soft)" : "transparent")};
    color: ${(p) => (p.$done ? "var(--text-muted)" : "var(--text)")};

    .mark {
        width: 22px;
        height: 22px;
        flex-shrink: 0;
        display: grid;
        place-items: center;
        border-radius: 50%;
        border: 1.5px solid ${(p) => (p.$done ? "var(--success)" : "var(--border-strong)")};
        background: ${(p) => (p.$done ? "var(--success)" : "transparent")};
        color: #fff;
    }
    .label {
        flex: 1;
        min-width: 0;
        text-decoration: ${(p) => (p.$done ? "line-through" : "none")};
        text-decoration-color: var(--text-faint);
    }
`;

const Done = styled(m.div)`
    padding: 4px 14px 14px;
    text-align: center;

    .burst {
        font-size: 30px;
        color: var(--accent);
    }
    p {
        margin: 4px 0 12px;
        color: var(--text-muted);
    }
`;

// What each step is, and how "Show me" points the way: it gets things ready
// (opens the panel, picks a shape) and puts a guide on the control to use.
const INFO: Record<Step, { label: string; Icon: typeof Sparkle; show: () => void }> = {
    ask: {
        label: "Ask the assistant to build something",
        Icon: Sparkle,
        show: () => {
            useUI.getState().setShowChat(true);
            showGuide({ target: 'textarea[aria-label="Message the assistant"]', text: "Type what you'd like, like “a snowman with a top hat”, and press Enter." });
        },
    },
    move: {
        label: "Drag a shape somewhere new",
        Icon: ArrowsOutCardinal,
        show: () => {
            pickShape();
            showGuide({ target: 'canvas', text: "Press on the shape and drag it across the floor. The arrow on top lifts it and the ball on the ring turns it." });
        },
    },
    color: {
        label: "Give it a new color",
        Icon: PaintBrush,
        show: () => {
            pickShape();
            useUI.getState().setShowInspector(true);
            showGuide({ target: 'button[aria-label^="Color: #"]', text: "Click here and pick a color." });
        },
    },
    hands: {
        label: "Try building with your hands",
        Icon: Hand,
        show: () =>
            showGuide({
                target: 'button[title="Turn on hand control"], button[title="More"]',
                text: window.matchMedia(COMPACT).matches ? "Open this menu and choose Hand control, then allow the camera." : "Click Hands and allow the camera. Then raise a hand.",
            }),
    },
    share: {
        label: "Save it so it's there next time",
        Icon: CloudArrowUp,
        show: () =>
            showGuide({
                target: '[data-guide="account"], button[title="More"]',
                text: useAccount.getState().user ? "Open your account menu and choose Save to the cloud." : "Sign in with your email, then choose Save to the cloud from this menu.",
            }),
    },
};

// Selects a shape to work on, adding a box when the scene has none.
function pickShape() {
    const scene = useScene.getState();
    if (!scene.doc.objects.length) scene.run({ type: "add", primitive: "box" });
    const first = useScene.getState().doc.objects[0];
    if (first) useScene.getState().select(first.id);
    useTools.getState().setTool("select");
}

export function FirstSteps() {
    const active = useFirstSteps((s) => s.active);
    const done = useFirstSteps((s) => s.done);
    const hide = useFirstSteps((s) => s.hide);
    const started = useScene((s) => s.doc.objects.length > 0);
    const onboarding = useUI((s) => s.showOnboarding);
    const [open, setOpen] = useState(() => !window.matchMedia(COMPACT).matches);
    const count = STEPS.filter((s) => done.includes(s)).length;
    const finished = count === STEPS.length;
    const next = STEPS.find((s) => !done.includes(s));
    const drag = useDraggable<HTMLDivElement>("first-steps");

    // A step done puts its guide away.
    useEffect(() => hideGuide, [count]);

    // Open again for the moment of finishing, so it's seen.
    useEffect(() => {
        if (finished) setOpen(true);
    }, [finished]);

    // Waits for the welcome and the get-started card, so it isn't one more
    // thing on an empty screen.
    const show = active && !onboarding && (started || count > 0);
    const r = 9;
    const length = 2 * Math.PI * r;

    return (
        <AnimatePresence>
            {show && (
                <Spot key="first-steps" ref={drag.ref} style={drag.style}>
                    <Card {...rise} aria-label="First steps">
                        <header {...drag.handle}>
                            <button type="button" className="toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
                                <Ring width="24" height="24" viewBox="0 0 24 24" aria-hidden>
                                    <circle className="track" cx="12" cy="12" r={r} />
                                    <circle className="bar" cx="12" cy="12" r={r} strokeDasharray={length} strokeDashoffset={length * (1 - count / STEPS.length)} transform="rotate(-90 12 12)" />
                                </Ring>
                                <span>
                                    First steps
                                    <small>
                                        {count} of {STEPS.length} done
                                    </small>
                                </span>
                                <CaretDown className="caret" data-open={open} size={14} weight="bold" />
                            </button>
                            <IconButton title="Hide first steps" onClick={hide}>
                                <X size={14} />
                            </IconButton>
                        </header>
                        <AnimatePresence initial={false}>
                            {open && (
                                <m.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: EASE_OUT }}>
                                    {finished ? (
                                        <Done initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 320, damping: 18 }}>
                                            <m.div className="burst" animate={{ rotate: [0, -12, 12, 0], scale: [1, 1.25, 1] }} transition={{ duration: 0.7 }}>
                                                <Sparkle weight="fill" />
                                            </m.div>
                                            <b>You've got the basics</b>
                                            <p>The gesture guide in Settings has more you can do with your hands.</p>
                                            <Button $variant="primary" onClick={hide}>
                                                Done
                                            </Button>
                                        </Done>
                                    ) : (
                                        <List>
                                            {STEPS.map((step) => {
                                                const { label, Icon, show } = INFO[step];
                                                const isDone = done.includes(step);
                                                return (
                                                    <Row key={step} $done={isDone} $next={step === next}>
                                                        <span className="mark">
                                                            <AnimatePresence initial={false}>
                                                                {isDone ? (
                                                                    <m.span key="tick" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }} style={{ display: "grid" }}>
                                                                        <Check size={12} weight="bold" />
                                                                    </m.span>
                                                                ) : (
                                                                    <Icon size={12} color="var(--text-muted)" />
                                                                )}
                                                            </AnimatePresence>
                                                        </span>
                                                        <span className="label">{label}</span>
                                                        {!isDone && step === next && (
                                                            <Button $size="sm" $variant="outline" onClick={show} onPointerEnter={step === "hands" ? () => void warmUpHands() : undefined}>
                                                                Show me
                                                            </Button>
                                                        )}
                                                    </Row>
                                                );
                                            })}
                                        </List>
                                    )}
                                </m.div>
                            )}
                        </AnimatePresence>
                    </Card>
                </Spot>
            )}
        </AnimatePresence>
    );
}
