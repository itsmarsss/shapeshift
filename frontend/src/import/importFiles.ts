import { useScene } from "../scene/store";
import { putMeshes, uploadMeshes } from "../scene/meshStore";
import { useCollab } from "../collab/session";
import { useUI } from "../ui/store";
import { frameScene } from "../viewport/frame";
import { baseName, formatOf } from "./formats";
import { buildImport } from "./pipeline";
import { readSVG } from "./svg";
import { ImportError, type ImportResult } from "./types";
import type { WorkerMessage, WorkerRequest } from "./worker";
import { useImport } from "./state";

const MAX_BYTES = 1_000_000_000;

const progress = (label: string, fraction?: number) => useImport.setState({ label, fraction: fraction ?? null });

function inWorker(files: File[]): Promise<ImportResult> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
            const msg = event.data;
            if (msg.type === "progress") return progress(msg.label, msg.fraction);
            worker.terminate();
            if (msg.type === "error") reject(new ImportError(msg.message));
            else resolve(msg);
        };
        worker.onerror = () => {
            worker.terminate();
            reject(new ImportError("That file couldn't be read. It may be damaged."));
        };
        void Promise.all(files.map(async (f) => ({ name: f.name, buffer: await f.arrayBuffer() }))).then((input) => {
            const request: WorkerRequest = { files: input };
            worker.postMessage(request, input.map((f) => f.buffer));
        }, reject);
    });
}

// Gives the model a name no other model in the scene has, since the part list
// groups by it.
function uniqueRoot(result: ImportResult) {
    const root = result.objects[0]?.path?.[0];
    if (!root) return;
    const taken = new Set(useScene.getState().doc.objects.map((o) => o.path?.[0]));
    if (!taken.has(root)) return;
    let n = 2;
    while (taken.has(`${root} ${n}`)) n++;
    for (const o of result.objects) if (o.path) o.path = [`${root} ${n}`, ...o.path.slice(1)];
}

export async function importFiles(list: File[] | FileList): Promise<boolean> {
    const files = [...list];
    const main = files.find((f) => formatOf(f.name));
    if (useImport.getState().busy) return false;
    if (!main) {
        useImport.setState({ error: "That file type isn't supported. Open a STEP, IGES, STL, OBJ, 3MF, glTF or SVG file.", file: files[0]?.name ?? null });
        return false;
    }
    useImport.setState({ busy: true, file: main.name, label: "Opening", fraction: null, error: null });
    const started = performance.now();
    try {
        if (main.size > MAX_BYTES) throw new ImportError("That file is too big to open in a browser.");
        let result: ImportResult;
        if (formatOf(main.name) === "svg") {
            result = await buildImport(readSVG(await main.text(), baseName(main.name)), progress);
            await putMeshes(result.meshes);
        } else {
            result = await inWorker(files);
            await putMeshes(result.meshes, true);
        }
        uniqueRoot(result);
        if (useCollab.getState().status === "live") {
            progress("Sharing with the room", 0);
            await uploadMeshes(
                result.meshes.map((m) => m.hash),
                (done, total) => progress("Sharing with the room", done / total)
            );
        }
        const [outcome] = useScene.getState().run({ type: "insert", objects: result.objects }, { select: false });
        if (outcome?.ok) frameScene(outcome.created);
        if (result.objects.length > 1) useUI.getState().setShowParts(true);
        console.info(`Imported ${main.name}: ${result.objects.length} parts, ${result.meshes.length} unique meshes, ${result.triangles} triangles in ${Math.round(performance.now() - started)} ms`);
        useImport.setState({ busy: false, file: null, label: "", fraction: null });
        return true;
    } catch (error) {
        const message = error instanceof ImportError ? error.message : error instanceof Error && error.message ? error.message : "That file couldn't be read.";
        if (!(error instanceof ImportError)) console.error(error);
        useImport.setState({ busy: false, error: message, label: "", fraction: null });
        return false;
    }
}
