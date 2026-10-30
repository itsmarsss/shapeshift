import { useEffect, useState, type ReactNode } from "react";
import styled from "styled-components";
import { ArrowRight, Cube, Cylinder, Hand, Sparkle, Sphere, Square, UsersThree, X } from "@phosphor-icons/react";
import { ConeIcon, TorusIcon } from "./icons";
import { Button, IconButton } from "./ui";
import { useUI } from "../ui/store";
import { useAssistant } from "../assistant/store";

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
    position: relative;
    width: min(440px, 100%);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
`;

const Close = styled(IconButton)`
    position: absolute;
    top: 8px;
    right: 8px;
`;

const Stage = styled.div`
    height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
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

const Key = styled.kbd`
    min-width: 26px;
    height: 26px;
    padding: 0 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: var(--surface);
    font: inherit;
    font-size: 12px;
    color: var(--text-muted);
`;

const Prompt = styled.div`
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid var(--border-strong);
    border-radius: 10px;
    background: var(--surface);
`;

const Mark = styled.span`
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: var(--accent-soft);
    color: var(--accent);
`;

const Column = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    width: 100%;
`;

const Shapes = styled.div`
    display: flex;
    gap: 10px;
`;

const Shape = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--text);
`;

const Tools = styled.div`
    display: flex;
    gap: 16px;
    color: var(--text-muted);
    font-size: 12px;

    span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }
`;

const Faces = styled.div`
    display: flex;
`;

const Face = styled.span<{ $color: string }>`
    width: 40px;
    height: 40px;
    margin-left: -10px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: ${(p) => p.$color};
    color: #fff;
    font-weight: 700;
    border: 3px solid var(--bg);

    &:first-child {
        margin-left: 0;
    }
`;

const Ideas = styled.div`
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const Idea = styled.button`
    text-align: left;
    padding: 9px 11px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface-raised);
    color: var(--text);
    line-height: 1.35;
    transition: border-color 0.12s ease, background 0.12s ease;

    &:hover {
        border-color: var(--border-strong);
        background: var(--surface-hover);
    }
`;

const IDEAS = ["Build a snowman with a hat and a carrot nose", "Make a wooden table with four chairs", "Create a small rocket on a launch pad"];

const SHAPES = [Cube, Sphere, Cylinder, ConeIcon, TorusIcon, Square];

type Step = { title: string; text: string; stage: ReactNode };

const STEPS: Step[] = [
    {
        title: "Describe what you want",
        text: "Tell the assistant what to build or change, and it edits the scene for you. Press / to start typing.",
        stage: (
            <Prompt>
                <Mark>
                    <Sparkle size={16} weight="fill" />
                </Mark>
                Build a lighthouse on a rocky island
            </Prompt>
        ),
    },
    {
        title: "Or shape it yourself",
        text: "Add shapes from the toolbar or with the number keys. Drag to turn the view, and scroll or pinch to zoom.",
        stage: (
            <Column>
                <Shapes>
                    {SHAPES.map((Icon, i) => (
                        <Shape key={i}>
                            <Icon size={24} />
                            <Key>{i + 1}</Key>
                        </Shape>
                    ))}
                </Shapes>
                <Tools>
                    <span>
                        <Key>W</Key> Move
                    </span>
                    <span>
                        <Key>E</Key> Rotate
                    </span>
                    <span>
                        <Key>R</Key> Scale
                    </span>
                </Tools>
            </Column>
        ),
    },
    {
        title: "Use your hands",
        text: "Turn on hand control and your camera follows your hands. Pinch to grab an object, and use your other hand to turn the view.",
        stage: <Hand size={72} weight="light" />,
    },
    {
        title: "Build together",
        text: "Press Share to get a live link. Everyone in the room edits the same scene and sees each other's cursors.",
        stage: (
            <Column>
                <Faces>
                    <Face $color="#e5484d">A</Face>
                    <Face $color="#3e63dd">M</Face>
                    <Face $color="#30a46c">J</Face>
                </Faces>
                <Tools>
                    <span>
                        <UsersThree size={16} /> Share
                    </span>
                </Tools>
            </Column>
        ),
    },
];

export function Onboarding() {
    const setOpen = useUI((s) => s.setShowOnboarding);
    const [step, setStep] = useState(0);
    const last = step === STEPS.length;

    function start(prompt?: string) {
        setOpen(false);
        if (!prompt) return;
        useUI.getState().setShowChat(true);
        useAssistant.getState().send(prompt);
    }

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
                                <Idea key={idea} type="button" onClick={() => start(idea)}>
                                    {idea}
                                </Idea>
                            ))}
                        </Ideas>
                    ) : (
                        current.stage
                    )}
                </Stage>
                <Close title="Close" onClick={() => setOpen(false)}>
                    <X size={16} />
                </Close>
                <Body>
                    <Title>{last ? "Start with an idea" : current.title}</Title>
                    <Text>{last ? "Pick one to see the assistant build it, or start with an empty scene." : current.text}</Text>
                </Body>
                <Footer>
                    <Dots>
                        {[...STEPS, null].map((_, i) => (
                            <Dot key={i} type="button" aria-label={`Step ${i + 1}`} $active={i === step} onClick={() => setStep(i)} />
                        ))}
                    </Dots>
                    <Actions>
                        {step > 0 && (
                            <Button type="button" onClick={() => setStep(step - 1)}>
                                Back
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
