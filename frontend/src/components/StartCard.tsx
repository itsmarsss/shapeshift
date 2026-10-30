import { useState } from "react";
import styled from "styled-components";
import { Cube, Hand, Shapes, Sparkle, X } from "@phosphor-icons/react";
import { useScene } from "../scene/store";
import { useHands } from "../hands/tracker";
import { useUI } from "../ui/store";
import { COMPACT } from "../ui/compact";
import { IconButton } from "./ui";

const Card = styled.div`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(calc(-50% - var(--chat-width, 0px) / 2), -50%);
    width: min(400px, calc(100% - 32px - var(--chat-width, 0px)));
    padding: 18px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);
    z-index: 25;

    h2 {
        margin: 0 0 4px;
        font-size: 17px;
    }
    p {
        margin: 0 0 14px;
        color: var(--text-muted);
    }

    @media ${COMPACT} {
        top: auto;
        bottom: calc(var(--gap) + env(safe-area-inset-bottom, 0px) + var(--bottom-offset, 0px));
        transform: translateX(-50%);
        width: calc(100% - 24px);
    }
`;

const Close = styled(IconButton)`
    position: absolute;
    top: 10px;
    right: 10px;
`;

const Try = styled.button`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 12px 14px;
    margin-bottom: 8px;
    border: 1px solid var(--accent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--text);
    text-align: left;

    svg {
        color: var(--accent);
        flex-shrink: 0;
    }
    small {
        display: block;
        color: var(--text-muted);
    }
    &:hover {
        background: color-mix(in srgb, var(--accent) 16%, transparent);
    }
`;

const Options = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;

    button {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 10px 6px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: transparent;
        color: var(--text);
        font-size: 12px;
    }
    button:hover {
        background: var(--surface-hover);
    }
    svg {
        color: var(--text-muted);
    }
`;

const PROMPT = "Build a snowman with a hat and a carrot nose";

// Shown on an empty scene so the first minute starts with a win instead of a
// blank canvas. It goes away once there's anything in the scene.
export function StartCard() {
    const empty = useScene((s) => s.doc.objects.length === 0 && s.doc.lights.length === 0);
    const [dismissed, setDismissed] = useState(false);
    if (!empty || dismissed) return null;

    async function ask() {
        setDismissed(true);
        useUI.getState().setShowChat(true);
        // Loaded on demand, like the chat panel, to keep the first load small.
        const { useAssistant } = await import("../assistant/store");
        useAssistant.getState().send(PROMPT);
    }

    return (
        <Card role="region" aria-label="Get started">
            <Close title="Hide" onClick={() => setDismissed(true)}>
                <X size={16} />
            </Close>
            <h2>Let's make something</h2>
            <p>Describe it, start from a template, or build it shape by shape.</p>
            <Try onClick={() => void ask()}>
                <Sparkle size={20} weight="fill" />
                <span>
                    Try saying “build a snowman”
                    <small>The assistant builds it for you. Click to try it now.</small>
                </span>
            </Try>
            <Options>
                <button onClick={() => useUI.getState().setShowTemplates(true)}>
                    <Shapes size={20} />
                    Templates
                </button>
                <button onClick={() => useScene.getState().run({ type: "add", primitive: "box" })}>
                    <Cube size={20} />
                    Add a box
                </button>
                <button onClick={() => void useHands.getState().setEnabled(true)}>
                    <Hand size={20} />
                    Use your hands
                </button>
            </Options>
        </Card>
    );
}

export default StartCard;
