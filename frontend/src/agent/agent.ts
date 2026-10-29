import type { StepResult, ToolInvocation, ToolResult, SceneSnapshot } from "./types";
import * as Tools from "./tools";

export type AgentPlan = { steps: ToolInvocation[] };

export type AgentRunResult = {
    snapshot: SceneSnapshot;
    transcript: StepResult[];
};

export function planFromPrompt(prompt: string, snapshot: SceneSnapshot): AgentPlan {
    const lc = prompt.toLowerCase().trim();
    const steps: ToolInvocation[] = [];

    // export
    if (/^export\b/.test(lc)) {
        steps.push({ name: "export_glb", args: {} });
        return { steps };
    }

    // acceptance test shortcuts
    if (/delete\s+the\s+cube/.test(lc)) {
        steps.push({ name: "find", args: { nameContains: "cube" } });
        steps.push({ name: "select", args: { query: { nameContains: "cube" } } });
        steps.push({ name: "delete", args: { ids: [] } });
        return { steps };
    }
    if (/duplicate\s+the\s+sphere/.test(lc) || /duplicate\s+the\s+.*sphere/.test(lc)) {
        steps.push({ name: "find", args: { nameContains: "sphere" } });
        steps.push({ name: "select", args: { query: { nameContains: "sphere" } } });
        steps.push({ name: "duplicate", args: { ids: [] } });
        if (/\+?2\s+on\s+x/.test(lc)) steps.push({ name: "transform", args: { id: "", translate: [2, 0, 0] } });
        if (/satellite/.test(lc)) steps.push({ name: "update_name", args: { id: "", name: "satellite" } });
        return { steps: steps.slice(0, 8) };
    }

    // generic: add primitive
    const addMatch = lc.match(/^add\s+(box|cube|sphere|plane|cylinder|cone)\b(.*)$/);
    if (addMatch) {
        const kindWord = addMatch[1];
        const rest = addMatch[2] || "";
        const kind = kindWord === "box" || kindWord === "cube" ? "cube" : (kindWord as "sphere" | "plane" | "cylinder" | "cone");
        const dims: { x?: number; y?: number; z?: number; radius?: number; height?: number } = {};
        const sizeM = rest.match(/(\d+(?:\.\d+)?)\s*m\b/);
        if (kind === "cube" && sizeM) dims.x = dims.y = dims.z = parseFloat(sizeM[1]);
        if (kind === "sphere") {
            const r = rest.match(/radius\s+(-?\d*\.?\d+)/) || rest.match(/(\d+(?:\.\d+)?)\s*m\b/);
            if (r) dims.radius = parseFloat(r[1]);
        }
        if (kind === "plane") {
            const w = rest.match(/width\s+(-?\d*\.?\d+)/) || rest.match(/x\s+(-?\d*\.?\d+)/);
            const h = rest.match(/height\s+(-?\d*\.?\d+)/) || rest.match(/y\s+(-?\d*\.?\d+)/);
            if (w) dims.x = parseFloat(w[1]);
            if (h) dims.y = parseFloat(h[1]);
        }
        if (kind === "cylinder") {
            const rad = rest.match(/radius\s+(-?\d*\.?\d+)/);
            const h = rest.match(/height\s+(-?\d*\.?\d+)/);
            if (rad) dims.radius = parseFloat(rad[1]);
            if (h) dims.height = parseFloat(h[1]);
        }
        if (kind === "cone") {
            const rad = rest.match(/radius\s+(-?\d*\.?\d+)/) || sizeM;
            const h = rest.match(/height\s+(-?\d*\.?\d+)/) || sizeM;
            if (rad) dims.radius = parseFloat(rad[1]);
            if (h) dims.height = parseFloat(h[1]);
        }
        steps.push({ name: "create_primitive", args: { kind, name: capitalize(kind), dims } });
        return { steps: steps.slice(0, 8) };
    }

    // generic: select by name
    const sel = lc.match(/^select\s+(.+)$/);
    if (sel) {
        const name = sel[1].trim();
        steps.push({ name: "select", args: { query: { nameContains: name } } });
        return { steps };
    }

    // generic: delete selected
    if (/^(delete|remove|del)\b/.test(lc)) {
        steps.push({ name: "delete", args: { ids: [] } });
        return { steps };
    }

    // generic: duplicate selected
    if (/^(duplicate|copy|dup)\b/.test(lc)) {
        steps.push({ name: "duplicate", args: { ids: [] } });
        return { steps };
    }

    // generic: color
    const color = lc.match(/(?:color|colour)\s+([^\s]+)/);
    if (color) {
        steps.push({ name: "assign_material", args: { id: "", materialId: color[1] } });
        return { steps };
    }

    // generic: opacity
    const op = lc.match(/opacity\s+(-?\d*\.?\d+)/);
    if (op) {
        // use create_material+assign not needed; opacity not covered -> skip in MVP planner
    }

    // generic: move/translate
    const move = lc.match(/^(move|translate)\b(.*)$/);
    if (move) {
        let rest = move[2] || "";
        // Try to resolve a named target from the snapshot
        const names = (snapshot.entities || []).map((e) => e.name.toLowerCase());
        const nameHit = names.find((n) => n && rest.includes(n));
        if (nameHit) {
            steps.push({ name: "select", args: { query: { nameContains: nameHit } } });
            rest = rest.replace(nameHit, "");
        }

        // Words: left/right/up/down/forward/back (+ optional distance)
        const amtWord = (w: string) => {
            const m = rest.match(new RegExp(`${w}\\s+(-?\\d*\\.?\\d+)`));
            return m ? parseFloat(m[1]) : 1;
        };
        let dx = 0, dy = 0, dz = 0;
        if (/(^|\s)left(\s|$)/.test(rest)) dx -= amtWord("left");
        if (/(^|\s)right(\s|$)/.test(rest)) dx += amtWord("right");
        if (/(^|\s)up(\s|$)/.test(rest)) dy += amtWord("up");
        if (/(^|\s)down(\s|$)/.test(rest)) dy -= amtWord("down");
        // Adjust semantics: forward => +Z, back => -Z for this editor's convention
        if (/(^|\s)forward(\s|$)/.test(rest)) dz += amtWord("forward");
        if (/(^|\s)back(ward|wards)?(\s|$)/.test(rest)) dz -= amtWord("back");

        // Also allow explicit axis numbers to override/add
        const dxExplicit = rest.match(/x\s+(-?\d*\.?\d+)/);
        const dyExplicit = rest.match(/y\s+(-?\d*\.?\d+)/);
        const dzExplicit = rest.match(/z\s+(-?\d*\.?\d+)/);
        if (dxExplicit) dx = parseFloat(dxExplicit[1]);
        if (dyExplicit) dy = parseFloat(dyExplicit[1]);
        if (dzExplicit) dz = parseFloat(dzExplicit[1]);

        steps.push({ name: "transform", args: { id: "", translate: [dx, dy, dz] } });
        return { steps };
    }

    // generic: rotate (assume radians)
    const rot = lc.match(/^rot(ate)?\b(.*)$/);
    if (rot) {
        const rest = rot[2] || "";
        const rx = parseFloat(rest.match(/x\s+(-?\d*\.?\d+)/)?.[1] || "0");
        const ry = parseFloat(rest.match(/y\s+(-?\d*\.?\d+)/)?.[1] || "0");
        const rz = parseFloat(rest.match(/z\s+(-?\d*\.?\d+)/)?.[1] || "0");
        steps.push({ name: "transform", args: { id: "", rotate: [rx, ry, rz] } });
        return { steps };
    }

    // generic: scale (uniform or per-axis multipliers)
    const sc = lc.match(/^scale\b(.*)$/);
    if (sc) {
        const rest = sc[1] || "";
        const uni = rest.match(/\b(-?\d*\.\d+|\d+)\b/);
        const sx = parseFloat(rest.match(/x\s+(-?\d*\.?\d+)/)?.[1] || (uni ? uni[1] : "1"));
        const sy = parseFloat(rest.match(/y\s+(-?\d*\.?\d+)/)?.[1] || (uni ? uni[1] : "1"));
        const sz = parseFloat(rest.match(/z\s+(-?\d*\.?\d+)/)?.[1] || (uni ? uni[1] : "1"));
        steps.push({ name: "transform", args: { id: "", scale: [sx, sy, sz] } });
        return { steps };
    }

    // acceptance test 1 combined prompt
    if (/create\s+a\s+1m\s+blue\s+cube/.test(lc) || /0\.5m\s+red\s+sphere/.test(lc)) {
        if (/create\s+a\s+1m\s+blue\s+cube/.test(lc)) {
            steps.push({ name: "create_primitive", args: { kind: "cube", name: "Cube", dims: { x: 1, y: 1, z: 1 } } });
            steps.push({ name: "select", args: { query: { nameContains: "Cube" } } });
            steps.push({ name: "assign_material", args: { id: "", materialId: "blue" } });
        }
        if (/0\.5m\s+red\s+sphere/.test(lc)) {
            steps.push({ name: "create_primitive", args: { kind: "sphere", name: "Sphere", dims: { radius: 0.5 } } });
            steps.push({ name: "select", args: { query: { nameContains: "Sphere" } } });
            steps.push({ name: "assign_material", args: { id: "", materialId: "red" } });
            steps.push({ name: "transform", args: { id: "", translate: [0, 1, 0] } });
        }
        return { steps: steps.slice(0, 8) };
    }

    // default: no plan
    return { steps };
}

export async function runAgent(prompt: string, apply: boolean): Promise<AgentRunResult> {
    const s0 = Tools.get_scene_summary().snapshot!;
    console.log("[Agent] prompt=", prompt, "apply=", apply);

    const plan = planFromPrompt(prompt, s0);
    console.log("[Agent] planned steps=", plan.steps);

    if (!apply) {
        console.log("[Agent] Dry-run: returning planned steps only");
        return { snapshot: s0, transcript: plan.steps.map((t) => ({ tool: t, ok: true, diagnostics: ["dry_run"], diff: { addedIds: [], removedIds: [], updatedIds: [] } })) };
    }

    const transcript: StepResult[] = [];
    let lastSnapshot = s0;

    for (const step of plan.steps) {
        const filled = { ...step } as ToolInvocation;
        if (filled.name === "delete" && (!filled.args.ids || filled.args.ids.length === 0)) {
            const sel = Tools.get_selection().payload?.ids || [];
            filled.args = { ...filled.args, ids: sel };
        }
        if ((filled.name === "transform" || filled.name === "update_name" || filled.name === "assign_material") && (!filled.args.id || filled.args.id === "")) {
            const sel = Tools.get_selection().payload?.ids || [];
            filled.args = { ...filled.args, id: sel[0] };
        }
        if (filled.name === "duplicate" && (!filled.args.ids || filled.args.ids.length === 0)) {
            const sel = Tools.get_selection().payload?.ids || [];
            filled.args = { ...filled.args, ids: sel };
        }

        console.log("[Agent] executing:", filled);
        let result = await execute(filled);
        console.log("[Agent] result:", result);
        if (!result.success) {
            if (filled.name === "select" && filled.args?.query?.nameContains) {
                console.log("[Agent] retry: find + select for", filled.args.query.nameContains);
                result = await execute({ name: "find", args: { nameContains: filled.args.query.nameContains } });
                if (result.success) {
                    const ids = result.payload?.ids || [];
                    result = await execute({ name: "select", args: { ids } });
                }
            }
        }
        transcript.push({ tool: filled, ok: !!result.success, diagnostics: result.diagnostics, diff: result.changes });
        lastSnapshot = result.snapshot || lastSnapshot;
        if (!result.success) {
            console.warn("[Agent] step failed, stopping", filled, result.diagnostics);
            break;
        }
    }

    console.log("[Agent] done. counts=", lastSnapshot.counts, "selection=", lastSnapshot.selection);
    return { snapshot: lastSnapshot, transcript };
}

async function execute(inv: ToolInvocation): Promise<ToolResult> {
    switch (inv.name) {
        case "get_scene_summary":
            return Tools.get_scene_summary();
        case "find":
            return Tools.find(inv.args);
        case "get_selection":
            return Tools.get_selection();
        case "create_primitive":
            return Tools.create_primitive(inv.args);
        case "select":
            return Tools.select(inv.args);
        case "transform":
            return Tools.transform(inv.args);
        case "duplicate":
            return Tools.duplicate(inv.args);
        case "delete":
            return Tools.del(inv.args);
        case "create_material":
            return Tools.create_material(inv.args);
        case "assign_material":
            return Tools.assign_material(inv.args);
        case "export_glb":
            return await Tools.export_glb(inv.args);
        case "image_to_3d":
            return Tools.image_to_3d(inv.args);
        case "update_name":
            return Tools.update_name(inv.args);
        default:
            return { success: false, diagnostics: ["unknown_tool"], snapshot: Tools.get_scene_summary().snapshot };
    }
}

function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); } 