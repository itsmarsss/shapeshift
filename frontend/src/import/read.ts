import { baseName, extension, formatOf } from "./formats";
import { readGLTF, readOBJ, readSTL } from "./mesh";
import type { Occt } from "./occt";
import { readCad } from "./occt";
import { read3MF } from "./threemf";
import { ImportError, type Progress, type RawModel } from "./types";

export type InputFile = { name: string; buffer: ArrayBuffer };

// Reads the model among `files`. The others are files it refers to, such as
// an OBJ's materials or a glTF's buffers.
export async function readModel(files: InputFile[], loadOcct: () => Promise<Occt>, progress: Progress): Promise<RawModel> {
    const main = files.find((f) => formatOf(f.name) && formatOf(f.name) !== "svg");
    if (!main) throw new ImportError("That file type isn't supported.");
    const format = formatOf(main.name)!;
    const name = baseName(main.name);
    const text = () => new TextDecoder().decode(main.buffer);
    switch (format) {
        case "step":
        case "iges": {
            progress("Loading the CAD reader");
            const occt = await loadOcct();
            progress(`Reading ${format === "step" ? "STEP" : "IGES"} file`);
            return readCad(occt, format, new Uint8Array(main.buffer), name);
        }
        case "stl":
            progress("Reading STL file");
            return readSTL(main.buffer, name);
        case "obj": {
            progress("Reading OBJ file");
            const mtl = files.find((f) => extension(f.name) === "mtl");
            return readOBJ(text(), name, mtl ? new TextDecoder().decode(mtl.buffer) : undefined);
        }
        case "3mf":
            progress("Reading 3MF file");
            return read3MF(main.buffer, name);
        case "gltf":
            progress("Reading glTF file");
            return readGLTF(main.buffer, name, new Map(files.filter((f) => f !== main).map((f) => [f.name, f.buffer])));
        default:
            throw new ImportError("That file type isn't supported.");
    }
}
