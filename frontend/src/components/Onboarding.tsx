import { useEffect, useState } from "react";
import styled from "styled-components";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "./ui";
import { useUI } from "../ui/store";
import { useAssistant } from "../assistant/store";
import { useResolvedTheme } from "../settings/theme";

const Backdrop = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 1000;
`;

const Dialog = styled.div`
    width: min(560px, 100%);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
`;

const Stage = styled.div`
    aspect-ratio: 7 / 4;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
`;

const Shot = styled.img`
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
`;

const Body = styled.div`
    padding: 20px 20px 0;
    min-height: 96px;
`;

const Title = styled.div`
    font-size: 17px;
    font-weight: 600;
    margin-bottom: 6px;
`;

const Text = styled.div`
    color: var(--text-muted);
    line-height: 1.5;
`;

const Footer = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 20px;
`;

const Dots = styled.div`
    display: flex;
    gap: 6px;
`;

const Dot = styled.button<{ $active: boolean }>`
    width: 6px;
    height: 6px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: ${(p) => (p.$active ? "var(--text)" : "var(--border-strong)")};
`;

const Actions = styled.div`
    display: flex;
    gap: 6px;
`;

const Ideas = styled.div`
    height: 100%;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    align-content: center;
    gap: 10px;
    padding: 20px;

    @media (max-width: 480px) {
        gap: 8px;
        padding: 12px;
    }
`;

const Idea = styled.button`
    display: flex;
    flex-direction: column;
    padding: 0;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface-raised);
    color: var(--text);
    text-align: left;
    overflow: hidden;
    transition: border-color 0.12s ease, background 0.12s ease;

    img {
        display: block;
        width: 100%;
        aspect-ratio: 3 / 2;
        object-fit: cover;
    }

    span {
        padding: 8px 10px 10px;
        font-size: 13px;
        line-height: 1.3;
    }

    &:hover {
        border-color: var(--border-strong);
        background: var(--surface-hover);
    }
`;

const IDEAS = [
    { image: "snowman", label: "A snowman", prompt: "Build a snowman with a hat and a carrot nose" },
    { image: "table", label: "A table and chairs", prompt: "Make a wooden table with four chairs" },
    { image: "rocket", label: "A rocket", prompt: "Create a small rocket on a launch pad" },
];

const STEPS = [
    {
        image: "assistant",
        title: "Describe what you want",
        text: "Tell the assistant what to build or change, and it edits the scene for you. Press / to start typing.",
    },
    {
        image: "shapes",
        title: "Or shape it yourself",
        text: "Add shapes from the toolbar or with keys 1 to 6. Select one to move it, or press E to rotate and R to scale.",
    },
    {
        image: "hands",
        title: "Use your hands",
        text: "Turn on hand control and your camera follows your hands. Pinch to grab an object, and use your other hand to turn the view.",
    },
    {
        image: "together",
        title: "Build together",
        text: "Press Share to get a live link. Everyone in the room edits the same scene and sees each other's cursors.",
    },
];

const src = (name: string, theme: string) => `/onboarding/${name}-${theme}.webp`;

export function Onboarding() {
    const setOpen = useUI((s) => s.setShowOnboarding);
    const theme = useResolvedTheme();
    const [step, setStep] = useState(0);
    const last = step === STEPS.length;

    function start(prompt?: string) {
        setOpen(false);
        if (!prompt) return;
        useUI.getState().setShowChat(true);
        useAssistant.getState().send(prompt);
    }

    useEffect(() => {
        for (const name of [...STEPS.map((s) => s.image), ...IDEAS.map((i) => i.image)]) new Image().src = src(name, theme);
    }, [theme]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, STEPS.length));
            else if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [setOpen]);

    const current = STEPS[step];

    return (
        <Backdrop>
            <Dialog role="dialog" aria-modal="true" aria-label="Welcome to ShapeShift">
                <Stage>
                    {last ? (
                        <Ideas>
                            {IDEAS.map((idea) => (
                                <Idea key={idea.image} type="button" onClick={() => start(idea.prompt)}>
                                    <img src={src(idea.image, theme)} alt="" />
                                    <span>{idea.label}</span>
                                </Idea>
                            ))}
                        </Ideas>
                    ) : (
                        <Shot src={src(current.image, theme)} alt="" />
                    )}
                </Stage>
                <Body>
                    <Title>{last ? "Start with an idea" : current.title}</Title>
                    <Text>{last ? "Pick one to watch the assistant build it, or start with an empty scene." : current.text}</Text>
                </Body>
                <Footer>
                    <Dots>
                        {[...STEPS, null].map((_, i) => (
                            <Dot key={i} type="button" aria-label={`Step ${i + 1}`} $active={i === step} onClick={() => setStep(i)} />
                        ))}
                    </Dots>
                    <Actions>
                        {step > 0 ? (
                            <Button type="button" onClick={() => setStep(step - 1)}>
                                Back
                            </Button>
                        ) : (
                            <Button type="button" onClick={() => setOpen(false)}>
                                Skip
                            </Button>
                        )}
                        {last ? (
                            <Button type="button" $variant="primary" onClick={() => start()}>
                                Empty scene
                            </Button>
                        ) : (
                            <Button type="button" $variant="primary" onClick={() => setStep(step + 1)}>
                                Next
                                <ArrowRight size={14} />
                            </Button>
                        )}
                    </Actions>
                </Footer>
            </Dialog>
        </Backdrop>
    );
}

export default Onboarding;
