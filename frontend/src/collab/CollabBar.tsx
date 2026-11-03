import { useRef, useState } from "react";
import { pulse } from "../ui/keyframes";
import { ago, initials } from "../ui/format";
import { useCopy, useDismiss } from "../ui/hooks";
import { AnimatePresence } from "motion/react";
import { drop } from "../ui/motion";
import styled from "styled-components";
import { ArrowCounterClockwise, Check, ClockCounterClockwise, Copy, FloppyDisk, SignOut, UsersThree } from "@phosphor-icons/react";
import { useShallow } from "zustand/react/shallow";
import { Avatar, Button, Input, Popover } from "../components/ui";
import { roomLink, useCollab } from "./session";
import { COMPACT } from "../ui/compact";
import { RoomChatButton } from "./RoomChat";
import type { Peer } from "@shapeshift/shared/collab/protocol";

const Wrap = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-right: 6px;
`;

const ShareButton = styled.button<{ $live: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 10px 0 ${(p) => (p.$live ? "4px" : "10px")};
    border-radius: var(--radius);
    border: 1px solid ${(p) => (p.$live ? "var(--border-strong)" : "transparent")};
    background: ${(p) => (p.$live ? "transparent" : "var(--accent)")};
    color: ${(p) => (p.$live ? "var(--text)" : "var(--accent-text)")};
    font-weight: 500;

    &:hover {
        opacity: 0.9;
    }
`;

const ShareLabel = styled.span`
    @media ${COMPACT} {
        display: none;
    }
`;

const Faces = styled.span`
    display: inline-flex;
`;

const Face = styled(Avatar).attrs({ $size: 22 })`
    margin-left: -6px;
    box-shadow: 0 0 0 2px var(--surface);

    &:first-child {
        margin-left: 0;
    }
`;


const Dot = styled.span<{ $status: string }>`
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${(p) => (p.$status === "live" ? "var(--success)" : p.$status === "error" ? "var(--danger)" : "var(--warning)")};
    animation: ${(p) => (p.$status === "live" || p.$status === "error" ? "none" : pulse)} 1s ease-in-out infinite;
`;

const Panel = styled(Popover)`
    right: 0;
    width: 300px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
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

const Versions = styled.ul`
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    max-height: 168px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;

    li {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 6px;
        padding: 4px 6px;
        border-radius: 6px;
    }
    li:hover {
        background: var(--surface-raised);
    }
    b {
        font-weight: 500;
    }
    small {
        display: block;
        color: var(--text-faint);
        font-size: 11px;
    }
`;

const Small = styled(Button).attrs({ $size: "sm", $variant: "outline" })<{ $confirm?: boolean }>`
    ${(p) => p.$confirm && "border-color: var(--danger); background: color-mix(in srgb, var(--danger) 18%, transparent); color: var(--text);"}
`;

function History() {
    const versions = useCollab((s) => s.versions);
    const restoring = useCollab((s) => s.restoring);
    const saveVersion = useCollab((s) => s.saveVersion);
    const restoreVersion = useCollab((s) => s.restoreVersion);
    const [label, setLabel] = useState("");
    const [confirm, setConfirm] = useState<string | null>(null);
    const newest = versions.slice().reverse();

    return (
        <div>
            <Label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ClockCounterClockwise size={13} /> History
            </Label>
            <Row>
                <Input placeholder="Name this version" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
                <Button
                    title="Save a version everyone can go back to"
                    onClick={() => {
                        saveVersion(label);
                        setLabel("");
                    }}
                >
                    <FloppyDisk size={16} />
                    Save
                </Button>
            </Row>
            {newest.length > 0 ? (
                <Versions>
                    {newest.map((v) => (
                        <li key={v.id}>
                            <div>
                                <b>{v.label}</b>
                                <small>
                                    {ago(v.at)} · {v.auto ? "auto" : v.by} · {v.objects} objects{v.lights ? `, ${v.lights} lights` : ""}
                                </small>
                            </div>
                            <Small
                                $confirm={confirm === v.id}
                                disabled={restoring === v.id}
                                onClick={() => {
                                    if (confirm !== v.id) return setConfirm(v.id);
                                    setConfirm(null);
                                    restoreVersion(v.id);
                                }}
                                onBlur={() => setConfirm((c) => (c === v.id ? null : c))}
                                title="Replace the scene for everyone. You can undo it"
                            >
                                <ArrowCounterClockwise size={12} />
                                {restoring === v.id ? "Restoring…" : confirm === v.id ? "Restore for everyone?" : "Restore"}
                            </Small>
                        </li>
                    ))}
                </Versions>
            ) : (
                <Note style={{ marginTop: 6 }}>No versions yet. The room also saves one on its own every 10 minutes while people edit.</Note>
            )}
        </div>
    );
}

const Note = styled.div<{ $error?: boolean }>`
    font-size: 12px;
    color: ${(p) => (p.$error ? "var(--danger)" : "var(--text-muted)")};
`;

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
    const { copied, copy: copyText } = useCopy(1500);
    const [draftName, setDraftName] = useState(name);
    const wrap = useRef<HTMLDivElement>(null);

    useDismiss(wrap, open, () => setOpen(false));

    const live = status !== "off";
    const everyone: Peer[] = [...(you ? [{ ...you, name }] : []), ...peers];
    const link = roomId ? roomLink(roomId) : "";

    // Clipboard can be blocked; the link is still selectable.
    const copy = () => copyText(link);

    return (
        <Wrap ref={wrap}>
            {live && <RoomChatButton />}
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
                        <ShareLabel>Share</ShareLabel>
                    </>
                )}
            </ShareButton>

            <AnimatePresence>
                {open && live && (
                    <Panel {...drop} style={{ transformOrigin: "top right" }} role="dialog" aria-label="Live session">
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
                        <History />
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
                    </Panel>
                )}
            </AnimatePresence>
        </Wrap>
    );
}
