import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { PaperPlaneRight, X } from "@phosphor-icons/react";
import { selectSelected, useScene } from "../scene/store";
import { useAssistant } from "../assistant/store";
import { useUI } from "../ui/store";
import { IconButton, Input, Panel, PanelHeader, PanelTitle } from "./ui";

const Root = styled(Panel)`
    top: calc(var(--topbar) + var(--gap));
    bottom: var(--gap);
    right: var(--gap);
    width: var(--chat-width);
    z-index: 50;
`;

const Messages = styled.div`
    flex: 1;
    padding: 12px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const Message = styled.div<{ $role: "user" | "assistant" }>`
    align-self: ${(p) => (p.$role === "user" ? "flex-end" : "flex-start")};
    background: ${(p) => (p.$role === "user" ? "var(--accent)" : "var(--surface-raised)")};
    color: ${(p) => (p.$role === "user" ? "var(--accent-text)" : "var(--text)")};
    padding: 7px 11px;
    border-radius: 14px;
    max-width: 85%;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
`;

const Pending = styled.div`
    color: var(--text-muted);
    padding: 0 4px;
`;

const Examples = styled.div`
    margin-top: auto;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
`;

const Example = styled.button`
    border: 1px solid var(--border);
    background: transparent;
    border-radius: 999px;
    padding: 5px 11px;
    color: var(--text-muted);

    &:hover {
        color: var(--text);
        border-color: var(--border-strong);
    }
`;

const Form = styled.form`
    display: flex;
    gap: 6px;
    padding: 8px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
`;

const EXAMPLES = ["Add a red sphere", "Make it twice as wide", "Build a table with four legs"];

export function ChatPanel() {
    const show = useUI((s) => s.showChat);
    const setShow = useUI((s) => s.setShowChat);
    const selected = useScene(selectSelected);
    const turns = useAssistant((s) => s.turns);
    const busy = useAssistant((s) => s.running);
    const send = useAssistant((s) => s.send);
    const [input, setInput] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, [turns]);

    if (!show) return null;

    return (
        <Root>
            <PanelHeader>
                <PanelTitle>Assistant</PanelTitle>
                <IconButton title="Close" onClick={() => setShow(false)}>
                    <X size={16} />
                </IconButton>
            </PanelHeader>
            <Messages ref={scrollRef}>
                {turns.length === 0 && (
                    <Examples>
                        {EXAMPLES.map((ex) => (
                            <Example key={ex} onClick={() => send(ex)}>
                                {ex}
                            </Example>
                        ))}
                    </Examples>
                )}
                {turns.map((t) => (
                    <div key={t.id} style={{ display: "contents" }}>
                        <Message $role="user">{t.prompt}</Message>
                        {t.items.map((item, i) => (
                            <Message key={i} $role="assistant">
                                {item.kind === "text" ? item.text : item.activities.map((a) => a.label + (a.error ? ` (${a.error})` : "")).join("\n")}
                            </Message>
                        ))}
                        {t.error && <Message $role="assistant">{t.error.message}</Message>}
                    </div>
                ))}
                {busy && <Pending>Thinking…</Pending>}
            </Messages>
            <Form
                onSubmit={(e) => {
                    e.preventDefault();
                    const text = input;
                    setInput("");
                    send(text);
                }}
            >
                <Input
                    placeholder={selected ? `Change ${selected.name}…` : "Describe a change…"}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                />
                <IconButton type="submit" title="Send" disabled={!input.trim() || busy}>
                    <PaperPlaneRight size={18} />
                </IconButton>
            </Form>
        </Root>
    );
}

export default ChatPanel;
