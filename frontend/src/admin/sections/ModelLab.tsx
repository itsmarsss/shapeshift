import { useEffect, useState } from "react";
import styled from "styled-components";
import { ArrowCounterClockwise, Play, Plus, X } from "@phosphor-icons/react";
import { Button, Input, TextArea } from "../../components/ui";
import type { LabResult } from "../../lab/LabRun";
import { ago, run as act, useKept, useLoad, when } from "../nav";
import { Badge, Confirm, Header, Note, Panel, TableBox } from "../ui";

// Try the assistant on other models, side by side: each one builds the same
// prompt from an empty scene in its own frame, so you can watch them think,
// see every step, and compare what they made, how long it took and what failed.
// Runs use the admin route, so they don't count against anyone's prompts.

const PRESET_MODELS: { id: string; note: string }[] = [
    { id: "@cf/zai-org/glm-4.7-flash", note: "free model now" },
    { id: "@cf/openai/gpt-oss-120b#low", note: "thinks briefly" },
    { id: "@cf/openai/gpt-oss-120b#medium", note: "" },
    { id: "@cf/openai/gpt-oss-120b", note: "best layouts so far" },
    { id: "@cf/openai/gpt-oss-20b", note: "smaller, faster" },
    { id: "@cf/google/gemma-4-26b-a4b-it", note: "" },
    { id: "@cf/qwen/qwen3-30b-a3b-fp8", note: "" },
    { id: "@cf/meta/llama-4-scout-17b-16e-instruct", note: "" },
    { id: "@cf/mistralai/mistral-small-3.1-24b-instruct", note: "" },
    { id: "@cf/zai-org/glm-5.3-flash", note: "paid Workers plan" },
    { id: "claude-sonnet-5-5", note: "needs the Claude key" },
];

const PRESET_PROMPTS = {
    Table: "A wooden table with four legs, with a mug and a lamp standing on the tabletop.",
    Snowman: "A snowman with three stacked snowballs, a top hat, a carrot nose and two stick arms.",
    House: "A two-storey house with a pitched roof, a front door, two windows on each floor and a chimney.",
};

const Setup = styled.div`
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 12px;
    margin-bottom: 12px;

    @media (max-width: 900px) {
        grid-template-columns: minmax(0, 1fr);
    }
    textarea {
        min-height: 92px;
    }
    .presets,
    .models {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
    }
    .models label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        border: 1px solid var(--border);
        border-radius: 8px;
        font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
        cursor: pointer;
    }
    .models label:has(input:checked) {
        border-color: var(--accent);
        background: var(--accent-soft);
    }
    .models small {
        font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
        color: var(--text-muted);
    }
    .add {
        display: flex;
        gap: 6px;
        margin-top: 8px;
    }
`;

const Lanes = styled.div<{ $cols: number }>`
    display: grid;
    grid-template-columns: repeat(${(p) => p.$cols}, minmax(0, 1fr));
    gap: 10px;
    margin-top: 12px;

    @media (max-width: 900px) {
        grid-template-columns: minmax(0, 1fr);
    }
    iframe {
        width: 100%;
        height: 680px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--bg);
    }
`;

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

type Kept = { model: string; ms: number; steps: number; changes: number; failed: number; error?: string; picture: boolean };
type KeptRun = { run: string; prompt: string; at: number; results: Kept[] };

const Past = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 20px;

    > h3 {
        margin: 0;
        font-size: 15px;
    }
    article {
        padding: 12px 14px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: var(--surface);
    }
    article header {
        display: flex;
        align-items: baseline;
        gap: 10px;
        margin-bottom: 10px;
    }
    article header p {
        flex: 1;
        min-width: 0;
        margin: 0;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    article header small {
        color: var(--text-muted);
        white-space: nowrap;
    }
    .results {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 8px;
    }
    .result {
        display: flex;
        flex-direction: column;
        border: 1px solid var(--border);
        border-radius: 10px;
        overflow: hidden;
        background: var(--bg);
        color: var(--text);
        text-align: left;
        padding: 0;
        cursor: pointer;
    }
    .result:hover {
        border-color: var(--border-strong);
    }
    .result img,
    .result .blank {
        width: 100%;
        aspect-ratio: 16 / 10;
        object-fit: cover;
        background: var(--surface-raised);
    }
    .result div {
        padding: 6px 8px 8px;
        font-size: 12px;
    }
    .result b {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font: 11.5px ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .result span {
        color: var(--text-muted);
    }
    .result .bad {
        color: var(--danger);
    }
`;

export function ModelLab() {
    const [prompt, setPrompt] = useKept("lab-prompt", PRESET_PROMPTS.Table);
    const [models, setModels] = useKept<string[]>("lab-models", ["@cf/zai-org/glm-4.7-flash", "@cf/openai/gpt-oss-120b#low"]);
    const [custom, setCustom] = useKept<string[]>("lab-custom", []);
    const [draft, setDraft] = useState("");
    const [run, setRun] = useState<{ id: string; prompt: string; models: string[] } | null>(null);
    const [results, setResults] = useState<Record<string, LabResult>>({});
    const kept = useLoad<{ runs: KeptRun[] }>("/lab/runs");
    // A kept run opened again: its frames show it as it ended.
    const [opened, setOpened] = useState<KeptRun | null>(null);

    // Each frame reports back when its model is done.
    useEffect(() => {
        const listen = (e: MessageEvent) => {
            const data = e.data as LabResult;
            if (e.origin !== location.origin || data?.type !== "lab-done" || data.run.split(":")[0] !== run?.id) return;
            setResults((r) => ({ ...r, [data.model]: data }));
            kept.reload();
        };
        window.addEventListener("message", listen);
        return () => window.removeEventListener("message", listen);
    }, [run?.id, kept.reload]); // eslint-disable-line react-hooks/exhaustive-deps

    const all = [...PRESET_MODELS, ...custom.map((id) => ({ id, note: "added" }))];
    const toggle = (id: string) => setModels(models.includes(id) ? models.filter((m) => m !== id) : [...models, id]);
    const start = () => {
        setResults({});
        setOpened(null);
        setRun({ id: Date.now().toString(36), prompt, models });
    };
    const fastest = Object.values(results).filter((r) => !r.error).sort((a, b) => a.ms - b.ms)[0]?.model;

    return (
        <>
            <Header
                title="Model lab"
                actions={
                    <Button $variant="primary" disabled={!prompt.trim() || !models.length} onClick={start}>
                        <Play size={14} weight="fill" /> Run {models.length > 1 ? `${models.length} models` : "it"}
                    </Button>
                }
            >
                Try the assistant on other models side by side, from an empty scene, and watch them work.
            </Header>
            <Setup>
                <Panel>
                    <h3>Prompt</h3>
                    <TextArea value={prompt} onChange={(e) => setPrompt(e.target.value)} aria-label="Prompt" />
                    <div className="presets">
                        {Object.entries(PRESET_PROMPTS).map(([name, text]) => (
                            <Button key={name} $size="sm" $variant="outline" onClick={() => setPrompt(text)}>
                                {name}
                            </Button>
                        ))}
                    </div>
                </Panel>
                <Panel>
                    <h3>Models</h3>
                    <div className="models">
                        {all.map((m) => (
                            <label key={m.id}>
                                <input type="checkbox" checked={models.includes(m.id)} onChange={() => toggle(m.id)} />
                                {m.id.replace("@cf/", "")}
                                {m.note && <small>{m.note}</small>}
                                {custom.includes(m.id) && (
                                    <X size={12} aria-label={`Remove ${m.id}`} onClick={(e) => (e.preventDefault(), setCustom(custom.filter((c) => c !== m.id)), setModels(models.filter((x) => x !== m.id)))} />
                                )}
                            </label>
                        ))}
                    </div>
                    <form
                        className="add"
                        onSubmit={(e) => {
                            e.preventDefault();
                            const id = draft.trim();
                            if (!id || all.some((m) => m.id === id)) return;
                            setCustom([...custom, id]);
                            setModels([...models, id]);
                            setDraft("");
                        }}
                    >
                        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="@cf/author/model, or #low / #high on a reasoning one" aria-label="Another model" />
                        <Button type="submit" $variant="outline">
                            <Plus size={14} /> Add
                        </Button>
                    </form>
                </Panel>
            </Setup>
            <Note>Runs go to Cloudflare (or Claude) for real, a few cents at most, and don&apos;t count against anyone&apos;s prompts. Some models need the paid Workers plan.</Note>

            {run && (
                <>
                    <TableBox>
                        <table>
                            <thead>
                                <tr>
                                    <th>Model</th>
                                    <th>Time</th>
                                    <th>Steps</th>
                                    <th>Changes</th>
                                    <th>Failed steps</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {run.models.map((m) => {
                                    const r = results[m];
                                    return (
                                        <tr key={m} style={{ cursor: "default" }}>
                                            <td style={{ fontFamily: "ui-monospace, monospace" }}>{m}</td>
                                            <td>{r ? secs(r.ms) : "…"}</td>
                                            <td>{r?.steps ?? "…"}</td>
                                            <td>{r?.changes ?? "…"}</td>
                                            <td>{r ? r.failed : "…"}</td>
                                            <td>
                                                {!r ? <Badge>Working</Badge> : r.error ? <Badge $tone="red" title={r.error} style={{ whiteSpace: "normal" }}>{r.error}</Badge> : m === fastest ? <Badge $tone="green">Fastest</Badge> : <Badge $tone="accent">Done</Badge>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </TableBox>
                    <Lanes $cols={Math.min(3, run.models.length)}>
                        {run.models.map((m) => (
                            <iframe
                                key={`${run.id}:${m}`}
                                title={`Model lab: ${m}`}
                                src={`/lab/run?${new URLSearchParams({ model: m, prompt: run.prompt, run: `${run.id}:${m}` })}`}
                            />
                        ))}
                    </Lanes>
                </>
            )}

            {opened && (
                <div id="kept-run" style={{ marginTop: 20 }}>
                    <Header
                        title="Kept run"
                        actions={
                            <Button onClick={() => setOpened(null)}>
                                <X size={14} /> Close
                            </Button>
                        }
                    >
                        {opened.prompt}
                    </Header>
                    <Lanes $cols={Math.min(3, opened.results.length)}>
                        {opened.results.map((r) => (
                            <iframe key={`${opened.run}:${r.model}`} title={`Kept run: ${r.model}`} src={`/lab/run?${new URLSearchParams({ replay: opened.run, model: r.model })}`} />
                        ))}
                    </Lanes>
                </div>
            )}

            <Past>
                <h3>Past runs</h3>
                {kept.error && <Note>{kept.error}</Note>}
                {kept.data && !kept.data.runs.length && <Note>Runs are kept here once they finish.</Note>}
                {kept.data?.runs.map((r) => (
                    <article key={r.run}>
                        <header>
                            <p title={r.prompt}>{r.prompt}</p>
                            <small title={when(r.at)}>{ago(r.at)}</small>
                            <Button $size="sm" $variant="outline" title="Run these models on this prompt again" onClick={() => (setPrompt(r.prompt), setModels(r.results.map((x) => x.model)))}>
                                <ArrowCounterClockwise size={12} /> Use again
                            </Button>
                            <Confirm label="Delete" sure="Delete it" variant="danger" size="sm" onConfirm={() => void act(`/lab/runs/${r.run}`, "Run deleted", { method: "DELETE" }).then(kept.reload)} />
                        </header>
                        <div className="results">
                            {r.results.map((x) => (
                                <button key={x.model} type="button" className="result" title="Open this run" onClick={() => (setOpened(r), setTimeout(() => document.getElementById("kept-run")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50))}>
                                    {x.picture ? <img src={`/api/admin/lab/runs/${r.run}/picture?model=${encodeURIComponent(x.model)}`} alt="" loading="lazy" /> : <span className="blank" />}
                                    <div>
                                        <b title={x.model}>{x.model.replace("@cf/", "")}</b>
                                        {x.error ? (
                                            <span className="bad">{x.error}</span>
                                        ) : (
                                            <span>
                                                {secs(x.ms)} · {x.changes} changes{x.failed ? ` · ${x.failed} failed` : ""}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </article>
                ))}
            </Past>
        </>
    );
}
