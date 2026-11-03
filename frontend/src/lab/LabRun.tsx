import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import type { WireMessage } from "@shapeshift/shared/assistant/protocol";
import { runTurn } from "../assistant/agent";
import { newTurnContext } from "../assistant/executor";
import { makeHttpTransport, type Transport } from "../assistant/transport";
import { GlobalStyle } from "../components/ui";
import { useScene } from "../scene/store";
import { SceneView } from "../viewer/SceneView";
import type { SceneDoc } from "@shapeshift/shared/scene/schema";

// One model in the Model lab, run in its own frame so several can work at
// once without sharing a scene. It builds from an empty scene, shows the
// scene as it goes and every step the model takes, then tells the lab how
// it went and keeps the run (numbers, final scene, picture and steps) so it
// can be opened again: `?replay=<run>&model=` shows a kept one. The editor's
// saved scene is never touched: main.tsx skips autosave on /lab pages.

type Entry =
    | { kind: "thinking" | "text"; text: string }
    | { kind: "call"; at: number; name: string; args: string }
    | { kind: "result"; ok: boolean; label: string; error?: string }
    | { kind: "step"; at: number; ms: number }
    | { kind: "error"; text: string };

export type LabResult = { type: "lab-done"; run: string; model: string; ms: number; steps: number; changes: number; failed: number; error?: string };

const Root = styled.div`
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-rows: auto minmax(160px, 45%) 1fr;
    background: var(--bg);
    color: var(--text);
    font-size: 12px;
`;

const Head = styled.header`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);

    b {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    span {
        color: var(--text-muted);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }
    i {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }
`;

const Stage = styled.div`
    position: relative;
    border-bottom: 1px solid var(--border);
`;

const Log = styled.ol`
    margin: 0;
    padding: 8px 10px 16px;
    list-style: none;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font: 11.5px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;

    li {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }
    .thinking {
        color: var(--text-faint);
        font-style: italic;
    }
    .text {
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
        font-size: 12.5px;
    }
    .call {
        color: var(--accent);
    }
    .call small {
        color: var(--text-muted);
    }
    .ok {
        color: var(--success);
    }
    .bad {
        color: var(--danger);
    }
    .step {
        color: var(--text-faint);
        border-top: 1px dashed var(--border);
        padding-top: 4px;
    }
`;

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

// A frame runs its model once, even when React mounts the page twice in
// development; reloading the frame starts again.
let begun = false;

// A picture of the finished scene, small enough to keep with the run.
function picture(): string | undefined {
    const canvas = document.querySelector("canvas");
    if (!canvas) return undefined;
    const small = document.createElement("canvas");
    small.width = 480;
    small.height = Math.round((480 * canvas.height) / Math.max(1, canvas.width));
    small.getContext("2d")?.drawImage(canvas, 0, 0, small.width, small.height);
    return small.toDataURL("image/jpeg", 0.75).split(",")[1];
}

export default function LabRun() {
    const replay = new URLSearchParams(location.search).get("replay");
    return replay ? <Replay run={replay} model={new URLSearchParams(location.search).get("model") ?? ""} /> : <Live />;
}

type Kept = { model: string; prompt: string; ms: number; steps: number; changes: number; failed: number; error?: string; doc: SceneDoc; log: Entry[] };

// A kept run, shown as it ended.
function Replay({ run, model }: { run: string; model: string }) {
    const [kept, setKept] = useState<Kept | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    useEffect(() => {
        void fetch(`/api/admin/lab/runs/${run}/record?model=${encodeURIComponent(model)}`)
            .then(async (r) => (r.ok ? setKept((await r.json()) as Kept) : setProblem("That run isn't kept anymore.")))
            .catch(() => setProblem("Couldn't load that run."));
    }, [run, model]);
    if (problem || !kept) return <View model={model} status={problem ? "error" : "running"} ms={0} counts={{ steps: 0, changes: 0, failed: 0 }} doc={EMPTY} log={problem ? [{ kind: "error", text: problem }] : []} />;
    return <View model={kept.model} status={kept.error ? "error" : "done"} ms={kept.ms} counts={kept} doc={kept.doc} log={kept.log} />;
}

const EMPTY: SceneDoc = { version: 1, objects: [], lights: [], environment: "none", animation: { duration: 4, loop: true, tracks: [] } } as unknown as SceneDoc;

function Live() {
    const params = new URLSearchParams(location.search);
    const model = params.get("model") ?? "";
    const prompt = params.get("prompt") ?? "";
    const run = params.get("run") ?? "";
    const doc = useScene((s) => s.doc);
    const [log, setLog] = useState<Entry[]>([]);
    const [status, setStatus] = useState<"running" | "done" | "error">("running");
    const [now, setNow] = useState(Date.now());
    const started = useRef(Date.now());
    const end = useRef<HTMLLIElement>(null);
    const counts = useRef({ steps: 0, changes: 0, failed: 0 });
    const logRef = useRef<Entry[]>([]);
    logRef.current = log;

    // Keeps the newest step in view, and the clock ticking while it runs.
    useEffect(() => {
        end.current?.scrollIntoView({ block: "end" });
    }, [log.length]);
    useEffect(() => {
        if (status !== "running") return;
        const t = setInterval(() => setNow(Date.now()), 200);
        return () => clearInterval(t);
    }, [status]);

    useEffect(() => {
        if (begun) return;
        begun = true;
        const add = (e: Entry) => setLog((l) => [...l, e]);
        // Thinking and words come in pieces; they join the entry before them.
        const stream = (kind: "thinking" | "text") => (text: string) =>
            setLog((l) => {
                const last = l[l.length - 1];
                return last?.kind === kind ? [...l.slice(0, -1), { kind, text: last.text + text }] : [...l, { kind, text }];
            });
        const http = makeHttpTransport(`/api/admin/agent?model=${encodeURIComponent(model)}`);
        // Wrapped to note each step's time and the calls it asked for.
        const transport: Transport = async (request, handlers, signal) => {
            const at = Date.now();
            const result = await http(request, handlers, signal);
            counts.current.steps++;
            add({ kind: "step", at: at - started.current, ms: Date.now() - at });
            for (const call of result.message.tool_calls ?? []) add({ kind: "call", at: Date.now() - started.current, name: call.name, args: call.arguments });
            return result;
        };
        const controller = new AbortController();
        window.addEventListener("pagehide", () => controller.abort());
        const conversation: WireMessage[] = [];
        const finish = (error?: string) => {
            const ms = Date.now() - started.current;
            setNow(Date.now());
            setStatus(error ? "error" : "done");
            const message: LabResult = { type: "lab-done", run, model, ms, ...counts.current, ...(error ? { error } : {}) };
            // Kept for later, then the lab is told, so its list of past runs includes this one.
            setTimeout(() => {
                const record = { run: run.split(":")[0], model, prompt, ms, ...counts.current, ...(error ? { error: error.slice(0, 400) } : {}), doc: useScene.getState().doc, log: logRef.current, picture: picture() };
                void fetch("/api/admin/lab/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(record) })
                    .catch(() => {})
                    .finally(() => window.parent.postMessage(message, location.origin));
            }, 800);
        };
        runTurn({
            conversation,
            prompt,
            transport,
            signal: controller.signal,
            ctx: newTurnContext(`lab:${run}`),
            handlers: {
                onThinking: stream("thinking"),
                onText: stream("text"),
                onActivities: (activities) =>
                    activities.forEach((a) => {
                        if (a.changed) counts.current.changes++;
                        if (!a.ok) counts.current.failed++;
                        add({ kind: "result", ok: a.ok, label: a.label, error: a.error });
                    }),
            },
        })
            .then(() => finish())
            .catch((err: unknown) => {
                const text = err instanceof Error ? err.message : "Something went wrong.";
                add({ kind: "error", text });
                finish(text);
            });
        // Closing the lab or starting another run removes the frame, which ends this.
    }, [model, prompt, run]);

    return <View model={model} status={status} ms={now - started.current} counts={counts.current} doc={doc} log={log} end={end} capture />;
}

function View({
    model,
    status,
    ms,
    counts: c,
    doc,
    log,
    end,
    capture,
}: {
    model: string;
    status: "running" | "done" | "error";
    ms: number;
    counts: { steps: number; changes: number; failed: number };
    doc: SceneDoc;
    log: Entry[];
    end?: React.RefObject<HTMLLIElement | null>;
    capture?: boolean;
}) {
    const color = status === "running" ? "var(--warning)" : status === "done" ? "var(--success)" : "var(--danger)";
    return (
        <Root>
            <GlobalStyle />
            <Head>
                <i style={{ background: color }} />
                <b title={model}>{model}</b>
                <span>
                    {secs(ms)} · {c.steps} steps · {c.changes} changes{c.failed ? ` · ${c.failed} failed` : ""}
                </span>
            </Head>
            <Stage>
                <SceneView doc={doc} capture={capture} />
            </Stage>
            <Log>
                {log.map((e, i) =>
                    e.kind === "thinking" || e.kind === "text" ? (
                        <li key={i} className={e.kind}>
                            {e.text}
                        </li>
                    ) : e.kind === "call" ? (
                        <li key={i} className="call">
                            → {e.name} <small>{e.args.length > 400 ? `${e.args.slice(0, 400)}…` : e.args}</small>
                        </li>
                    ) : e.kind === "result" ? (
                        <li key={i} className={e.ok ? "ok" : "bad"}>
                            {e.ok ? "✓" : "✗"} {e.label}
                            {e.error ? ` · ${e.error}` : ""}
                        </li>
                    ) : e.kind === "step" ? (
                        <li key={i} className="step">
                            step {secs(e.at)} → took {secs(e.ms)}
                        </li>
                    ) : (
                        <li key={i} className="bad">
                            {e.text}
                        </li>
                    )
                )}
                <li ref={end} />
            </Log>
        </Root>
    );
}
