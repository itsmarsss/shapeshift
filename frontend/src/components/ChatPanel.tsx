import { useEffect, useRef } from "react";
import styled from "styled-components";
import { NotePencil, Sparkle, X } from "@phosphor-icons/react";
import { selectSelected, useScene } from "../scene/store";
import { useAssistant } from "../assistant/store";
import type { AgentInfo } from "../assistant/protocol";
import { useUI } from "../ui/store";
import { IconButton, Panel } from "./ui";
import { Composer, type ComposerHandle } from "./assistant/Composer";
import { TurnView } from "./assistant/TurnView";

const Root = styled(Panel)`
    top: calc(var(--topbar) + var(--gap));
    bottom: var(--gap);
    right: var(--gap);
    width: var(--chat-width);
    z-index: 50;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    height: 52px;
    padding: 0 8px 0 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
`;

const Mark = styled.div`
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
`;

const Titles = styled.div`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.25;
`;

const Title = styled.div`
    font-weight: 600;
`;

const Subtitle = styled.div`
    color: var(--text-faint);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const Scroll = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 16px 12px 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    scrollbar-width: thin;
`;

const Empty = styled.div`
    margin: auto 0 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
`;

const EmptyTitle = styled.div`
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 4px;
`;

const EmptyText = styled.div`
    color: var(--text-muted);
    line-height: 1.5;
`;

const Suggestions = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const Suggestion = styled.button`
    text-align: left;
    padding: 9px 11px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface-raised);
    color: var(--text);
    line-height: 1.35;
    transition: border-color 0.12s ease, background 0.12s ease;

    &:hover:not(:disabled) {
        border-color: var(--border-strong);
        background: var(--surface-hover);
    }
`;

const Hint = styled.div`
    padding: 0 14px 10px;
    margin-top: -4px;
    color: var(--text-faint);
    font-size: 11px;
    flex-shrink: 0;
`;

const MODEL_NAMES: Record<string, string> = {
    "claude-opus-5-5": "Claude Opus 5.5",
    "claude-sonnet-5-5": "Claude Sonnet 5.5",
    "claude-fable-5-1": "Claude Fable 5.1",
    "claude-haiku-4-5": "Claude Haiku 4.5",
    "@cf/zai-org/glm-4.7-flash": "GLM 4.7 Flash",
};

const modelName = (info: AgentInfo) => MODEL_NAMES[info.model] ?? info.model;

function useSuggestions(): string[] {
    const count = useScene((s) => s.doc.objects.length);
    const selected = useScene(selectSelected);
    if (selected) {
        return [`Make ${selected.name} brushed gold`, `Make ${selected.name} twice as tall`, `Put a small red sphere on top of ${selected.name}`];
    }
    if (count === 0) {
        return ["Build a snowman with a hat and a carrot nose", "Make a wooden table with four chairs", "Create a small rocket on a launch pad"];
    }
    return ["Line up five spheres in rainbow colors", "Add a ground plane under everything", "Describe what's in the scene"];
}

// Keep the view pinned to the newest message unless the user scrolled up.
function useStickToBottom(dep: unknown) {
    const ref = useRef<HTMLDivElement>(null);
    const stuck = useRef(true);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const onScroll = () => {
            stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => el.removeEventListener("scroll", onScroll);
    }, []);
    useEffect(() => {
        const el = ref.current;
        if (el && stuck.current) el.scrollTop = el.scrollHeight;
    }, [dep]);
    return {
        ref,
        stick: () => {
            stuck.current = true;
        },
    };
}

function isTyping(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export function ChatPanel() {
    const show = useUI((s) => s.showChat);
    const setShow = useUI((s) => s.setShowChat);
    const turns = useAssistant((s) => s.turns);
    const running = useAssistant((s) => s.running);
    const info = useAssistant((s) => s.info);
    const send = useAssistant((s) => s.send);
    const reset = useAssistant((s) => s.reset);
    const loadInfo = useAssistant((s) => s.loadInfo);
    const suggestions = useSuggestions();
    const composer = useRef<ComposerHandle>(null);
    const { ref: scrollRef, stick } = useStickToBottom(turns);

    useEffect(() => loadInfo(), [loadInfo]);

    // "/" opens the assistant and focuses the message field.
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
            e.preventDefault();
            useUI.getState().setShowChat(true);
            requestAnimationFrame(() => composer.current?.focus());
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    if (!show) return null;

    return (
        <Root aria-label="Assistant">
            <Header>
                <Mark>
                    <Sparkle size={16} weight="fill" />
                </Mark>
                <Titles>
                    <Title>Assistant</Title>
                    <Subtitle>{info ? modelName(info) : "Edits your scene from plain language"}</Subtitle>
                </Titles>
                <IconButton title="New chat" onClick={reset} disabled={turns.length === 0}>
                    <NotePencil size={16} />
                </IconButton>
                <IconButton title="Close" onClick={() => setShow(false)}>
                    <X size={16} />
                </IconButton>
            </Header>
            <Scroll ref={scrollRef} aria-live="polite">
                {turns.length === 0 ? (
                    <Empty>
                        <div>
                            <EmptyTitle>What should we make?</EmptyTitle>
                            <EmptyText>Describe a change or a whole object. Each reply is a single undo step.</EmptyText>
                        </div>
                        <Suggestions>
                            {suggestions.map((s) => (
                                <Suggestion key={s} onClick={() => send(s)} disabled={running}>
                                    {s}
                                </Suggestion>
                            ))}
                        </Suggestions>
                    </Empty>
                ) : (
                    turns.map((t, i) => <TurnView key={t.id} turn={t} last={i === turns.length - 1} />)
                )}
            </Scroll>
            <div onSubmitCapture={stick} style={{ display: "contents" }}>
                <Composer ref={composer} />
            </div>
            <Hint>Enter to send · Shift+Enter for a new line · / to focus</Hint>
        </Root>
    );
}

export default ChatPanel;
