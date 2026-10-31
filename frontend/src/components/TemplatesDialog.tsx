import { useMemo } from "react";
import styled from "styled-components";
import { Dialog } from "../account/Dialog";
import { useScene } from "../scene/store";
import { TEMPLATES, buildTemplate, type Template } from "../scene/templates";
import { useThumbnails } from "../scene/useThumbnails";
import { useUI } from "../ui/store";
import { frameScene } from "../viewport/frame";
import { track } from "../telemetry";

const Note = styled.p`
    margin: 0 0 14px;
    color: var(--text-muted);
`;

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 12px;
`;

const Card = styled.button`
    display: flex;
    flex-direction: column;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    background: var(--bg);
    text-align: left;
    transition: border-color 0.12s ease, transform 0.12s ease;

    &:hover {
        border-color: var(--accent);
        transform: translateY(-1px);
    }
    img,
    .blank {
        width: 100%;
        aspect-ratio: 4 / 3;
        display: block;
        object-fit: cover;
        background: var(--surface-raised);
    }
    div {
        padding: 8px 10px 10px;
    }
    b {
        display: block;
        font-weight: 600;
    }
    small {
        color: var(--text-muted);
        font-size: 12px;
    }
`;

function TemplateCard({ template, image, onPick }: { template: Template; image: string | null; onPick: () => void }) {
    return (
        <Card onClick={onPick}>
            {image ? <img src={image} alt="" /> : <span className="blank" />}
            <div>
                <b>{template.name}</b>
                <small>{template.blurb}</small>
            </div>
        </Card>
    );
}

export function TemplatesDialog() {
    const setShow = useUI((s) => s.setShowTemplates);
    const docs = useMemo(() => TEMPLATES.map(buildTemplate), []);
    const images = useThumbnails(docs);
    const close = () => setShow(false);

    function pick(template: Template) {
        track("template_used", template.id);
        const { run } = useScene.getState();
        // One undo step, so undo brings back whatever was there before.
        run([{ type: "clear" }, ...template.commands], { select: false });
        frameScene();
        close();
    }

    return (
        <Dialog title="Start from a template" width={620} onClose={close}>
            <Note>Pick one to build on. It replaces what's in your scene, and undo brings it back.</Note>
            <Grid>
                {TEMPLATES.map((t, i) => (
                    <TemplateCard key={t.id} template={t} image={images[i]} onPick={() => pick(t)} />
                ))}
            </Grid>
        </Dialog>
    );
}

export default TemplatesDialog;
