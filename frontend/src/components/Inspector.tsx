import React, { useState, useRef, useCallback } from "react";
import styled from "styled-components";
import { Copy, Trash, X } from "@phosphor-icons/react";
import { useEditor } from "../store/editor";
import type { Vector3 } from "../types";
import { Button, Divider, FieldLabel, IconButton, Input, Select } from "./ui";

const Container = styled.div<{
    $top: number;
    $left: number;
    $height: number;
    $isDragging: boolean;
}>`
    position: absolute;
    top: ${(p) => p.$top}px;
    left: ${(p) => p.$left}px;
    width: 272px;
    max-height: ${(p) => p.$height}px;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    user-select: none;
    z-index: 30;
    cursor: ${(p) => (p.$isDragging ? "grabbing" : "default")};
`;

const Header = styled.div<{ $isDragging: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 44px;
    padding: 0 8px 0 14px;
    border-bottom: 1px solid var(--border);
    font-weight: 600;
    flex-shrink: 0;
    cursor: ${(p) => (p.$isDragging ? "grabbing" : "grab")};
`;

const Body = styled.div`
    overflow: auto;
    padding: 12px 14px 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    scrollbar-width: thin;
`;

const Triple = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
`;

const Axis = styled.label<{ $axis: "x" | "y" | "z" }>`
    position: relative;
    display: block;

    &::before {
        content: "${(p) => p.$axis.toUpperCase()}";
        position: absolute;
        left: 8px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 11px;
        font-weight: 600;
        color: var(--axis-${(p) => p.$axis});
        pointer-events: none;
    }

    input {
        padding-left: 22px;
    }
`;

const Sub = styled.label`
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--text-muted);
    font-size: 11px;
`;

const Check = styled.label`
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;

    input {
        width: 14px;
        height: 14px;
        margin: 0;
        accent-color: var(--accent);
    }
`;

const Muted = styled.div`
    color: var(--text-muted);
`;

const Actions = styled.div`
    display: flex;
    gap: 4px;
`;

const ResizeHandle = styled.div`
    height: 10px;
    flex-shrink: 0;
    cursor: ns-resize;
    display: flex;
    align-items: center;
    justify-content: center;

    &::after {
        content: "";
        width: 28px;
        height: 3px;
        border-radius: 2px;
        background: var(--border-strong);
    }
`;

const RAD_TO_DEG = 180 / Math.PI;
const AXES = ["x", "y", "z"] as const;

function num(value: string) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
}

function round(n: number) {
    return Math.round(n * 1000) / 1000;
}

function VectorField({
    value,
    step,
    scale = 1,
    onChange,
}: {
    value: Vector3;
    step: number;
    scale?: number;
    onChange: (axis: "x" | "y" | "z", v: number) => void;
}) {
    return (
        <Triple>
            {AXES.map((axis) => (
                <Axis key={axis} $axis={axis}>
                    <Input
                        type="number"
                        step={step}
                        value={round(value[axis] * scale)}
                        onChange={(e) => onChange(axis, num(e.target.value) / scale)}
                    />
                </Axis>
            ))}
        </Triple>
    );
}

export function Inspector() {
    const selectedId = useEditor((s) => s.selectedId);
    const showInspector = useEditor((s) => s.showInspector);
    const objects = useEditor((s) => s.objects);
    const lights = useEditor((s) => s.lights);
    const updateTransform = useEditor((s) => s.updateTransform);
    const updateLightTransform = useEditor((s) => s.updateLightTransform);
    const updateMaterial = useEditor((s) => s.updateMaterial);
    const updateLightProps = useEditor((s) => s.updateLightProps);
    const duplicateSelected = useEditor((s) => s.duplicateSelected);
    const deleteSelected = useEditor((s) => s.deleteSelected);
    const deleteLight = useEditor((s) => s.deleteLight);
    const select = useEditor((s) => s.select);
    const snap = useEditor((s) => s.snap);
    const toggleSnap = useEditor((s) => s.toggleSnap);
    const setSnap = useEditor((s) => s.setSnap);
    const setShowInspector = useEditor((s) => s.setShowInspector);

    const updateName = useEditor((s) => s.updateName);

    const obj = objects.find((o) => o.id === selectedId);
    const light = lights?.find((l) => l.id === selectedId);
    const isVisible = showInspector; // Show inspector based on button toggle

    // State for dragging and resizing
    const [position, setPosition] = useState({
        top: 60,
        left: 70,
        height: Math.min(560, window.innerHeight - 72),
    });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0, top: 0, left: 0 });
    const [resizeStart, setResizeStart] = useState({ y: 0, height: 0 });

    const containerRef = useRef<HTMLDivElement>(null);

    const handleDragStart = useCallback(
        (e: React.MouseEvent) => {
            const target = e.target as HTMLElement;
            if (
                target.closest(
                    "input,select,textarea,button,[contenteditable='true'],[data-no-drag]"
                )
            )
                return;
            if (
                target === e.currentTarget ||
                target.closest("[data-drag-handle],[data-drag-area]")
            ) {
                setIsDragging(true);
                setDragStart({
                    x: e.clientX,
                    y: e.clientY,
                    top: position.top,
                    left: position.left,
                });
            }
        },
        [position.top, position.left]
    );

    const handleResizeStart = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            setIsResizing(true);
            setResizeStart({
                y: e.clientY,
                height: position.height,
            });
        },
        [position.height]
    );

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (isDragging) {
                const deltaX = e.clientX - dragStart.x;
                const deltaY = e.clientY - dragStart.y;

                setPosition({
                    top: Math.max(
                        60,
                        Math.min(
                            window.innerHeight - position.height - 12,
                            dragStart.top + deltaY
                        )
                    ),
                    left: Math.max(
                        12,
                        Math.min(
                            window.innerWidth - 272 - 12,
                            dragStart.left + deltaX
                        )
                    ),
                    height: position.height,
                });
            }

            if (isResizing) {
                const deltaY = e.clientY - resizeStart.y;
                const newHeight = Math.max(
                    200,
                    Math.min(
                        window.innerHeight - position.top - 12,
                        resizeStart.height + deltaY
                    )
                );

                setPosition((prev) => ({
                    ...prev,
                    height: newHeight,
                }));
            }
        },
        [
            isDragging,
            isResizing,
            dragStart,
            resizeStart,
            position.top,
            position.height,
        ]
    );

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        setIsResizing(false);
    }, []);

    React.useEffect(() => {
        if (isDragging || isResizing) {
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
            return () => {
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
            };
        }
    }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

    if (!isVisible) return null;

    const selectedItem = obj || light;
    const updateFn = light ? updateLightTransform : updateTransform;

    return (
        <Container
            ref={containerRef}
            $top={position.top}
            $left={position.left}
            $height={position.height}
            $isDragging={isDragging}
            data-drag-area
            onMouseDown={handleDragStart}
        >
            <Header
                data-drag-handle
                $isDragging={isDragging}
                onMouseDown={handleDragStart}
            >
                Inspector
                <IconButton title="Close" onClick={() => setShowInspector(false)}>
                    <X size={16} />
                </IconButton>
            </Header>
            <Body>
                <Select
                    value={selectedId || ""}
                    onChange={(e) => select(e.target.value || null)}
                >
                    <option value="">No selection</option>
                    {objects.map((object) => (
                        <option key={object.id} value={object.id}>
                            {object.name}
                        </option>
                    ))}
                    {lights.map((l) => (
                        <option key={l.id} value={l.id}>
                            {l.name}
                        </option>
                    ))}
                </Select>

                {!selectedItem && <Muted>Select an object to edit it.</Muted>}

                {selectedItem && (
                    <>
                        <div>
                            <FieldLabel>Name</FieldLabel>
                            <Input
                                type="text"
                                value={selectedItem.name}
                                onChange={(e) => {
                                    if (light) {
                                        useEditor.setState((state) => ({
                                            ...state,
                                            lights: state.lights.map((l) =>
                                                l.id === light.id
                                                    ? { ...l, name: e.target.value }
                                                    : l
                                            ),
                                        }));
                                    } else {
                                        updateName(selectedItem.id, e.target.value);
                                    }
                                }}
                            />
                        </div>
                        <div>
                            <FieldLabel>Position</FieldLabel>
                            <VectorField
                                value={selectedItem.position}
                                step={snap.enableSnapping ? snap.translateSnap : 0.1}
                                onChange={(axis, v) =>
                                    updateFn(selectedItem.id, { position: { [axis]: v } })
                                }
                            />
                        </div>
                        <div>
                            <FieldLabel>Rotation (degrees)</FieldLabel>
                            <VectorField
                                value={selectedItem.rotation}
                                scale={RAD_TO_DEG}
                                step={snap.enableSnapping ? round(snap.rotateSnap * RAD_TO_DEG) : 1}
                                onChange={(axis, v) =>
                                    updateFn(selectedItem.id, { rotation: { [axis]: v } })
                                }
                            />
                        </div>
                        {obj && (
                            <>
                                <div>
                                    <FieldLabel>Scale</FieldLabel>
                                    <VectorField
                                        value={obj.scale}
                                        step={snap.enableSnapping ? snap.scaleSnap : 0.1}
                                        onChange={(axis, v) =>
                                            updateTransform(obj.id, { scale: { [axis]: v } })
                                        }
                                    />
                                </div>
                                <div>
                                    <FieldLabel>Material</FieldLabel>
                                    <Triple>
                                        <Sub>
                                            Color
                                            <Input
                                                type="color"
                                                value={obj.material.color || "#ffffff"}
                                                onChange={(e) =>
                                                    updateMaterial(obj.id, { color: e.target.value })
                                                }
                                            />
                                        </Sub>
                                        <Sub>
                                            Metalness
                                            <Input
                                                type="number"
                                                step="0.05"
                                                min="0"
                                                max="1"
                                                value={obj.material.metalness ?? 0}
                                                onChange={(e) =>
                                                    updateMaterial(obj.id, { metalness: num(e.target.value) })
                                                }
                                            />
                                        </Sub>
                                        <Sub>
                                            Roughness
                                            <Input
                                                type="number"
                                                step="0.05"
                                                min="0"
                                                max="1"
                                                value={obj.material.roughness ?? 0}
                                                onChange={(e) =>
                                                    updateMaterial(obj.id, { roughness: num(e.target.value) })
                                                }
                                            />
                                        </Sub>
                                    </Triple>
                                </div>
                            </>
                        )}
                        {light && (
                            <div>
                                <FieldLabel>Light</FieldLabel>
                                <Triple>
                                    <Sub>
                                        Color
                                        <Input
                                            type="color"
                                            value={light.props.color || "#ffffff"}
                                            onChange={(e) =>
                                                updateLightProps(light.id, { color: e.target.value })
                                            }
                                        />
                                    </Sub>
                                    <Sub>
                                        Intensity
                                        <Input
                                            type="number"
                                            step="0.1"
                                            value={light.props.intensity ?? 1}
                                            onChange={(e) =>
                                                updateLightProps(light.id, { intensity: num(e.target.value) })
                                            }
                                        />
                                    </Sub>
                                    {light.type === "point" && (
                                        <Sub>
                                            Distance
                                            <Input
                                                type="number"
                                                step="0.1"
                                                value={light.props.distance ?? 0}
                                                onChange={(e) =>
                                                    updateLightProps(light.id, { distance: num(e.target.value) })
                                                }
                                            />
                                        </Sub>
                                    )}
                                    {light.type === "spot" && (
                                        <Sub>
                                            Angle
                                            <Input
                                                type="number"
                                                step="1"
                                                value={round((light.props.angle ?? Math.PI / 3) * RAD_TO_DEG)}
                                                onChange={(e) =>
                                                    updateLightProps(light.id, { angle: num(e.target.value) / RAD_TO_DEG })
                                                }
                                            />
                                        </Sub>
                                    )}
                                </Triple>
                            </div>
                        )}
                        <Actions>
                            {obj && (
                                <Button onClick={duplicateSelected}>
                                    <Copy size={16} />
                                    Duplicate
                                </Button>
                            )}
                            <Button
                                $variant="danger"
                                onClick={light ? () => deleteLight(light.id) : deleteSelected}
                            >
                                <Trash size={16} />
                                Delete
                            </Button>
                        </Actions>
                    </>
                )}

                <Divider />

                <div>
                    <Check>
                        <input
                            type="checkbox"
                            checked={snap.enableSnapping}
                            onChange={(e) => toggleSnap(e.target.checked)}
                        />
                        Snapping
                    </Check>
                    {snap.enableSnapping && (
                        <Triple style={{ marginTop: 10 }}>
                            <Sub>
                                Move
                                <Input
                                    type="number"
                                    step="0.1"
                                    value={snap.translateSnap}
                                    onChange={(e) => setSnap({ translateSnap: num(e.target.value) })}
                                />
                            </Sub>
                            <Sub>
                                Rotate (°)
                                <Input
                                    type="number"
                                    step="1"
                                    value={round(snap.rotateSnap * RAD_TO_DEG)}
                                    onChange={(e) => setSnap({ rotateSnap: num(e.target.value) / RAD_TO_DEG })}
                                />
                            </Sub>
                            <Sub>
                                Scale
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={snap.scaleSnap}
                                    onChange={(e) => setSnap({ scaleSnap: num(e.target.value) })}
                                />
                            </Sub>
                        </Triple>
                    )}
                </div>
            </Body>
            <ResizeHandle onMouseDown={handleResizeStart} />
        </Container>
    );
}

export default Inspector;
