import styled from "styled-components";
import { useMemo, useRef, useState } from "react";
import { useEditor } from "../store/editor";
import type { GeometryKind, SceneObject } from "../types";
import { runAgent } from "../agent/agent";
import { useAgentTimeline } from "../store/agentTimeline";

const SERVER_URL =
    (import.meta as any).env?.VITE_SERVER_URL ?? "http://localhost:8787";

const Panel = styled.div`
    position: absolute;
    top: 56px;
    bottom: 12px;
    right: 12px;
    width: 280px;
    background: rgba(18, 20, 26, 0.9);
    color: #e6e9ef;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 50;
`;

const Header = styled.div`
    padding: 8px 12px;
    font-weight: 600;
    opacity: 0.9;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const Toggle = styled.button`
    background: #12141a;
    color: #e6e9ef;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 12px;
`;

const History = styled.div`
    max-height: 120px;
    overflow: auto;
    padding: 6px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const HistoryItem = styled.div`
    display: flex;
    gap: 6px;
    align-items: center;
    justify-content: space-between;
    background: rgba(30, 34, 44, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 6px 8px;
`;

const SmallBtn = styled.button`
    background: #0f1116;
    color: #e6e9ef;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 4px 6px;
    font-size: 12px;
`;

const Messages = styled.div`
    flex: 1;
    padding: 8px 12px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const Message = styled.div<{ role: "user" | "system" }>`
    align-self: ${(p) => (p.role === "user" ? "flex-end" : "flex-start")};
    background: ${(p) =>
        p.role === "user" ? "rgba(60, 65, 80, 0.6)" : "rgba(30, 34, 44, 0.8)"};
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #e6e9ef;
    padding: 6px 10px;
    border-radius: 10px;
    max-width: 70%;
    white-space: pre-wrap;
`;

const InputRow = styled.form`
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    padding: 8px 8px 10px 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
`;

const TextInput = styled.input`
    background: #0f1116;
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #e6e9ef;
    border-radius: 10px;
    padding: 8px 10px;
`;

const SendBtn = styled.button`
    background: rgba(18, 20, 26, 0.9);
    color: #e6e9ef;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 8px 12px;
`;

type ChatMsg = { role: "user" | "system"; text: string };

export function ChatPanel() {
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<ChatMsg[]>([
        {
            role: "system",
            text: 'Try: "add box", "move x 1 y 0 z -0.5", "rotate y 45", "scale 1.5", "color red", "delete", "duplicate", "select Sphere", "union A B", "undo"',
        },
    ]);
    const [showHistory, setShowHistory] = useState(true);
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
        const p: any = o.geometryParams || {};
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

            const r = await fetch(`${SERVER_URL}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user: userText, sceneSummary, focusContext }),
            });
            const data = await r.json();
            // OpenAI-compatible: choices[0].message
            const msg = data?.choices?.[0]?.message;
            if (!msg) return { executed: false, reply: "No response" };

            // If tool call present
            const tool = msg?.tool_calls?.[0];
            if (tool?.function?.name) {
                const name = tool.function.name as string;
                let args: any = {};
                try {
                    args = tool.function.arguments
                        ? JSON.parse(tool.function.arguments)
                        : {};
                } catch {}

                // map tools to store actions
                if (name === "addObject") {
                    addObject(args.kind as GeometryKind, args.params);
                    const st = (useEditor as any).getState?.() || {};
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
                    const candidate = args.id ?? args.target ?? selectedId;
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
                    const candidate = args.id ?? args.target ?? selectedId;
                    const id = resolveId(candidate) ?? null;
                    const newName = String(args.name || "").trim();
                    if (!id || !newName) return { executed: false, reply: "Missing id or name" };
                    const updateNameStore = (useEditor as any).getState?.().updateName;
                    if (updateNameStore) updateNameStore(id, newName);
                    return { executed: true, reply: `Renamed to ${newName}` };
                }
                if (name === "duplicateSelected") {
                    duplicateSelected();
                    const st = (useEditor as any).getState?.() || {};
                    if (st.selectedId) ensurePinned(st.selectedId);
                    return { executed: true, reply: "Duplicated" };
                }
                if (name === "deleteSelected") {
                    deleteSelected();
                    return { executed: true, reply: "Deleted" };
                }
                if (name === "booleanOp") {
                    booleanOp(args.op, args.a, args.b);
                    const st = (useEditor as any).getState?.() || {};
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
                    setMode(args.mode);
                    return { executed: true, reply: `Mode: ${args.mode}` };
                }
                if (name === "addRepeatedObjects") {
                    const kind = args.kind as GeometryKind;
                    const count = Math.max(1, Number(args.count || 1));
                    const params = args.params;
                    const sx = Number(args.spacingX ?? (params?.width ?? params?.radius ?? 1.0) * 1.2);
                    const sy = Number(args.spacingY ?? 0);
                    const sz = Number(args.spacingZ ?? 0);
                    const startX = Number(args.startX ?? 0);
                    const startY = Number(args.startY ?? 0);
                    const startZ = Number(args.startZ ?? 0);
                    let created = 0;
                    for (let i = 0; i < count; i++) {
                        addObject(kind, params);
                        const state = (useEditor as any).getState?.() || {};
                        const id = state.selectedId as string | undefined;
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
                    const items: any[] = Array.isArray(args.items) ? args.items : [];
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
                    const items: any[] = Array.isArray(args.items) ? args.items : [];
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
        } catch (e) {
            return { executed: false, reply: "LLM call failed" };
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
        // Always call perceive first via runAgent
        console.log("[Chat] handleAgent text=", text, "dryRun=", dryRun);
        const result = await runAgent(text, !dryRun);
        console.log("[Chat] agent result:", result);
        setSteps(result.transcript);
        setSnapshotUi(result.snapshot);
        const summary = `Agent ${dryRun ? "planned" : "executed"} ${result.transcript.length} step(s).`;
        return summary;
    }

    function handleCommand(raw: string) {
        const text = raw.trim();
        if (!text) return;
        console.log("[Chat] handleCommand raw=", raw);
        push("user", text);

        if (usingLLM) {
            callLLM(text).then(({ executed, reply }) => {
                push("system", reply);
                if (executed) {
                    checkpoint(text, reply);
                } else {
                    // Fallback to deterministic agent if no tool call was executed
                    handleAgent(text).then((agentReply) => push("system", agentReply));
                }
            });
            return;
        }

        handleAgent(text).then((reply) => {
            push("system", reply);
        });
    }

    function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        const t = input;
        console.log("[Chat] onSubmit input=", t);
        setInput("");
        handleCommand(t);
    }

    return (
        <Panel data-chat-panel>
            <Header>
                <div>Chat</div>
                <div style={{ display: "flex", gap: 6 }}>
                    <Toggle onClick={() => setUsingLLM((v) => !v)}>
                        {usingLLM ? "LLM: On" : "LLM: Off"}
                    </Toggle>
                    <Toggle onClick={() => setShowHistory((v) => !v)}>
                        {showHistory ? "Hide" : "Show"} History
                    </Toggle>
                    <Toggle onClick={() => setDryRun(!dryRun)} title="Toggle dry-run / apply">
                        {dryRun ? "Dry-run" : "Apply"}
                    </Toggle>
          <Toggle onClick={() => {
            // Hide via global store so layout unmounts the panel
            try { (useEditor as any).setState((s: any) => ({ ...s, showChatPanel: false })); } catch {}
          }}>✕</Toggle>
                </div>
            </Header>
            <div style={{ padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, opacity: 0.85 }}>Context: {pinnedIds.length} pinned</div>
                <SmallBtn onClick={pinSelected} disabled={!selectedId} title="Pin selected to chat context">Pin Selected</SmallBtn>
                <SmallBtn onClick={clearPins} title="Clear pinned context">Clear</SmallBtn>
                {pinnedIds.slice(0, 3).map((id) => {
                    const o = objects.find((x) => x.id === id);
                    if (!o) return null;
                    return (
                        <span key={id} style={{ fontSize: 11, background: "rgba(30,34,44,0.7)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "2px 6px" }}>
                            {o.name}
                            <button onClick={() => unpin(id)} style={{ marginLeft: 6, background: "transparent", color: "#aaa" }}>×</button>
                        </span>
                    );
                })}
            </div>
            {showHistory && (
                <History>
                    {checkpoints.length === 0 ? (
                        <div style={{ opacity: 0.6, fontSize: 12 }}>
                            No checkpoints yet
                        </div>
                    ) : (
                        checkpoints.slice(0, 10).map((cp) => (
                            <HistoryItem key={cp.id}>
                                <div
                                    style={{ flex: 1, minWidth: 0 }}
                                    title={cp.prompt ?? cp.label}
                                >
                                    <div
                                        style={{
                                            fontSize: 12,
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                        }}
                                    >
                                        {cp.label}
                                    </div>
                                    <div style={{ opacity: 0.6, fontSize: 11 }}>
                                        {new Date(
                                            cp.timestamp
                                        ).toLocaleTimeString()}
                                    </div>
                                </div>
                                <SmallBtn
                                    onClick={() => restoreCheckpoint(cp.id)}
                                >
                                    Restore
                                </SmallBtn>
                                <SmallBtn
                                    onClick={() => deleteCheckpoint(cp.id)}
                                >
                                    ✕
                                </SmallBtn>
                            </HistoryItem>
                        ))
                    )}
                </History>
            )}
            <Messages ref={scrollRef}>
                {messages.map((m, i) => (
                    <Message key={i} role={m.role}>
                        {m.text}
                        {isLoading && i === messages.length - 1 && usingLLM
                            ? " …"
                            : ""}
                    </Message>
                ))}
            </Messages>
            <div style={{ padding: "6px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <SnapshotCounts />
                <ExportButton />
            </div>
            <InputRow onSubmit={onSubmit}>
                <TextInput
                    placeholder={
                        selected ? `Command for ${selected.name}…` : "Command…"
                    }
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            // handled by form submit
                        }
                    }}
                />
                <SendBtn type="submit">Send</SendBtn>
            </InputRow>
        </Panel>
    );
}

function SnapshotCounts() {
    const snap = useAgentTimeline((s) => s.snapshot);
    const meshes = snap?.counts.meshes ?? 0;
    const lights = snap?.counts.lights ?? 0;
    const cameras = snap?.counts.cameras ?? 0;
    return (
        <div style={{ fontSize: 12, opacity: 0.85 }}>
            {`Meshes: ${meshes} · Lights: ${lights} · Cameras: ${cameras}`}
        </div>
    );
}

function ExportButton() {
    const setSteps = useAgentTimeline((s) => s.setSteps);
    const setSnapshot = useAgentTimeline((s) => s.setSnapshot);
    return (
        <SmallBtn onClick={async () => {
            const res = await runAgent("Export the scene to GLB.", true);
            setSteps(res.transcript);
            setSnapshot(res.snapshot);
        }}>Download GLB</SmallBtn>
    );
}

export default ChatPanel;
