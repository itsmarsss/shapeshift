import { useState, type CSSProperties } from "react";
import styled from "styled-components";
import { Cube } from "@phosphor-icons/react";
import { Button } from "../components/ui";
import { TileArt, TileCaption, tile } from "../site/parts";
import { ago, bytes, go } from "./nav";
import { Badge, Confirm } from "./ui";

// A cloud scene as a tile, the same look as Explore, with the moderation
// actions under it. Used on Scenes and on a person's page.

export type AdminScene = { id: string; title: string; size: number; updated_at: number; public_slug: string | null; listed: number; owner?: string; owner_id?: string };

// Tiles in a row are the same height, with their buttons along the bottom.
const Box = styled.div`
    ${tile}

    > div:last-child {
        flex: 1;
        display: flex;
        flex-direction: column;
    }
    .badges {
        min-height: 20px;
    }
    .actions {
        margin-top: auto;
        padding-top: 10px;
    }

    &:hover {
        transform: none;
    }
    .row {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 6px;
    }
    .owner {
        display: block;
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        color: var(--text);
        text-decoration: none;
    }
    .owner:hover {
        text-decoration: underline;
    }
`;

function Thumb({ id }: { id: string }) {
    const [broken, setBroken] = useState(false);
    return <TileArt>{broken ? <Cube size={30} /> : <img src={`/api/admin/scenes/${id}/thumbnail`} alt="" loading="lazy" onError={() => setBroken(true)} />}</TileArt>;
}

export function SceneTile({
    scene: s,
    index = 0,
    moderate,
    act,
}: {
    scene: AdminScene;
    index?: number;
    moderate: boolean;
    act: (path: string, done: string, method?: string) => void;
}) {
    return (
        <Box style={{ "--i": index } as CSSProperties}>
            <Thumb id={s.id} />
            <TileCaption>
                <b title={s.title}>{s.title}</b>
                {s.owner && s.owner_id && (
                    <a className="owner" href={`/admin?s=people&id=${s.owner_id}`} onClick={(e) => (e.preventDefault(), go("people", s.owner_id))}>
                        {s.owner}
                    </a>
                )}
                <small>
                    {ago(s.updated_at)} · {bytes(s.size)}
                </small>
                <div className="row badges">
                    {s.public_slug && <Badge $tone="green">Shared</Badge>}
                    {s.public_slug && s.listed ? <Badge $tone="accent">On Explore</Badge> : null}
                </div>
                {moderate && (
                    <div className="row actions">
                        {s.public_slug && (
                            <Button $size="sm" $variant="outline" as="a" href={`/s/${s.public_slug}`} target="_blank" rel="noopener">
                                View
                            </Button>
                        )}
                        {s.public_slug && s.listed ? <Confirm label="Unlist" sure="Unlist" size="sm" onConfirm={() => act(`/scenes/${s.id}/unlist`, "Taken off Explore")} /> : null}
                        {s.public_slug && <Confirm label="Unshare" sure="Unshare" variant="danger" size="sm" onConfirm={() => act(`/scenes/${s.id}/unshare`, "Link turned off")} />}
                        <Confirm label="Delete" sure="Delete it" variant="danger" size="sm" onConfirm={() => act(`/scenes/${s.id}`, "Scene deleted", "DELETE")} />
                    </div>
                )}
            </TileCaption>
        </Box>
    );
}
