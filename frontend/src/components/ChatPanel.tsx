import { useRef, useState } from "react";
import styled from "styled-components";
import { PaperPlaneRight, X } from "@phosphor-icons/react";
import { selectSelected, useScene } from "../scene/store";
import { describeScene, summarize, toCommands, type ToolCall } from "../assistant/assistant";
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

type Msg = { role: "user" | "assistant"; content: string };

export function ChatPanel() {
    const show = useUI((s) => s.showChat);
    const setShow = useUI((s) => s.setShowChat);
    const selected = useScene(selectSelected);
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    if (!show) return null;

    function append(msg: Msg) {
        setMessages((prev) => [...prev, msg]);
        queueMicrotask(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
    }

    async function send(text: string) {
        const content = text.trim();
        if (!content || busy) return;
        const history = [...messages, { role: "user" as const, content }];
        append({ role: "user", content });
        setBusy(true);
        try {
            const { doc, selectedId, run } = useScene.getState();
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: history, scene: describeScene(doc, selectedId) }),
            });
            if (res.status === 429) return append({ role: "assistant", content: "Too many requests. Wait a minute and try again." });
            if (!res.ok) return append({ role: "assistant", content: "The assistant is unavailable right now." });
            const data = await res.json();
            const message = data?.choices?.[0]?.message ?? {};
            const { commands, errors } = toCommands((message.tool_calls ?? []) as ToolCall[]);
            const results = commands.length ? run(commands) : [];
            const failed = results.flatMap((r) => (r.ok ? [] : [r.error]));
            const done = summarize(commands.filter((_, i) => results[i]?.ok), doc);
            const reply = [String(message.content ?? "").trim() || done, ...errors, ...failed].filter(Boolean).join("\n");
            append({ role: "assistant", content: reply || "I couldn't turn that into an edit." });
        } catch {
            append({ role: "assistant", content: "The assistant is unavailable right now." });
        } finally {
            setBusy(false);
        }
    }

    return (
        <Root>
            <PanelHeader>
                <PanelTitle>Assistant</PanelTitle>
                <IconButton title="Close" onClick={() => setShow(false)}>
                    <X size={16} />
                </IconButton>
            </PanelHeader>
            <Messages ref={scrollRef}>
                {messages.length === 0 && (
                    <Examples>
                        {EXAMPLES.map((ex) => (
                            <Example key={ex} onClick={() => send(ex)}>
                                {ex}
                            </Example>
                        ))}
                    </Examples>
                )}
                {messages.map((m, i) => (
                    <Message key={i} $role={m.role}>
                        {m.content}
                    </Message>
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
