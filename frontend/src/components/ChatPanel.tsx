import styled from "styled-components";
import {
    ArrowCounterClockwise,
    ClockCounterClockwise,
    PaperPlaneRight,
    PushPin,
    X,
} from "@phosphor-icons/react";
import { IconButton, Input, Panel, PanelHeader, PanelTitle } from "./ui";
import { useMemo, useRef, useState } from "react";
import { useEditor } from "../store/editor";
import type { GeometryKind, GeometryParamsMap, SceneObject, TransformMode, Vector3 } from "../types";
import { runAgent } from "../agent/agent";
import { useAgentTimeline } from "../store/agentTimeline";

const Root = styled(Panel)`
    top: calc(var(--topbar) + var(--gap));
    bottom: var(--gap);
    right: var(--gap);
    width: var(--chat-width);
    z-index: 50;
`;

const HeaderActions = styled.div`
    display: flex;
    gap: 2px;
`;

const Section = styled.div`
    padding: 8px;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 160px;
    overflow: auto;
    flex-shrink: 0;
`;

const SectionLabel = styled.div`
    padding: 2px 6px 4px;
    color: var(--text-muted);
    font-size: 12px;
`;

const HistoryItem = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 2px 2px 6px;
    border-radius: var(--radius);

    &:hover {
        background: var(--surface-raised);
    }
`;

const HistoryText = styled.div`
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const Time = styled.span`
    color: var(--text-faint);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
`;

const ContextRow = styled.div`
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
`;

const Chip = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 24px;
    padding: 0 2px 0 8px;
    border-radius: 999px;
    background: var(--surface-raised);
    font-size: 12px;
`;

const Messages = styled.div`
    flex: 1;
    padding: 12px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const Message = styled.div<{ $role: "user" | "system" }>`
    align-self: ${(p) => (p.$role === "user" ? "flex-end" : "flex-start")};
    background: ${(p) => (p.$role === "user" ? "var(--accent)" : "var(--surface-raised)")};
    color: ${(p) => (p.$role === "user" ? "var(--accent-text)" : "var(--text)")};
    padding: 7px 11px;
    border-radius: 14px;
    max-width: 85%;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
`;

const Pending = styled.div`
    color: var(--text-muted);
    padding: 0 4px;
`;

const Examples = styled.div`
    margin-top: auto;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
`;

const Example = styled.button`
    border: 1px solid var(--border);
    background: transparent;
    border-radius: 999px;
    padding: 5px 11px;
    color: var(--text-muted);

    &:hover {
        color: var(--text);
        border-color: var(--border-strong);
    }
`;

const Footer = styled.div`
    border-top: 1px solid var(--border);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
`;

const InputRow = styled.form`
    display: flex;
    gap: 6px;
`;

const Options = styled.div`
    display: flex;
    gap: 14px;
    padding: 0 4px;
    color: var(--text-muted);
    font-size: 12px;

    label {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
    }
    input {
        margin: 0;
        accent-color: var(--accent);
    }
`;

const EXAMPLES = ["Add a red sphere", "Make it twice as wide", "Add 3 cubes in a row"];

type ChatMsg = { role: "user" | "system"; text: string };

type ItemArgs = {
    id?: string;
    target?: string;
    position?: Partial<Vector3>;
    rotation?: Partial<Vector3>;
    scale?: Partial<Vector3>;
    isDelta?: boolean;
    color?: string;
    metalness?: number;
    roughness?: number;
    opacity?: number;
    transparent?: boolean;
};

type ToolCallArgs = ItemArgs & {
    kind?: GeometryKind;
    params?: GeometryParamsMap[GeometryKind];
    name?: string;
    op?: "union" | "subtract" | "intersect";
    a?: string;
    b?: string;
    enabled?: boolean;
    translateSnap?: number;
    rotateSnap?: number;
    scaleSnap?: number;
    mode?: TransformMode;
    count?: number;
    spacingX?: number;
    spacingY?: number;
    spacingZ?: number;
    startX?: number;
    startY?: number;
    startZ?: number;
    items?: ItemArgs[];
};

type GeomDims = Partial<Record<"width" | "height" | "depth" | "radius" | "radiusTop" | "radiusBottom", number>>;

export function ChatPanel() {
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [usingLLM, setUsingLLM] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [pinnedIds, setPinnedIds] = useState<string[]>([]);

    const objects = useEditor((s) => s.objects);
    const selectedId = useEditor((s) => s.selectedId);
    const addObject = useEditor((s) => s.addObject);
    const deleteSelected = useEditor((s) => s.deleteSelected);
    const duplicateSelected = useEditor((s) => s.duplicateSelected);
    const select = useEditor((s) => s.select);
    const setMode = useEditor((s) => s.setMode);
    const updateTransform = useEditor((s) => s.updateTransform);
    const updateMaterial = useEditor((s) => s.updateMaterial);
    const updateGeometry = useEditor((s) => s.updateGeometry);
    const booleanOp = useEditor((s) => s.booleanOp);
    const undo = useEditor((s) => s.undo);
    const redo = useEditor((s) => s.redo);
    const toggleSnap = useEditor((s) => s.toggleSnap);
    const setSnap = useEditor((s) => s.setSnap);
    const addCheckpoint = useEditor((s) => s.addCheckpoint);
    const checkpoints = useEditor((s) => s.checkpoints);
    const restoreCheckpoint = useEditor((s) => s.restoreCheckpoint);
    const deleteCheckpoint = useEditor((s) => s.deleteCheckpoint);
    const setShowChatPanel = useEditor((s) => s.setShowChatPanel);

    const selected = useMemo(
        () => objects.find((o) => o.id === selectedId) ?? null,
        [objects, selectedId]
    );
    const scrollRef = useRef<HTMLDivElement>(null);

    const setDryRun = useAgentTimeline((s) => s.setDryRun);
    const dryRun = useAgentTimeline((s) => s.dryRun);
    const setSteps = useAgentTimeline((s) => s.setSteps);
    const setSnapshotUi = useAgentTimeline((s) => s.setSnapshot);

    function push(role: ChatMsg["role"], text: string) {
        setMessages((prev) => [...prev, { role, text }]);
        queueMicrotask(() => {
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
        });
    }

    function pinSelected() {
        if (!selectedId) return;
        setPinnedIds((prev) => (prev.includes(selectedId) ? prev : [...prev, selectedId]));
    }

    function unpin(id: string) {
        setPinnedIds((prev) => prev.filter((x) => x !== id));
    }

    function clearPins() {
        setPinnedIds([]);
    }

    function ensurePinned(add: string | string[]) {
        setPinnedIds((prev) => {
            const next = new Set(prev);
            if (Array.isArray(add)) {
                for (const id of add) if (id) next.add(id);
            } else if (add) {
                next.add(add);
            }
            return Array.from(next);
        });
    }

    function summarizeObjectDetailed(o: SceneObject) {
        const kind = o.geometry;
        const p = (o.geometryParams ?? {}) as GeomDims;
        const eff = {
            width: kind === "box" ? (p.width ?? 1) * o.scale.x : kind === "sphere" ? 2 * (p.radius ?? 0.5) * o.scale.x : kind === "cylinder" ? 2 * Math.max(p.radiusTop ?? p.radius ?? 0.5, p.radiusBottom ?? p.radius ?? 0.5) * o.scale.x : kind === "cone" ? 2 * (p.radius ?? 0.5) * o.scale.x : kind === "torus" ? 2 * (p.radius ?? 0.5) * o.scale.x : kind === "plane" ? (p.width ?? 1) * o.scale.x : 1,
            height: kind === "box" ? (p.height ?? 1) * o.scale.y : kind === "sphere" ? 2 * (p.radius ?? 0.5) * o.scale.y : kind === "cylinder" ? (p.height ?? 1) * o.scale.y : kind === "cone" ? (p.height ?? 1) * o.scale.y : kind === "torus" ? 2 * (p.radius ?? 0.5) * o.scale.y : kind === "plane" ? (p.height ?? 1) * o.scale.y : 1,
            depth: kind === "box" ? (p.depth ?? 1) * o.scale.z : kind === "sphere" ? 2 * (p.radius ?? 0.5) * o.scale.z : kind === "cylinder" ? 2 * Math.max(p.radiusTop ?? p.radius ?? 0.5, p.radiusBottom ?? p.radius ?? 0.5) * o.scale.z : kind === "cone" ? 2 * (p.radius ?? 0.5) * o.scale.z : kind === "torus" ? 2 * (p.radius ?? 0.5) * o.scale.z : kind === "plane" ? 0 : 1,
        };
        const dims = `dims=(${eff.width.toFixed(2)}×${eff.height.toFixed(2)}×${eff.depth.toFixed(2)})`;
        return `${o.name} [${o.id}] kind=${kind} ${dims} pos=(${o.position.x.toFixed(2)},${o.position.y.toFixed(2)},${o.position.z.toFixed(2)}) rot=(${o.rotation.x.toFixed(2)},${o.rotation.y.toFixed(2)},${o.rotation.z.toFixed(2)}) scale=(${o.scale.x.toFixed(2)},${o.scale.y.toFixed(2)},${o.scale.z.toFixed(2)}) color=${o.material.color}`;
    }

    async function callLLM(userText: string) {
        try {
            setIsLoading(true);
            const sceneSummary = objects
                .map(
                    (o) =>
                        `${o.name} [${o.id}] kind=${
                            o.geometry
                        } pos=(${o.position.x.toFixed(
                            2
                        )},${o.position.y.toFixed(2)},${o.position.z.toFixed(
                            2
                        )})`
                )
                .join("; ");

            const pinned = pinnedIds
                .map((id) => objects.find((o) => o.id === id))
                .filter(Boolean) as SceneObject[];
            const focusContext = pinned.length
                ? pinned.map((o) => summarizeObjectDetailed(o)).join("; ")
                : "";

            const r = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user: userText, sceneSummary, focusContext }),
            });
            const data = await r.json();
            // OpenAI-compatible: choices[0].message
            const msg = data?.choices?.[0]?.message;
            if (!msg) return { executed: false, reply: "No reply from the assistant." };

            // If tool call present
            const tool = msg?.tool_calls?.[0];
            if (tool?.function?.name) {
                const name = tool.function.name as string;
                let args: ToolCallArgs = {};
                try {
                    args = tool.function.arguments
                        ? JSON.parse(tool.function.arguments)
                        : {};
                } catch {
                    args = {};
                }

                // map tools to store actions
                if (name === "addObject") {
                    addObject(args.kind as GeometryKind, args.params);
                    const st = useEditor.getState();
                    if (st.selectedId) ensurePinned(st.selectedId);
                    return { executed: true, reply: `Added ${args.kind}` };
                }
                if (name === "selectObject") {
                    const t = String(args.target || "");
                    const found = objects.find(
                        (o) => o.id === t || o.name === t
                    );
                    if (found) {
                        select(found.id);
                        return {
                            executed: true,
                            reply: `Selected ${found.name}`,
                        };
                    }
                    return { executed: false, reply: `Object not found: ${t}` };
                }
                if (name === "updateTransform") {
                    const id = args.id || selectedId;
                    if (!id)
                        return {
                            executed: false,
                            reply: "No target for transform",
                        };
                    const obj = objects.find((o) => o.id === id);
                    if (!obj)
                        return { executed: false, reply: "Target not found" };
                    const isDelta = !!args.isDelta;
                    const position = args.position
                        ? {
                              x: isDelta
                                  ? obj.position.x + (args.position.x ?? 0)
                                  : args.position.x ?? obj.position.x,
                              y: isDelta
                                  ? obj.position.y + (args.position.y ?? 0)
                                  : args.position.y ?? obj.position.y,
                              z: isDelta
                                  ? obj.position.z + (args.position.z ?? 0)
                                  : args.position.z ?? obj.position.z,
                          }
                        : undefined;
                    const rotation = args.rotation
                        ? {
                              x: isDelta
                                  ? obj.rotation.x + (args.rotation.x ?? 0)
                                  : args.rotation.x ?? obj.rotation.x,
                              y: isDelta
                                  ? obj.rotation.y + (args.rotation.y ?? 0)
                                  : args.rotation.y ?? obj.rotation.y,
                              z: isDelta
                                  ? obj.rotation.z + (args.rotation.z ?? 0)
                                  : args.rotation.z ?? obj.rotation.z,
                          }
                        : undefined;
                    const scale = args.scale
                        ? {
                              x: isDelta
                                  ? obj.scale.x * (args.scale.x ?? 1)
                                  : args.scale.x ?? obj.scale.x,
                              y: isDelta
                                  ? obj.scale.y * (args.scale.y ?? 1)
                                  : args.scale.y ?? obj.scale.y,
                              z: isDelta
                                  ? obj.scale.z * (args.scale.z ?? 1)
                                  : args.scale.z ?? obj.scale.z,
                          }
                        : undefined;
                    updateTransform(id, { position, rotation, scale });
                    return { executed: true, reply: "Transform updated" };
                }
                if (name === "updateMaterial") {
                    const id = args.id || selectedId;
                    if (!id)
                        return {
                            executed: false,
                            reply: "No target for material",
                        };
                    updateMaterial(id, {
                        color: args.color,
                        metalness: args.metalness,
                        roughness: args.roughness,
                        opacity: args.opacity,
                        transparent: args.transparent,
                    });
                    return { executed: true, reply: "Material updated" };
                }
                if (name === "updateGeometry") {
                    const candidate = args.id ?? args.target ?? selectedId ?? "";
                    const id = resolveId(candidate) ?? null;
                    if (!id)
                        return {
                            executed: false,
                            reply: "No target for geometry",
                        };
                    updateGeometry(id, args.kind as GeometryKind, args.params);
                    return {
                        executed: true,
                        reply: `Geometry set to ${args.kind}`,
                    };
                }
                if (name === "updateName") {
                    const candidate = args.id ?? args.target ?? selectedId ?? "";
                    const id = resolveId(candidate) ?? null;
                    const newName = String(args.name || "").trim();
                    if (!id || !newName) return { executed: false, reply: "Missing id or name" };
                    useEditor.getState().updateName(id, newName);
                    return { executed: true, reply: `Renamed to ${newName}` };
                }
                if (name === "duplicateSelected") {
                    duplicateSelected();
                    const st = useEditor.getState();
                    if (st.selectedId) ensurePinned(st.selectedId);
                    return { executed: true, reply: "Duplicated" };
                }
                if (name === "deleteSelected") {
                    deleteSelected();
                    return { executed: true, reply: "Deleted" };
                }
                if (name === "booleanOp") {
                    if (!args.op || !args.a || !args.b)
                        return { executed: false, reply: "Missing boolean args" };
                    booleanOp(args.op, args.a, args.b);
                    const st = useEditor.getState();
                    if (st.selectedId) ensurePinned(st.selectedId);
                    return { executed: true, reply: `Boolean ${args.op}` };
                }
                if (name === "undo") {
                    undo();
                    return { executed: true, reply: "Undid last action" };
                }
                if (name === "redo") {
                    redo();
                    return { executed: true, reply: "Redid last action" };
                }
                if (name === "toggleSnap") {
                    toggleSnap(!!args.enabled);
                    return {
                        executed: true,
                        reply: `Snapping ${
                            args.enabled ? "enabled" : "disabled"
                        }`,
                    };
                }
                if (name === "setSnap") {
                    setSnap({
                        translateSnap: args.translateSnap,
                        rotateSnap: args.rotateSnap,
                        scaleSnap: args.scaleSnap,
                    });
                    return { executed: true, reply: "Snap updated" };
                }
                if (name === "setMode") {
                    if (!args.mode) return { executed: false, reply: "Missing mode" };
                    setMode(args.mode);
                    return { executed: true, reply: `Mode: ${args.mode}` };
                }
                if (name === "addRepeatedObjects") {
                    const kind = args.kind as GeometryKind;
                    const count = Math.max(1, Number(args.count || 1));
                    const params = args.params;
                    const dims = params as GeomDims | undefined;
                    const sx = Number(args.spacingX ?? (dims?.width ?? dims?.radius ?? 1.0) * 1.2);
                    const sy = Number(args.spacingY ?? 0);
                    const sz = Number(args.spacingZ ?? 0);
                    const startX = Number(args.startX ?? 0);
                    const startY = Number(args.startY ?? 0);
                    const startZ = Number(args.startZ ?? 0);
                    let created = 0;
                    for (let i = 0; i < count; i++) {
                        addObject(kind, params);
                        const id = useEditor.getState().selectedId;
                        if (id) {
                            updateTransform(id, {
                                position: {
                                    x: startX + i * sx,
                                    y: startY + i * sy,
                                    z: startZ + i * sz,
                                },
                            });
                            ensurePinned(id);
                            created++;
                        }
                    }
                    return { executed: true, reply: `Added ${created} ${kind}(s)` };
                }
                if (name === "updateTransformMany") {
                    const items: ItemArgs[] = Array.isArray(args.items) ? args.items : [];
                    let applied = 0;
                    for (const it of items) {
                        const t = String(it.id || it.target || "");
                        const obj = objects.find(o => o.id === t || o.name === t);
                        if (!obj) continue;
                        const isDelta = !!it.isDelta;
                        const position = it.position ? {
                            x: isDelta ? obj.position.x + (it.position.x ?? 0) : (it.position.x ?? obj.position.x),
                            y: isDelta ? obj.position.y + (it.position.y ?? 0) : (it.position.y ?? obj.position.y),
                            z: isDelta ? obj.position.z + (it.position.z ?? 0) : (it.position.z ?? obj.position.z),
                        } : undefined;
                        const rotation = it.rotation ? {
                            x: isDelta ? obj.rotation.x + (it.rotation.x ?? 0) : (it.rotation.x ?? obj.rotation.x),
                            y: isDelta ? obj.rotation.y + (it.rotation.y ?? 0) : (it.rotation.y ?? obj.rotation.y),
                            z: isDelta ? obj.rotation.z + (it.rotation.z ?? 0) : (it.rotation.z ?? obj.rotation.z),
                        } : undefined;
                        const scale = it.scale ? {
                            x: isDelta ? obj.scale.x * (it.scale.x ?? 1) : (it.scale.x ?? obj.scale.x),
                            y: isDelta ? obj.scale.y * (it.scale.y ?? 1) : (it.scale.y ?? obj.scale.y),
                            z: isDelta ? obj.scale.z * (it.scale.z ?? 1) : (it.scale.z ?? obj.scale.z),
                        } : undefined;
                        updateTransform(obj.id, { position, rotation, scale });
                        applied++;
                    }
                    return { executed: applied > 0, reply: `Updated ${applied} object(s)` };
                }
                if (name === "updateMaterialMany") {
                    const items: ItemArgs[] = Array.isArray(args.items) ? args.items : [];
                    let applied = 0;
                    for (const it of items) {
                        const t = String(it.id || it.target || "");
                        const obj = objects.find(o => o.id === t || o.name === t);
                        if (!obj) continue;
                        updateMaterial(obj.id, {
                            color: it.color,
                            metalness: it.metalness,
                            roughness: it.roughness,
                            opacity: it.opacity,
                            transparent: it.transparent,
                        });
                        applied++;
                    }
                    return { executed: applied > 0, reply: `Material updated on ${applied} object(s)` };
                }
            }

            const text = msg?.content ?? "Ok";
            return { executed: false, reply: text };
        } catch {
            return { executed: false, reply: "The assistant is unavailable right now." };
        } finally {
            setIsLoading(false);
        }
    }

    function checkpoint(prompt: string, response: string) {
        addCheckpoint({ prompt, response, label: prompt.slice(0, 40) });
    }

    function findByNameOrId(nameOrId: string): SceneObject | undefined {
        const lower = nameOrId.toLowerCase();
        return objects.find(
            (o) =>
                o.id.toLowerCase() === lower || o.name.toLowerCase() === lower
        );
    }

    function resolveId(nameOrId: string): string | undefined {
        const obj = findByNameOrId(nameOrId);
        return obj ? obj.id : undefined;
    }

    async function handleAgent(text: string) {
        const result = await runAgent(text, !dryRun);
        setSteps(result.transcript);
        setSnapshotUi(result.snapshot);
        const n = result.transcript.length;
        if (n === 0) return "";
        const steps = `${n} step${n === 1 ? "" : "s"}`;
        return dryRun ? `Planned ${steps}. Turn off preview to apply.` : `Done in ${steps}.`;
    }

    function handleCommand(raw: string) {
        const text = raw.trim();
        if (!text) return;
        push("user", text);

        if (usingLLM) {
            callLLM(text).then(({ executed, reply }) => {
                push("system", reply);
                if (executed) {
                    checkpoint(text, reply);
                } else {
                    handleAgent(text).then((agentReply) => {
                        if (agentReply) push("system", agentReply);
                    });
                }
            });
            return;
        }

        handleAgent(text).then((reply) => {
            push("system", reply || "I couldn't turn that into an edit.");
        });
    }

    function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        const t = input;
        setInput("");
        handleCommand(t);
    }

    const pinned = pinnedIds
        .map((id) => objects.find((o) => o.id === id))
        .filter((o): o is SceneObject => Boolean(o));

    return (
        <Root data-chat-panel>
            <PanelHeader>
                <PanelTitle>Assistant</PanelTitle>
                <HeaderActions>
                    <IconButton
                        title="Checkpoints"
                        $active={showHistory}
                        onClick={() => setShowHistory((v) => !v)}
                    >
                        <ClockCounterClockwise size={16} />
                    </IconButton>
                    <IconButton title="Close" onClick={() => setShowChatPanel(false)}>
                        <X size={16} />
                    </IconButton>
                </HeaderActions>
            </PanelHeader>
            {showHistory && (
                <Section>
                    <SectionLabel>Checkpoints</SectionLabel>
                    {checkpoints.length === 0 ? (
                        <SectionLabel>Each change the assistant makes is saved here.</SectionLabel>
                    ) : (
                        checkpoints.slice(0, 10).map((cp) => (
                            <HistoryItem key={cp.id} title={cp.prompt ?? cp.label}>
                                <HistoryText>{cp.label}</HistoryText>
                                <Time>
                                    {new Date(cp.timestamp).toLocaleTimeString([], {
                                        hour: "numeric",
                                        minute: "2-digit",
                                    })}
                                </Time>
                                <IconButton
                                    $size={26}
                                    title="Restore"
                                    onClick={() => restoreCheckpoint(cp.id)}
                                >
                                    <ArrowCounterClockwise size={14} />
                                </IconButton>
                                <IconButton
                                    $size={26}
                                    title="Remove"
                                    onClick={() => deleteCheckpoint(cp.id)}
                                >
                                    <X size={14} />
                                </IconButton>
                            </HistoryItem>
                        ))
                    )}
                </Section>
            )}
            {(pinned.length > 0 || selectedId) && (
                <ContextRow>
                    {pinned.map((o) => (
                        <Chip key={o.id}>
                            {o.name}
                            <IconButton $size={20} title="Unpin" onClick={() => unpin(o.id)}>
                                <X size={12} />
                            </IconButton>
                        </Chip>
                    ))}
                    {selectedId && !pinnedIds.includes(selectedId) && (
                        <IconButton $size={24} title="Pin selection as context" onClick={pinSelected}>
                            <PushPin size={14} />
                        </IconButton>
                    )}
                    {pinned.length > 1 && (
                        <IconButton $size={24} title="Clear pins" onClick={clearPins}>
                            <X size={14} />
                        </IconButton>
                    )}
                </ContextRow>
            )}
            <Messages ref={scrollRef}>
                {messages.length === 0 && (
                    <Examples>
                        {EXAMPLES.map((ex) => (
                            <Example key={ex} onClick={() => handleCommand(ex)}>
                                {ex}
                            </Example>
                        ))}
                    </Examples>
                )}
                {messages.map((m, i) => (
                    <Message key={i} $role={m.role}>
                        {m.text}
                    </Message>
                ))}
                {isLoading && <Pending>Thinking…</Pending>}
            </Messages>
            <Footer>
                <InputRow onSubmit={onSubmit}>
                    <Input
                        placeholder={selected ? `Change ${selected.name}…` : "Describe a change…"}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                    />
                    <IconButton type="submit" title="Send" disabled={!input.trim()}>
                        <PaperPlaneRight size={18} />
                    </IconButton>
                </InputRow>
                <Options>
                    <label>
                        <input
                            type="checkbox"
                            checked={usingLLM}
                            onChange={(e) => setUsingLLM(e.target.checked)}
                        />
                        Use AI model
                    </label>
                    {!usingLLM && (
                        <label>
                            <input
                                type="checkbox"
                                checked={dryRun}
                                onChange={(e) => setDryRun(e.target.checked)}
                            />
                            Preview only
                        </label>
                    )}
                </Options>
            </Footer>
        </Root>
    );
}

export default ChatPanel;
