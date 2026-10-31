import { useRef } from "react";
import styled from "styled-components";
import { ArrowCounterClockwise, CornersOut } from "@phosphor-icons/react";
import { COMPACT } from "../ui/compact";
import { useScene } from "../scene/store";
import { frameSelection, orbitBy, resetView, useCameraAngles, viewFrom, type ViewSide } from "../viewport/frame";

const SIZE = 64;
// How far the camera turns per pixel dragged, in radians.
const TURN = 0.012;
// Moving less than this still counts as a click on a face.
const CLICK_SLOP = 4;

const Root = styled.div`
    position: absolute;
    right: calc(var(--gap) * 2 + var(--chat-width, 0px));
    bottom: calc(var(--gap) + var(--bottom-offset, 0px));
    z-index: 20;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;

    @media ${COMPACT} {
        top: calc(var(--topbar) + var(--gap) + env(safe-area-inset-top, 0px));
        bottom: auto;
        transform: scale(0.85);
        transform-origin: top right;
    }
`;

const Stage = styled.div`
    width: ${SIZE}px;
    height: ${SIZE}px;
    perspective: 240px;
    cursor: grab;
    touch-action: none;

    &[data-dragging] {
        cursor: grabbing;
    }
`;

const Cube = styled.div`
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
`;

const Face = styled.button`
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.02em;
    backface-visibility: hidden;
    cursor: inherit;

    [data-dragging] &:hover {
        background: color-mix(in srgb, var(--surface) 92%, transparent);
        color: var(--text-muted);
    }
    &:hover {
        background: var(--accent);
        color: var(--accent-text);
    }
`;

const Buttons = styled.div`
    display: flex;
    gap: 4px;

    button {
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        color: var(--text-muted);
    }
    button:hover {
        color: var(--text);
        border-color: var(--border-strong);
    }
`;

const HALF = SIZE / 2;
const FACES: { side: ViewSide; label: string; transform: string }[] = [
    { side: "front", label: "Front", transform: `translateZ(${HALF}px)` },
    { side: "back", label: "Back", transform: `rotateY(180deg) translateZ(${HALF}px)` },
    { side: "right", label: "Right", transform: `rotateY(90deg) translateZ(${HALF}px)` },
    { side: "left", label: "Left", transform: `rotateY(-90deg) translateZ(${HALF}px)` },
    { side: "top", label: "Top", transform: `rotateX(90deg) translateZ(${HALF}px)` },
    { side: "bottom", label: "Bottom", transform: `rotateX(-90deg) translateZ(${HALF}px)` },
];

// A cube that turns with the camera. Click a face to look from that side, or
// drag it to turn the view; the buttons below fit everything (or the
// selection) in view and reset it.
export function ViewCube() {
    const azimuth = useCameraAngles((s) => s.azimuth);
    const polar = useCameraAngles((s) => s.polar);
    const hasSelection = useScene((s) => s.selectedIds.length > 0);
    const empty = useScene((s) => s.doc.objects.length === 0 && s.doc.lights.length === 0);
    const deg = 180 / Math.PI;
    const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
    // Set when a drag ends, so the face it was released over isn't clicked.
    const dragged = useRef(false);

    return (
        <Root aria-label="View">
            <Stage
                title="Drag to turn the view"
                onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    dragged.current = false;
                    drag.current = { x: e.clientX, y: e.clientY, moved: false };
                }}
                onPointerMove={(e) => {
                    const d = drag.current;
                    if (!d) return;
                    const dx = e.clientX - d.x;
                    const dy = e.clientY - d.y;
                    if (!d.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
                    if (!d.moved) {
                        // Captured only once it's a drag, so a plain click still lands on its face.
                        e.currentTarget.setPointerCapture(e.pointerId);
                        e.currentTarget.dataset.dragging = "";
                    }
                    d.moved = true;
                    d.x = e.clientX;
                    d.y = e.clientY;
                    orbitBy(-dx * TURN, -dy * TURN);
                }}
                onPointerUp={(e) => {
                    delete e.currentTarget.dataset.dragging;
                    dragged.current = !!drag.current?.moved;
                    drag.current = null;
                }}
                onClickCapture={(e) => {
                    if (dragged.current) e.stopPropagation();
                    dragged.current = false;
                }}
                onPointerCancel={(e) => {
                    delete e.currentTarget.dataset.dragging;
                    drag.current = null;
                }}
            >
                <Cube style={{ transform: `rotateX(${(polar - Math.PI / 2) * deg}deg) rotateY(${-azimuth * deg}deg)` }}>
                    {FACES.map((f) => (
                        <Face key={f.side} type="button" title={`View from the ${f.side}`} style={{ transform: f.transform }} onClick={() => viewFrom(f.side)}>
                            {f.label}
                        </Face>
                    ))}
                </Cube>
            </Stage>
            <Buttons>
                <button type="button" title={hasSelection ? "Fit the selection in view (F)" : "Fit everything in view (F)"} disabled={empty} onClick={frameSelection}>
                    <CornersOut size={16} />
                </button>
                <button type="button" title="Reset the view" onClick={resetView}>
                    <ArrowCounterClockwise size={16} />
                </button>
            </Buttons>
        </Root>
    );
}
