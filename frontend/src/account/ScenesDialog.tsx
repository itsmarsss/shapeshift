import { useState } from "react";
import styled from "styled-components";
import { CloudArrowUp, Cube, PencilSimple, Trash } from "@phosphor-icons/react";
import { Button, Input } from "../components/ui";
import { api } from "./api";
import { Dialog } from "./Dialog";
import { useAccount } from "./store";

const Top = styled.div`
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
`;

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 12px;
`;

const Card = styled.div<{ $current: boolean }>`
    border: 1px solid ${(p) => (p.$current ? "var(--accent)" : "var(--border)")};
    border-radius: 12px;
    overflow: hidden;
    background: var(--bg);
    display: flex;
    flex-direction: column;
`;

const Preview = styled.button`
    aspect-ratio: 4 / 3;
    border: 0;
    padding: 0;
    background: var(--surface-raised);
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

const Empty = styled.div`
    padding: 32px 12px;
    text-align: center;
    color: var(--text-muted);
    line-height: 1.6;
`;

function ago(at: number) {
    const s = Math.max(0, (Date.now() - at) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return new Date(at).toLocaleDateString();
}

function SceneCard({ id, title, updatedAt }: { id: string; title: string; updatedAt: number }) {
    const cloudId = useAccount((s) => s.cloudId);
    const openScene = useAccount((s) => s.openScene);
    const renameScene = useAccount((s) => s.renameScene);
    const deleteScene = useAccount((s) => s.deleteScene);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(title);
    const [confirm, setConfirm] = useState(false);
    const [broken, setBroken] = useState(false);

    return (
        <Card $current={cloudId === id}>
            <Preview title="Open" onClick={() => void openScene(id)}>
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
                    <button title="Rename" onClick={() => setEditing(true)}>
                        <PencilSimple size={14} />
                    </button>
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
        </Card>
    );
}

export function ScenesDialog() {
    const setShow = useAccount((s) => s.setShowScenes);
    const scenes = useAccount((s) => s.scenes);
    const cloudId = useAccount((s) => s.cloudId);
    const saveToCloud = useAccount((s) => s.saveToCloud);
    const save = useAccount((s) => s.save);
    const [title, setTitle] = useState("");

    return (
        <Dialog title="My scenes" width={720} onClose={() => setShow(false)}>
            {!cloudId && (
                <Top>
                    <Input placeholder="Name this scene" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
                    <Button
                        $variant="primary"
                        disabled={save === "saving"}
                        onClick={async () => {
                            await saveToCloud(title.trim() || undefined);
                            setTitle("");
                            void useAccount.getState().refreshScenes();
                        }}
                    >
                        <CloudArrowUp size={16} />
                        Save current scene
                    </Button>
                </Top>
            )}
            {scenes.length ? (
                <Grid>
                    {scenes.map((s) => (
                        <SceneCard key={s.id} id={s.id} title={s.title} updatedAt={s.updatedAt} />
                    ))}
                </Grid>
            ) : (
                <Empty>
                    No saved scenes yet.
                    <br />
                    Save this one and it'll keep saving on its own as you work.
                </Empty>
            )}
        </Dialog>
    );
}

export default ScenesDialog;
