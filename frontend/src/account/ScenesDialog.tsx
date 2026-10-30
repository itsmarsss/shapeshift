import { useState } from "react";
import styled from "styled-components";
import { CloudArrowUp } from "@phosphor-icons/react";
import { Button, Input } from "../components/ui";
import { Dialog } from "./Dialog";
import { Grid, SceneCard } from "./SceneCard";
import { useAccount } from "./store";

const Top = styled.div`
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
`;

const Empty = styled.div`
    padding: 32px 12px;
    text-align: center;
    color: var(--text-muted);
    line-height: 1.6;
`;

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
                        <SceneCard key={s.id} scene={s} />
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
