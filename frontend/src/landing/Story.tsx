import { lazy, Suspense, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HandGrabbing, Microphone, Printer, Shapes } from "@phosphor-icons/react";

gsap.registerPlugin(ScrollTrigger);

const StoryScene = lazy(() => import("./StoryScene"));

const STEPS = [
    { Icon: Shapes, title: "Start with simple shapes", text: "Boxes, cones and cylinders come together into anything you can picture." },
    { Icon: HandGrabbing, title: "Grab them with your hands", text: "Pinch in the air to pick up a piece and turn it. Reach toward the screen to push it back." },
    { Icon: Microphone, title: "Or just say it", text: "“Make the roof red.” The assistant does it, and it's one undo away if you change your mind." },
    { Icon: Printer, title: "Then make it real", text: "Export it for a 3D printer, record it as a video, or send a link and build it together." },
];

// Tall enough that each step gets a good scroll's worth.
const Track = styled.section`
    position: relative;
    height: 420vh;
`;

// Stays on screen while the reader scrolls through the track.
const Pinned = styled.div`
    position: sticky;
    top: 60px;
    height: calc(100svh - 60px);
    overflow: hidden;
`;

const Stage = styled.div`
    position: absolute;
    inset: 0 0 0 38%;
    // Fades in from the captions' side instead of starting at a hard edge.
    mask-image: linear-gradient(to right, transparent, #000 22%);

    @media (max-width: 820px) {
        inset: 0 0 36% 0;
        mask-image: linear-gradient(to bottom, #000 80%, transparent);
    }
`;

const Captions = styled.div`
    position: absolute;
    left: max(24px, calc((100% - 1072px) / 2));
    top: 50%;
    translate: 0 -50%;
    width: min(420px, 38%);

    @media (max-width: 820px) {
        top: auto;
        bottom: 24px;
        left: 16px;
        right: 16px;
        width: auto;
        translate: none;
        height: 32%;
    }
`;

const Caption = styled.div<{ $on: boolean }>`
    position: absolute;
    inset: 0 0 auto 0;
    opacity: ${(p) => (p.$on ? 1 : 0)};
    translate: 0 ${(p) => (p.$on ? 0 : "18px")};
    transition:
        opacity 0.45s ease,
        translate 0.45s cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: none;

    @media (max-width: 820px) {
        inset: auto 0 0 0;
    }

    .count {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--accent);
        font-weight: 700;
        font-size: 13px;
        letter-spacing: 0.04em;
    }
    h2 {
        margin: 12px 0 12px;
        font-size: clamp(30px, 4.4vw, 52px);
        line-height: 1.04;
        letter-spacing: -0.035em;
    }
    p {
        margin: 0;
        color: var(--text-muted);
        font-size: 17px;
        line-height: 1.55;
    }
`;

const Progress = styled.div`
    position: absolute;
    left: max(24px, calc((100% - 1072px) / 2));
    bottom: 32px;
    width: 140px;
    height: 3px;
    border-radius: 2px;
    background: var(--border-strong);
    overflow: hidden;

    i {
        display: block;
        height: 100%;
        background: var(--accent);
        transform-origin: left;
        transform: scaleX(0);
    }
    @media (max-width: 820px) {
        display: none;
    }
`;

// The scroll story: a 3D scene that builds, grabs, paints and prints a house
// as the reader scrolls, with a caption for each step.
export function Story() {
    const track = useRef<HTMLElement>(null);
    const bar = useRef<HTMLElement>(null);
    const progress = useRef(0);
    const [step, setStep] = useState(0);

    useEffect(() => {
        const el = track.current;
        if (!el) return;
        // Pages scroll inside the site frame rather than the window.
        const scroller = el.closest<HTMLElement>("[data-scroller]") ?? undefined;
        const trigger = ScrollTrigger.create({
            trigger: el,
            scroller,
            start: "top top",
            end: "bottom bottom",
            onUpdate: (self) => {
                progress.current = self.progress;
                if (bar.current) bar.current.style.transform = `scaleX(${self.progress})`;
                setStep(Math.min(STEPS.length - 1, Math.floor(self.progress * STEPS.length)));
            },
        });
        return () => trigger.kill();
    }, []);

    return (
        <Track ref={track} aria-label="How it works">
            <Pinned>
                <Stage>
                    <Suspense fallback={null}>
                        <StoryScene progress={progress} />
                    </Suspense>
                </Stage>
                <Captions>
                    {STEPS.map(({ Icon, title, text }, i) => (
                        <Caption key={title} $on={i === step} aria-hidden={i !== step}>
                            <span className="count">
                                <Icon size={18} weight="bold" />
                                {String(i + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
                            </span>
                            <h2>{title}</h2>
                            <p>{text}</p>
                        </Caption>
                    ))}
                </Captions>
                <Progress aria-hidden>
                    <i ref={bar} />
                </Progress>
            </Pinned>
        </Track>
    );
}
