import { memo, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { ArrowsLeftRight, CaretDown, CaretRight, CubeFocus, Eye, EyeSlash, X } from "@phosphor-icons/react";
import { useShallow } from "zustand/react/shallow";
import { useScene } from "../scene/store";
import { ancestorKeys, buildPartTree, type PartNode } from "../scene/partTree";
import { useUI } from "../ui/store";
import { COMPACT } from "../ui/compact";
import { useView, type Axis } from "../viewport/view";
import { IconButton, Panel, PanelHeader, PanelTitle, Segment, Segmented } from "./ui";

const Root = styled(Panel)`
    top: calc(var(--topbar) + var(--gap));
    right: calc(var(--gap) + var(--chat-width, 0px));
    width: 280px;
    max-height: calc(100% - var(--topbar) - var(--gap) * 2 - var(--bottom-offset, 0px));
    z-index: 30;

    @media ${COMPACT} {
        top: auto;
        left: 0;
        right: 0;
        bottom: 0;
        width: auto;
        border-radius: 16px 16px 0 0;
        border-bottom: 0;
        padding-bottom: env(safe-area-inset-bottom, 0px);
        box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.4);
        z-index: 60;
        max-height: 55vh;
    }
`;

const Tree = styled.ul`
    list-style: none;
    margin: 0;
    padding: 6px;
    overflow: auto;
    flex: 1;
    min-height: 60px;
    scrollbar-width: thin;
`;

const Row = styled.div<{ $selected: boolean; $hidden: boolean }>`
    display: flex;
    align-items: center;
    height: 30px;
    border-radius: var(--radius);
    background: ${(p) => (p.$selected ? "var(--surface-raised)" : "transparent")};
    color: ${(p) => (p.$hidden ? "var(--text-faint)" : "var(--text)")};

    &:hover {
        background: var(--surface-hover);
    }
    > button:first-of-type {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        height: 100%;
        padding: 0 4px 0 0;
        border: 0;
        background: none;
        color: inherit;
        text-align: left;
        font-weight: ${(p) => (p.$selected ? 600 : 400)};
    }
    span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    small {
        color: var(--text-faint);
        font-variant-numeric: tabular-nums;
    }
    .action {
        opacity: 0;
    }
    &:hover .action,
    .action[aria-pressed="true"] {
        opacity: 1;
    }
`;

const Caret = styled.span`
    width: 16px;
    flex-shrink: 0;
    display: inline-flex;
    justify-content: center;
    color: var(--text-muted);
`;

const Tools = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px 14px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
`;

const Line = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;

    > label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        min-width: 64px;
    }
    input[type="checkbox"] {
        width: 14px;
        height: 14px;
        margin: 0;
        accent-color: var(--accent);
    }
    input[type="range"] {
        flex: 1;
        min-width: 0;
        accent-color: var(--accent);
    }
`;

const Note = styled.p`
    margin: 0;
    padding: 4px 8px 8px;
    color: var(--text-muted);
`;

const AXES: Axis[] = ["x", "y", "z"];

type RowProps = {
    node: PartNode;
    open: boolean;
    selected: boolean;
    hidden: boolean;
    isolated: boolean;
    onToggle: (key: string) => void;
    onSelect: (node: PartNode, toggle: boolean) => void;
    onHide: (node: PartNode, hidden: boolean) => void;
    onIsolate: (node: PartNode) => void;
};

const PartRow = memo(function PartRow({ node, open, selected, hidden, isolated, onToggle, onSelect, onHide, onIsolate }: RowProps) {
    const folder = !node.object;
    return (
        <Row $selected={selected} $hidden={hidden} style={{ paddingLeft: 4 + node.depth * 14 }} data-key={node.key}>
            <button
                type="button"
                aria-label={node.name}
                aria-expanded={folder ? open : undefined}
                onClick={(e) => {
                    if (folder && (e.target as HTMLElement).closest("[data-caret]")) onToggle(node.key);
                    else onSelect(node, e.shiftKey || e.metaKey || e.ctrlKey);
                }}
                onDoubleClick={() => folder && onToggle(node.key)}
            >
                <Caret data-caret>{folder && (open ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />)}</Caret>
                <span>{node.name}</span>
                {folder && <small>{node.ids.length}</small>}
            </button>
            <IconButton
                className="action"
                $size={26}
                title={isolated ? "Show everything" : "Show only this"}
                aria-pressed={isolated}
                $active={isolated}
                onClick={() => onIsolate(node)}
            >
                <CubeFocus size={15} />
            </IconButton>
            <IconButton className="action" $size={26} title={hidden ? "Show" : "Hide"} aria-pressed={hidden} onClick={() => onHide(node, !hidden)}>
                {hidden ? <EyeSlash size={15} /> : <Eye size={15} />}
            </IconButton>
        </Row>
    );
});

function SectionControls() {
    const section = useView((s) => s.section);
    const setSection = useView((s) => s.setSection);
    const explode = useView((s) => s.explode);
    const setExplode = useView((s) => s.setExplode);
    return (
        <Tools>
            <Line>
                <label>
                    <input type="checkbox" checked={section.on} onChange={(e) => setSection({ on: e.target.checked })} />
                    Section
                </label>
                <Segmented role="group" aria-label="Section axis">
                    {AXES.map((axis) => (
                        <Segment key={axis} $active={section.axis === axis} style={{ padding: "0 9px" }} onClick={() => setSection({ axis, on: true })}>
                            {axis.toUpperCase()}
                        </Segment>
                    ))}
                </Segmented>
                <IconButton title="Flip the cut" $active={section.flip} disabled={!section.on} onClick={() => setSection({ flip: !section.flip })}>
                    <ArrowsLeftRight size={16} />
                </IconButton>
            </Line>
            <Line>
                <input
                    type="range"
                    aria-label="Section position"
                    min={0}
                    max={1}
                    step={0.001}
                    value={section.at}
                    disabled={!section.on}
                    onChange={(e) => setSection({ at: Number(e.target.value) })}
                />
            </Line>
            <Line>
                <label htmlFor="explode">Explode</label>
                <input id="explode" type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} />
            </Line>
        </Tools>
    );
}

export function PartsPanel() {
    const show = useUI((s) => s.showParts);
    const setShow = useUI((s) => s.setShowParts);
    const objects = useScene((s) => s.doc.objects);
    const selectedIds = useScene(useShallow((s) => s.selectedIds));
    const selectedId = useScene((s) => s.selectedId);
    const hidden = useView((s) => s.hidden);
    const tree = useMemo(() => buildPartTree(objects), [objects]);
    const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

    useEffect(() => {
        setOpen((prev) => {
            const next = new Set(prev);
            for (const root of tree) if (!root.object) next.add(root.key);
            return next.size === prev.size ? prev : next;
        });
    }, [tree]);

    // Reveal what's picked in the viewport.
    useEffect(() => {
        if (!show || !selectedId) return;
        const o = useScene.getState().doc.objects.find((x) => x.id === selectedId);
        if (!o) return;
        const keys = ancestorKeys(o);
        setOpen((prev) => (keys.every((k) => prev.has(k)) ? prev : new Set([...prev, ...keys])));
        requestAnimationFrame(() => document.querySelector(`[data-key="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: "nearest" }));
    }, [show, selectedId]);

    if (!show) return null;

    const selected = new Set(selectedIds);
    const allIds = objects.map((o) => o.id);
    const toggle = (key: string) =>
        setOpen((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    const onSelect = (node: PartNode, add: boolean) => {
        const scene = useScene.getState();
        if (node.object) scene.select(node.object.id, { toggle: add });
        else scene.selectMany(add ? [...scene.selectedIds, ...node.ids] : node.ids);
    };
    const onHide = (node: PartNode, hide: boolean) => useView.getState().setHidden(node.ids, hide);
    const isIsolated = (node: PartNode) => {
        if (!hidden.size || node.ids.some((id) => hidden.has(id))) return false;
        return hidden.size === allIds.length - node.ids.length;
    };
    const onIsolate = (node: PartNode) => {
        const view = useView.getState();
        if (isIsolated(node)) view.showAll();
        else view.isolate(node.ids, allIds);
    };

    const rows: PartNode[] = [];
    const walk = (nodes: PartNode[]) => {
        for (const n of nodes) {
            rows.push(n);
            if (!n.object && open.has(n.key)) walk(n.children);
        }
    };
    walk(tree);

    return (
        <Root role="dialog" aria-label="Parts">
            <PanelHeader>
                <PanelTitle>Parts</PanelTitle>
                <IconButton title="Close parts" onClick={() => setShow(false)}>
                    <X size={16} />
                </IconButton>
            </PanelHeader>
            <Tree aria-label="Part list">
                {rows.map((node) => (
                    <li key={node.key}>
                        <PartRow
                            node={node}
                            open={open.has(node.key)}
                            selected={node.ids.every((id) => selected.has(id))}
                            hidden={node.ids.every((id) => hidden.has(id))}
                            isolated={isIsolated(node)}
                            onToggle={toggle}
                            onSelect={onSelect}
                            onHide={onHide}
                            onIsolate={onIsolate}
                        />
                    </li>
                ))}
                {!rows.length && <Note>Open a model file to see its parts.</Note>}
            </Tree>
            <SectionControls />
        </Root>
    );
}

export default PartsPanel;
