import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import styled from "styled-components";
import { ArrowUp, Crosshair, ImageSquare, Microphone, Square, X } from "@phosphor-icons/react";
import { selectSelected, useScene } from "../../scene/store";
import { useAssistant, type Attachment } from "../../assistant/store";
import { MAX_ATTACHMENTS, readAttachment } from "./images";
import { LIMITS } from "@shapeshift/shared/assistant/protocol";
import { useSpeechInput } from "./useSpeechInput";
import { parseQuickCommand } from "../../assistant/quickCommands";
import { runQuickCommand } from "../../assistant/runQuickCommand";

const Root = styled.form<{ $dropping?: boolean }>`
    margin: 0 10px 10px;
    border: 1px solid var(--border-strong);
    border-radius: 12px;
    background: var(--bg);
    transition: border-color 0.12s ease;
    flex-shrink: 0;

    &:focus-within {
        border-color: color-mix(in srgb, var(--accent) 70%, transparent);
    }
    ${(p) => (p.$dropping ? "border-color: var(--accent); border-style: dashed;" : "")}
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

const Attachments = styled.div`
    display: flex;
    gap: 6px;
    padding: 8px 10px 0;
`;

const Thumb = styled.div`
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border-strong);

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }
    button {
        position: absolute;
        top: 2px;
        right: 2px;
        display: grid;
        place-items: center;
        width: 16px;
        height: 16px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.7);
        color: #fff;
    }
`;

const HiddenInput = styled.input`
    display: none;
`;

const Notice = styled.div`
    padding: 0 12px 2px;
    color: var(--danger);
    font-size: 11px;
`;

export const RoundButton = styled.button<{ $tone?: "accent" | "danger" | "plain"; $live?: boolean }>`
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
    ${(p) => (p.$live ? "color: var(--danger); box-shadow: 0 0 0 2px color-mix(in srgb, var(--danger) 35%, transparent);" : "")}

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

    const [notice, setNotice] = useState<string | null>(null);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [dropping, setDropping] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    async function attach(files: Iterable<File>) {
        const images = [...files].filter((f) => f.type.startsWith("image/"));
        if (!images.length) return;
        const room = MAX_ATTACHMENTS - attachments.length;
        if (room <= 0) return setNotice(`You can attach up to ${MAX_ATTACHMENTS} images.`);
        try {
            const read = await Promise.all(images.slice(0, room).map(readAttachment));
            setNotice(null);
            setAttachments((prev) => [...prev, ...read].slice(0, MAX_ATTACHMENTS));
        } catch (err) {
            setNotice(err instanceof Error ? err.message : "Couldn't attach that image.");
        }
    }
    const voice = useSpeechInput({
        onInterim: (t) => {
            setNotice(null);
            setText(t);
        },
        onFinal: (t) => {
            // Short commands like "undo" or "add a box" happen right away, without a prompt.
            const quick = parseQuickCommand(t);
            if (quick) {
                setText("");
                setNotice(runQuickCommand(quick) || null);
                return;
            }
            if (useAssistant.getState().running) return setText(t);
            send(t);
            setText("");
        },
        onError: (message) => {
            setText("");
            setNotice(message);
        },
    });

    useImperativeHandle(ref, () => ({ focus: () => fieldRef.current?.focus(), setText }), []);

    useLayoutEffect(() => {
        const el = fieldRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [text]);

    function submit() {
        if (running || (!text.trim() && !attachments.length)) return;
        send(text, attachments);
        setText("");
        setAttachments([]);
    }

    return (
        <Root
            $dropping={dropping}
            onDragOver={(e) => {
                if (![...e.dataTransfer.items].some((i) => i.type.startsWith("image/"))) return;
                e.preventDefault();
                setDropping(true);
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => {
                setDropping(false);
                if (!e.dataTransfer.files.length) return;
                e.preventDefault();
                void attach(e.dataTransfer.files);
            }}
            onSubmit={(e) => {
                e.preventDefault();
                submit();
            }}
        >
            {attachments.length > 0 && (
                <Attachments>
                    {attachments.map((a, i) => (
                        <Thumb key={i}>
                            <img src={a.thumbnail} alt={`Attachment ${i + 1}`} />
                            <button type="button" title="Remove" onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}>
                                <X size={9} weight="bold" />
                            </button>
                        </Thumb>
                    ))}
                </Attachments>
            )}
            <Field
                ref={fieldRef}
                rows={1}
                value={text}
                maxLength={LIMITS.promptChars}
                aria-label="Message the assistant"
                data-chat-input
                placeholder={voice.listening ? "Listening…" : placeholderOverride ?? (selected ? `Change ${selected.name}…` : "Describe a change or something to build…")}
                onChange={(e) => setText(e.target.value)}
                onPaste={(e) => {
                    const files = [...e.clipboardData.files];
                    if (!files.some((f) => f.type.startsWith("image/"))) return;
                    e.preventDefault();
                    void attach(files);
                }}
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
            {notice && <Notice role="alert">{notice}</Notice>}
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
                <RoundButton type="button" $tone="plain" title="Attach a reference image" onClick={() => fileRef.current?.click()} disabled={attachments.length >= MAX_ATTACHMENTS}>
                    <ImageSquare size={15} />
                </RoundButton>
                <HiddenInput
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                        if (e.target.files) void attach(e.target.files);
                        e.target.value = "";
                    }}
                />
                {voice.supported && (
                    <RoundButton
                        type="button"
                        $tone="plain"
                        $live={voice.listening}
                        aria-pressed={voice.listening}
                        title={voice.listening ? "Stop listening and send" : "Speak a request"}
                        onClick={voice.toggle}
                    >
                        <Microphone size={15} weight={voice.listening ? "fill" : "regular"} />
                    </RoundButton>
                )}
                {running ? (
                    <RoundButton type="button" $tone="danger" title="Stop (Esc)" onClick={stop}>
                        <Square size={11} weight="fill" />
                    </RoundButton>
                ) : (
                    <RoundButton type="submit" $tone="accent" title="Send (Enter)" disabled={!text.trim() && !attachments.length}>
                        <ArrowUp size={15} weight="bold" />
                    </RoundButton>
                )}
            </Bar>
        </Root>
    );
});
