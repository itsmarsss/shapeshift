import { useState, type CSSProperties } from "react";
import styled from "styled-components";
import { tile } from "../site/parts";
import { Check, Cube, LinkSimple, PencilSimple, Trash } from "@phosphor-icons/react";
import { Input } from "../components/ui";
import { api, type CloudScene } from "./api";
import { embedCode } from "../viewer/embed";
import { useAccount } from "./store";

export const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 12px;
`;

const Card = styled.div<{ $current: boolean }>`
    ${tile}
    ${(p) => p.$current && "border-color: var(--accent);"}
`;

const Preview = styled.button`
    aspect-ratio: 4 / 3;
    border: 0;
    padding: 0;
    background: linear-gradient(160deg, var(--surface-raised), var(--surface-hover));
    display: grid;
    place-items: center;
    color: var(--text-faint);

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }
    &:hover {
        opacity: 0.9;
    }
`;

const Info = styled.div`
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 4px;

    div {
        flex: 1;
        min-width: 0;
    }
    b {
        display: block;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    small {
        color: var(--text-faint);
        font-size: 11px;
    }
    button {
        width: 26px;
        height: 26px;
        display: grid;
        place-items: center;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--text-muted);
    }
    button:hover {
        background: var(--surface-raised);
        color: var(--text);
    }
    button[data-confirm="true"] {
        width: auto;
        padding: 0 8px;
        color: var(--danger);
        font-size: 12px;
    }
`;

function ago(at: number) {
    const s = Math.max(0, (Date.now() - at) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return new Date(at).toLocaleDateString();
}

const Shared = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px 8px;
    font-size: 11px;
    color: var(--text-muted);

    button {
        border: 0;
        background: none;
        padding: 0;
        color: var(--accent);
        font-size: 11px;
    }
`;

// One saved scene: its preview, name, sharing and delete. `onOpen` replaces
// opening it in the current editor, for pages outside the editor.
// index staggers the cards' entrance when a list of them appears.
export function SceneCard({ scene, onOpen, index = 0 }: { scene: CloudScene; onOpen?: () => void; index?: number }) {
    const { id, title, updatedAt, publicSlug, listed } = scene;
    const setListed = useAccount((s) => s.setListed);
    const cloudId = useAccount((s) => s.cloudId);
    const openScene = useAccount((s) => s.openScene);
    const renameScene = useAccount((s) => s.renameScene);
    const deleteScene = useAccount((s) => s.deleteScene);
    const setShared = useAccount((s) => s.setShared);
    const [copied, setCopied] = useState<"link" | "embed" | null>(null);

    async function copy(text: string, what: "link" | "embed") {
        await navigator.clipboard?.writeText(text).catch(() => {});
        setCopied(what);
        setTimeout(() => setCopied(null), 1600);
    }

    async function share() {
        const link = await setShared(id, true);
        if (link) await copy(link, "link");
    }
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(title);
    const [confirm, setConfirm] = useState(false);
    const [broken, setBroken] = useState(false);

    return (
        <Card $current={cloudId === id} style={{ "--i": index } as CSSProperties}>
            <Preview title="Open" onClick={() => (onOpen ? onOpen() : void openScene(id))}>
                {broken ? <Cube size={36} /> : <img src={api.thumbnailUrl(id, updatedAt)} alt="" onError={() => setBroken(true)} />}
            </Preview>
            <Info>
                {editing ? (
                    <Input
                        autoFocus
                        value={draft}
                        maxLength={80}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => {
                            setEditing(false);
                            if (draft.trim() && draft !== title) void renameScene(id, draft.trim());
                        }}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    />
                ) : (
                    <div>
                        <b title={title}>{title}</b>
                        <small>{cloudId === id ? "Open now · " : ""}{ago(updatedAt)}</small>
                    </div>
                )}
                {!editing && !confirm && (
                    <>
                        <button title={publicSlug ? "Copy the view-only link" : "Share a view-only link"} onClick={() => void share()}>
                            {copied === "link" ? <Check size={14} color="var(--success)" /> : <LinkSimple size={14} />}
                        </button>
                        <button title="Rename" onClick={() => setEditing(true)}>
                            <PencilSimple size={14} />
                        </button>
                    </>
                )}
                <button
                    title="Delete"
                    data-confirm={confirm}
                    onBlur={() => setConfirm(false)}
                    onClick={() => (confirm ? void deleteScene(id) : setConfirm(true))}
                >
                    {confirm ? "Delete?" : <Trash size={14} />}
                </button>
            </Info>
            {publicSlug && (
                <Shared>
                    {copied === "link" ? "Link copied" : copied === "embed" ? "Embed code copied" : "Anyone with the link can view"}
                    <span>·</span>
                    <button title="Copy HTML to show this scene on another site" onClick={() => void copy(embedCode(location.origin, publicSlug, title), "embed")}>
                        Embed
                    </button>
                    <span>·</span>
                    <button onClick={() => void setShared(id, false)}>Stop sharing</button>
                </Shared>
            )}
            {publicSlug && (
                <Shared as="label" title="List it in the public Explore gallery, where anyone can see and remix it">
                    <input type="checkbox" checked={Boolean(listed)} onChange={(e) => void setListed(id, e.target.checked)} />
                    Show in Explore
                </Shared>
            )}
        </Card>
    );
}

