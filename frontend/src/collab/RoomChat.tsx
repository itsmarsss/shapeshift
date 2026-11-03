import { useEffect, useRef, useState } from "react";
import { DockResizer, DockToggle } from "../components/Dock";
import { useDockPanel } from "../ui/useDockLayout";
import styled from "styled-components";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { ChatsCircle, PaperPlaneRight, X } from "@phosphor-icons/react";
import { ROOM_LIMITS, type RoomMessage } from "@shapeshift/shared/collab/protocol";
import { IconButton, Input, Panel, PanelHeader, PanelTitle } from "../components/ui";
import { COMPACT, useCompact } from "../ui/compact";
import { rise, slide } from "../ui/motion";
import { useCollab } from "./session";

// Talking to the other people in a live room: a button by Share with a count
// of new messages, a small chat panel, and a quick preview of a message that
// comes in while the panel is closed.

const Button = styled.button<{ $open: boolean }>`
    position: relative;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: var(--radius);
    border: 1px solid ${(p) => (p.$open ? "var(--accent)" : "var(--border-strong)")};
    background: ${(p) => (p.$open ? "var(--accent-soft)" : "transparent")};
    color: var(--text);

    span {
        position: absolute;
        top: -6px;
        right: -6px;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 999px;
        background: var(--danger);
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        line-height: 18px;
    }
`;

const Root = styled(Panel)`
    top: calc(var(--topbar) + var(--gap));
    right: calc(var(--gap) + var(--chat-width, 0px));
    width: 300px;
    height: min(440px, calc(100% - var(--topbar) - var(--gap) * 2 - var(--bottom-offset, 0px)));
    z-index: 45;

    @media ${COMPACT} {
        top: auto;
        left: 0;
        right: 0;
        bottom: 0;
        width: auto;
        height: 55vh;
        border-radius: 16px 16px 0 0;
        border-bottom: 0;
        padding-bottom: env(safe-area-inset-bottom, 0px);
        z-index: 60;
    }
`;

const List = styled.ol`
    flex: 1;
    list-style: none;
    margin: 0;
    padding: 10px 12px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const Line = styled.li<{ $mine: boolean }>`
    align-self: ${(p) => (p.$mine ? "flex-end" : "flex-start")};
    max-width: 88%;

    b {
        display: block;
        font-size: 11px;
        margin-bottom: 2px;
        text-align: ${(p) => (p.$mine ? "right" : "left")};
    }
    p {
        margin: 0;
        padding: 7px 10px;
        border-radius: 12px;
        background: ${(p) => (p.$mine ? "var(--accent)" : "var(--surface-raised)")};
        color: ${(p) => (p.$mine ? "var(--accent-text)" : "var(--text)")};
        line-height: 1.4;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }
`;

const Form = styled.form`
    display: flex;
    gap: 6px;
    padding: 10px;
    border-top: 1px solid var(--border);

    input {
        flex: 1;
        height: 36px;
        padding: 0 10px;
    }
    button {
        width: 36px;
        height: 36px;
        display: grid;
        place-items: center;
        border: 0;
        border-radius: var(--radius);
        background: var(--accent);
        color: var(--accent-text);
    }
    button:disabled {
        opacity: 0.5;
    }
`;

const Empty = styled.div`
    margin: auto;
    color: var(--text-faint);
    text-align: center;
    padding: 20px;
`;

const Peek = styled(m.button)`
    position: absolute;
    top: calc(var(--topbar) + var(--gap));
    right: calc(var(--gap) + var(--chat-width, 0px));
    z-index: 45;
    max-width: 280px;
    padding: 10px 12px;
    border-radius: 14px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
    color: var(--text);
    text-align: left;

    b {
        display: block;
        font-size: 12px;
    }
    span {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        color: var(--text-muted);
    }
`;

const time = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

// The chat button, shown by Share while in a room.
export function RoomChatButton() {
    const open = useCollab((s) => s.chatOpen);
    const unread = useCollab((s) => s.unread);
    const setOpen = useCollab((s) => s.setChatOpen);
    return (
        <Button type="button" $open={open} title={open ? "Close the room chat" : "Chat with people in this room"} aria-pressed={open} onClick={() => setOpen(!open)}>
            <ChatsCircle size={18} weight={open ? "fill" : "regular"} />
            {unread > 0 && <span aria-label={`${unread} new`}>{unread > 9 ? "9+" : unread}</span>}
        </Button>
    );
}

export function RoomChat() {
    const live = useCollab((s) => s.status === "live" || s.status === "reconnecting");
    const open = useCollab((s) => s.chatOpen);
    const messages = useCollab((s) => s.messages);
    const you = useCollab((s) => s.you);
    const say = useCollab((s) => s.say);
    const setOpen = useCollab((s) => s.setChatOpen);
    const compact = useCompact();
    const place = useDockPanel<HTMLDivElement>("chat");
    const [draft, setDraft] = useState("");
    const [peek, setPeek] = useState<RoomMessage | null>(null);
    const list = useRef<HTMLOListElement>(null);
    const seen = useRef(messages.length);

    // Keeps the newest message in view.
    useEffect(() => {
        list.current?.scrollTo({ top: list.current.scrollHeight });
    }, [messages.length, open]);

    // A message from someone else while the chat is closed peeks in for a moment.
    useEffect(() => {
        const latest = messages[messages.length - 1];
        const fresh = messages.length > seen.current;
        seen.current = messages.length;
        if (!fresh || open || !latest || latest.from.id === you?.id) return;
        setPeek(latest);
        const timer = setTimeout(() => setPeek(null), 4000);
        return () => clearTimeout(timer);
    }, [messages, open, you?.id]);

    if (!live) return null;
    return (
        <>
            <AnimatePresence>
                {peek && !open && (
                    <Peek key={peek.id} {...rise} type="button" onClick={() => (setPeek(null), setOpen(true))}>
                        <b style={{ color: peek.from.color }}>{peek.from.name}</b>
                        <span>{peek.text}</span>
                    </Peek>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {open && (
                    <Root key="room-chat" ref={place.ref} style={place.style} {...slide(compact ? "bottom" : "right")} role="dialog" aria-label="Room chat">
                        <DockResizer id="chat" />
                        <PanelHeader {...place.handle}>
                            <PanelTitle>Room chat</PanelTitle>
                            <DockToggle id="chat" />
                            <IconButton title="Close" onClick={() => setOpen(false)}>
                                <X size={16} />
                            </IconButton>
                        </PanelHeader>
                        <List ref={list}>
                            {messages.length === 0 && <Empty>Say hello. Everyone in the room sees it.</Empty>}
                            {messages.map((msg) => {
                                const mine = msg.from.id === you?.id;
                                return (
                                    <Line key={msg.id} $mine={mine}>
                                        <b style={{ color: mine ? "var(--text-muted)" : msg.from.color }}>
                                            {mine ? "You" : msg.from.name} · {time(msg.at)}
                                        </b>
                                        <p>{msg.text}</p>
                                    </Line>
                                );
                            })}
                        </List>
                        <Form
                            onSubmit={(e) => {
                                e.preventDefault();
                                say(draft);
                                setDraft("");
                            }}
                        >
                            <Input
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                maxLength={ROOM_LIMITS.messageChars}
                                placeholder="Message the room"
                                aria-label="Message the room"
                                autoFocus
                            />
                            <button type="submit" disabled={!draft.trim()} title="Send">
                                <PaperPlaneRight size={16} weight="fill" />
                            </button>
                        </Form>
                    </Root>
                )}
            </AnimatePresence>
        </>
    );
}
