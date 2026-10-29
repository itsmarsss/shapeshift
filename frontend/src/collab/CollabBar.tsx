import { useEffect, useRef, useState } from "react";
import styled, { keyframes } from "styled-components";
import { Check, Copy, SignOut, UsersThree } from "@phosphor-icons/react";
import { useShallow } from "zustand/react/shallow";
import { Button, Input } from "../components/ui";
import { roomLink, useCollab } from "./session";
import type { Peer } from "./protocol";

const Wrap = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    margin-right: 6px;
`;

const ShareButton = styled.button<{ $live: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 10px 0 ${(p) => (p.$live ? "4px" : "10px")};
    border-radius: 999px;
    border: 1px solid ${(p) => (p.$live ? "var(--border-strong)" : "transparent")};
    background: ${(p) => (p.$live ? "transparent" : "var(--accent)")};
    color: ${(p) => (p.$live ? "var(--text)" : "var(--accent-text)")};
    font-weight: 500;

    &:hover {
        opacity: 0.9;
    }
`;

const Faces = styled.span`
    display: inline-flex;
`;

const Face = styled.span<{ $color: string }>`
    width: 22px;
    height: 22px;
    margin-left: -6px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: ${(p) => p.$color};
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    box-shadow: 0 0 0 2px var(--surface);

    &:first-child {
        margin-left: 0;
    }
`;

const pulse = keyframes`50% { opacity: 0.35; }`;

const Dot = styled.span<{ $status: string }>`
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${(p) => (p.$status === "live" ? "var(--success)" : p.$status === "error" ? "var(--danger)" : "#ffc53d")};
    animation: ${(p) => (p.$status === "live" || p.$status === "error" ? "none" : pulse)} 1s ease-in-out infinite;
`;

const Popover = styled.div`
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 300px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
    z-index: 200;
`;

const Label = styled.div`
    color: var(--text-muted);
    font-size: 12px;
    margin-bottom: 6px;
`;

const Row = styled.div`
    display: flex;
    gap: 6px;
`;

const People = styled.ul`
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;

    li {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    small {
        color: var(--text-faint);
    }
`;

const Note = styled.div<{ $error?: boolean }>`
    font-size: 12px;
    color: ${(p) => (p.$error ? "var(--danger)" : "var(--text-muted)")};
`;

const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join("") || "?";

const STATUS_TEXT: Record<string, string> = {
    connecting: "Connecting…",
    reconnecting: "Reconnecting…",
    live: "Live",
    error: "Disconnected",
};

export function CollabBar() {
    const status = useCollab((s) => s.status);
    const roomId = useCollab((s) => s.roomId);
    const you = useCollab((s) => s.you);
    const peers = useCollab(useShallow((s) => Object.values(s.peers)));
    const error = useCollab((s) => s.error);
    const name = useCollab((s) => s.name);
    const share = useCollab((s) => s.share);
    const leave = useCollab((s) => s.leave);
    const rename = useCollab((s) => s.rename);
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [draftName, setDraftName] = useState(name);
    const wrap = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const close = (e: PointerEvent) => {
            if (!wrap.current?.contains(e.target as Node)) setOpen(false);
        };
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [open]);

    const live = status !== "off";
    const everyone: Peer[] = [...(you ? [{ ...you, name }] : []), ...peers];
    const link = roomId ? roomLink(roomId) : "";

    async function copy() {
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard can be blocked; the link is still selectable.
        }
    }

    return (
        <Wrap ref={wrap}>
            <ShareButton
                $live={live}
                title={live ? "People in this room" : "Share a live link to this scene"}
                onClick={() => {
                    if (!live) {
                        share();
                        setDraftName(useCollab.getState().name);
                    }
                    setOpen((v) => !v || !live);
                }}
            >
                {live ? (
                    <>
                        <Faces>
                            {everyone.slice(0, 4).map((p) => (
                                <Face key={p.id} $color={p.color} title={p.name}>
                                    {initials(p.name)}
                                </Face>
                            ))}
                        </Faces>
                        <Dot $status={status} />
                        {everyone.length > 4 ? `+${everyone.length - 4}` : STATUS_TEXT[status]}
                    </>
                ) : (
                    <>
                        <UsersThree size={16} weight="bold" />
                        Share
                    </>
                )}
            </ShareButton>

            {open && live && (
                <Popover role="dialog" aria-label="Live session">
                    <div>
                        <Label>Anyone with this link can edit the scene with you</Label>
                        <Row>
                            <Input readOnly value={link} onFocus={(e) => e.target.select()} />
                            <Button $variant="primary" onClick={copy} title="Copy link">
                                {copied ? <Check size={16} /> : <Copy size={16} />}
                            </Button>
                        </Row>
                    </div>
                    <div>
                        <Label>Your name</Label>
                        <Input
                            value={draftName}
                            maxLength={32}
                            placeholder="Guest"
                            onChange={(e) => setDraftName(e.target.value)}
                            onBlur={() => rename(draftName)}
                            onKeyDown={(e) => e.key === "Enter" && rename(draftName)}
                        />
                    </div>
                    <div>
                        <Label>In this room</Label>
                        <People>
                            {everyone.map((p) => (
                                <li key={p.id}>
                                    <Face $color={p.color}>{initials(p.name)}</Face>
                                    {p.name}
                                    {p.id === you?.id && <small>you</small>}
                                </li>
                            ))}
                        </People>
                    </div>
                    {error && <Note $error>{error}</Note>}
                    {status !== "live" && !error && <Note>{STATUS_TEXT[status]}</Note>}
                    <Button
                        onClick={() => {
                            leave({ restore: true });
                            setOpen(false);
                        }}
                    >
                        <SignOut size={16} />
                        Leave room
                    </Button>
                </Popover>
            )}
        </Wrap>
    );
}
