import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import styled from "styled-components";
import { ArrowUp, Crosshair, Square, X } from "@phosphor-icons/react";
import { selectSelected, useScene } from "../../scene/store";
import { useAssistant } from "../../assistant/store";
import { LIMITS } from "../../assistant/protocol";

const Root = styled.form`
    margin: 0 10px 10px;
    border: 1px solid var(--border-strong);
    border-radius: 12px;
    background: var(--bg);
    transition: border-color 0.12s ease;
    flex-shrink: 0;

    &:focus-within {
        border-color: color-mix(in srgb, var(--accent) 70%, transparent);
    }
`;

const Field = styled.textarea`
    display: block;
    width: 100%;
    min-height: 40px;
    max-height: 160px;
    resize: none;
    padding: 10px 12px 4px;
    border: 0;
    background: transparent;
    line-height: 1.45;
    outline: none;

    &::placeholder {
        color: var(--text-faint);
    }
`;

const Bar = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px 6px 8px;
`;

const Chip = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 180px;
    height: 22px;
    padding: 0 2px 0 7px;
    border-radius: 6px;
    background: var(--surface-raised);
    color: var(--text-muted);
    font-size: 11px;

    span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    button {
        display: inline-flex;
        padding: 2px;
        border: 0;
        border-radius: 4px;
        background: none;
        color: var(--text-faint);
    }
    button:hover {
        color: var(--text);
    }
`;

export const RoundButton = styled.button<{ $tone?: "accent" | "danger" | "plain" }>`
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 0;
    background: ${(p) => (p.$tone === "accent" ? "var(--accent)" : p.$tone === "danger" ? "var(--danger)" : "transparent")};
    color: ${(p) => (p.$tone === "plain" ? "var(--text-muted)" : "#fff")};
    transition: opacity 0.12s ease, background 0.12s ease;

    &:hover:not(:disabled) {
        background: ${(p) => (p.$tone === "plain" ? "var(--surface-hover)" : undefined)};
        color: ${(p) => (p.$tone === "plain" ? "var(--text)" : undefined)};
        opacity: ${(p) => (p.$tone === "plain" ? 1 : 0.9)};
    }
    &:disabled {
        background: ${(p) => (p.$tone === "plain" ? "transparent" : "var(--surface-raised)")};
        color: var(--text-faint);
    }
`;

export type ComposerHandle = { focus: () => void; setText: (text: string) => void };

export const Composer = forwardRef<ComposerHandle, { extra?: React.ReactNode; placeholderOverride?: string }>(function Composer({ extra, placeholderOverride }, ref) {
    const [text, setText] = useState("");
    const fieldRef = useRef<HTMLTextAreaElement>(null);
    const selected = useScene(selectSelected);
    const select = useScene((s) => s.select);
    const running = useAssistant((s) => s.running);
    const send = useAssistant((s) => s.send);
    const stop = useAssistant((s) => s.stop);
    const lastPrompt = useAssistant((s) => s.turns[s.turns.length - 1]?.prompt);

    useImperativeHandle(ref, () => ({ focus: () => fieldRef.current?.focus(), setText }), []);

    useLayoutEffect(() => {
        const el = fieldRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [text]);

    function submit() {
        if (running || !text.trim()) return;
        send(text);
        setText("");
    }

    return (
        <Root
            onSubmit={(e) => {
                e.preventDefault();
                submit();
            }}
        >
            <Field
                ref={fieldRef}
                rows={1}
                value={text}
                maxLength={LIMITS.promptChars}
                aria-label="Message the assistant"
                placeholder={placeholderOverride ?? (selected ? `Change ${selected.name}…` : "Describe a change or something to build…")}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        submit();
                    } else if (e.key === "Escape" && running) {
                        e.preventDefault();
                        stop();
                    } else if (e.key === "ArrowUp" && !text && lastPrompt) {
                        e.preventDefault();
                        setText(lastPrompt);
                    }
                }}
            />
            <Bar>
                {selected ? (
                    <Chip title="The assistant treats the selection as “it”">
                        <Crosshair size={11} />
                        <span>{selected.name}</span>
                        <button type="button" title="Clear selection" onClick={() => select(null)}>
                            <X size={10} />
                        </button>
                    </Chip>
                ) : null}
                <span style={{ flex: 1 }} />
                {extra}
                {running ? (
                    <RoundButton type="button" $tone="danger" title="Stop (Esc)" onClick={stop}>
                        <Square size={11} weight="fill" />
                    </RoundButton>
                ) : (
                    <RoundButton type="submit" $tone="accent" title="Send (Enter)" disabled={!text.trim()}>
                        <ArrowUp size={15} weight="bold" />
                    </RoundButton>
                )}
            </Bar>
        </Root>
    );
});
