import wasmUrl from "occt-import-js/dist/occt-import-js.wasm?url";
import { storeMesh } from "../scene/meshDb";
import type { Occt } from "./occt";
import { buildImport } from "./pipeline";
import { readModel, type InputFile } from "./read";
import { ImportError, type ImportResult } from "./types";

export type WorkerRequest = { files: InputFile[] };
export type WorkerMessage =
    | { type: "progress"; label: string; fraction?: number }
    | ({ type: "done" } & ImportResult)
    | { type: "error"; message: string };

const post = (msg: WorkerMessage, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);
const progress = (label: string, fraction?: number) => post({ type: "progress", label, fraction });

async function loadOcct(): Promise<Occt> {
    const { default: factory } = await import("occt-import-js");
    return factory({ locateFile: () => wasmUrl });
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    try {
        const model = await readModel(event.data.files, loadOcct, progress);
        const result = await buildImport(model, progress);
        progress("Saving meshes", 1);
        await Promise.all(result.meshes.map((m) => storeMesh(m.hash, m.buffer)));
        post({ type: "done", ...result }, result.meshes.map((m) => m.buffer));
    } catch (error) {
        const message =
            error instanceof ImportError
                ? error.message
                : error instanceof RangeError || /memory/i.test(String(error))
                  ? "That file is too big to open in this browser."
                  : "That file couldn't be read. It may be damaged.";
        if (!(error instanceof ImportError)) console.error(error);
        post({ type: "error", message });
    }
};
