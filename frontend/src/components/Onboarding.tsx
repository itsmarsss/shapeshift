import { useEffect, useState } from "react";
import styled from "styled-components";
import { Button } from "./ui";
import { useUI } from "../ui/store";
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

const Count = styled.span`
    color: var(--text-faint);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
`;

const Actions = styled.div`
    display: flex;
    gap: 6px;
`;

const STEPS = [
    {
        image: "assistant",
        title: "Ask for it",
        text: "Type what you want in the assistant panel and it builds it in the scene. Press / to jump there.",
    },
    {
        image: "shapes",
        title: "Or build it yourself",
        text: "Add shapes from the toolbar or with keys 1 to 6. W, E and R switch between move, rotate and scale.",
    },
    {
        image: "hands",
        title: "Hand control",
        text: "Click the hand in the top bar to use your webcam. Pinch to grab an object. Your other hand turns the view.",
    },
    {
        image: "together",
        title: "Share a live link",
        text: "Click Share and send the link. Everyone who opens it edits the same scene and sees each other's cursors.",
    },
];

const src = (name: string, theme: string) => `/onboarding/${name}-${theme}.webp`;

export function Onboarding() {
    const setOpen = useUI((s) => s.setShowOnboarding);
    const theme = useResolvedTheme();
    const [step, setStep] = useState(0);
    const last = step === STEPS.length - 1;

    useEffect(() => {
        for (const { image } of STEPS) new Image().src = src(image, theme);
    }, [theme]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, STEPS.length - 1));
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
                    <Shot src={src(current.image, theme)} alt="" />
                </Stage>
                <Body>
                    <Title>{current.title}</Title>
                    <Text>{current.text}</Text>
                </Body>
                <Footer>
                    <Count>
                        {step + 1} of {STEPS.length}
                    </Count>
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
                        <Button type="button" $variant="primary" onClick={() => (last ? setOpen(false) : setStep(step + 1))}>
                            {last ? "Done" : "Next"}
                        </Button>
                    </Actions>
                </Footer>
            </Dialog>
        </Backdrop>
    );
}

export default Onboarding;
