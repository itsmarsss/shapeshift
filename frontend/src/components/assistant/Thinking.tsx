import { useState } from "react";
import styled, { keyframes } from "styled-components";
import { CaretRight, Lightbulb } from "@phosphor-icons/react";

// The model's thinking, shown as it streams in and folded away once it's
// moved on, so you can watch it work without it crowding the reply.

const pulse = keyframes`
    50% {
        opacity: 0.4;
    }
`;

const Toggle = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    border: 0;
    background: none;
    color: var(--text-faint);
    font-size: 12px;

    &:hover {
        color: var(--text-muted);
    }
    svg {
        transition: rotate 0.15s ease;
    }
    &[aria-expanded="true"] svg:last-child {
        rotate: 90deg;
    }
    &[data-live] svg:first-child {
        color: var(--accent);
        @media (prefers-reduced-motion: no-preference) {
            animation: ${pulse} 1.4s ease-in-out infinite;
        }
    }
`;

const Text = styled.div<{ $live: boolean }>`
    margin: 2px 0 6px 6px;
    padding-left: 10px;
    border-left: 2px solid var(--border);
    color: var(--text-faint);
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    ${(p) =>
        p.$live &&
        `
        max-height: 4.5em;
        overflow: hidden;
        display: flex;
        flex-direction: column-reverse;
        mask-image: linear-gradient(to bottom, transparent, #000 40%);
    `}
`;

export function Thinking({ text, live }: { text: string; live: boolean }) {
    const [open, setOpen] = useState(false);
    // While it's thinking, the newest lines show on their own.
    const showing = live || open;
    return (
        <div>
            <Toggle type="button" aria-expanded={open} data-live={live || undefined} onClick={() => setOpen((v) => !v)}>
                <Lightbulb size={13} weight={live ? "fill" : "regular"} />
                {live ? "Thinking…" : open ? "Hide thinking" : "Show thinking"}
                {!live && <CaretRight size={11} weight="bold" />}
            </Toggle>
            {showing && (
                <Text $live={live && !open}>
                    <span>{text.trim()}</span>
                </Text>
            )}
        </div>
    );
}
