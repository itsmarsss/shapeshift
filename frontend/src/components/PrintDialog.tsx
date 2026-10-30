import { useMemo, useState } from "react";
import styled from "styled-components";
import { DownloadSimple } from "@phosphor-icons/react";
import { Dialog } from "../account/Dialog";
import { useScene } from "../scene/store";
import { exportSTL, printableBounds } from "../scene/io";
import { Button, FieldLabel, Input, Segment, Segmented } from "./ui";

const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
`;

const Row = styled.div`
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
`;

const Size = styled(Input)`
    width: 84px;
`;

const Summary = styled.p`
    margin: 0 0 14px;
    color: var(--text-muted);
    line-height: 1.5;

    b {
        color: var(--text);
        font-weight: 600;
    }
`;

const Warning = styled.p`
    margin: 0 0 14px;
    padding: 8px 10px;
    border-radius: var(--radius);
    background: var(--surface-raised);
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.4;
`;

const PRESETS = [
    { label: "Small", size: 50 },
    { label: "Medium", size: 100 },
    { label: "Large", size: 150 },
];

const mm = (n: number) => `${Math.round(n)}`;

export function PrintDialog({ onClose }: { onClose: () => void }) {
    const doc = useScene((s) => s.doc);
    const selectedIds = useScene((s) => s.selectedIds);
    const selectedObjects = selectedIds.filter((id) => doc.objects.some((o) => o.id === id));
    const [onlySelected, setOnlySelected] = useState(selectedObjects.length > 0);
    const [size, setSize] = useState(100);
    const [busy, setBusy] = useState(false);

    const ids = onlySelected ? selectedObjects : [];
    const key = ids.join();
    const { objects, extent } = useMemo(() => {
        const { objects, box } = printableBounds(doc, key ? key.split(",") : []);
        return { objects, extent: box.isEmpty() ? null : box.getSize(box.min.clone()) };
    }, [doc, key]);
    const longest = extent ? Math.max(extent.x, extent.y, extent.z) || 1 : 1;
    const scale = size / longest;
    const flat = objects.some((o) => o.geometry.type === "plane");
    const valid = objects.length > 0 && size >= 1 && size <= 2000;

    async function download() {
        setBusy(true);
        try {
            await exportSTL(doc, { size, ids });
            onClose();
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog title="Export for 3D printing" width={420} onClose={onClose}>
            {selectedObjects.length > 0 && (
                <Section>
                    <FieldLabel>What to print</FieldLabel>
                    <Segmented>
                        <Segment type="button" $active={!onlySelected} onClick={() => setOnlySelected(false)}>
                            Whole scene
                        </Segment>
                        <Segment type="button" $active={onlySelected} onClick={() => setOnlySelected(true)}>
                            Selected ({selectedObjects.length})
                        </Segment>
                    </Segmented>
                </Section>
            )}
            <Section>
                <FieldLabel>Size of the longest side</FieldLabel>
                <Row>
                    <Segmented>
                        {PRESETS.map((p) => (
                            <Segment key={p.size} type="button" $active={size === p.size} onClick={() => setSize(p.size)}>
                                {p.label}
                            </Segment>
                        ))}
                    </Segmented>
                    <Size
                        type="number"
                        min={1}
                        max={2000}
                        value={size}
                        aria-label="Size in millimetres"
                        onChange={(e) => setSize(Number(e.target.value))}
                    />
                    mm
                </Row>
            </Section>
            {extent ? (
                <Summary>
                    Prints at about{" "}
                    <b>
                        {mm(extent.x * scale)} × {mm(extent.z * scale)} × {mm(extent.y * scale)} mm
                    </b>{" "}
                    (width × depth × height), standing on the print bed.
                </Summary>
            ) : (
                <Summary>Add a shape to the scene first.</Summary>
            )}
            {flat && <Warning>Flat planes have no thickness, so they won't print. Use a thin box instead.</Warning>}
            <Button $variant="primary" disabled={!valid || busy} onClick={download}>
                <DownloadSimple size={16} />
                Download STL
            </Button>
        </Dialog>
    );
}

export default PrintDialog;
