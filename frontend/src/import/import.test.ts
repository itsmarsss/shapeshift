import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { zipSync, strToU8 } from "three/examples/jsm/libs/fflate.module.js";
import factory from "occt-import-js";
import type { SceneObject } from "@shapeshift/shared/scene/schema";
import { worldBounds } from "../assistant/assistant";
import { decodeMesh } from "../scene/meshCodec";
import { buildImport, rigidMatch } from "./pipeline";
import { readCad, isYUp, type Occt } from "./occt";
import { readOBJ, readSTL } from "./mesh";
import { read3MF } from "./threemf";
import { formatOf } from "./formats";
import type { ImportResult } from "./types";

import as1 from "./fixtures/as1.stp?raw";
import cubeMM from "./fixtures/cube-mm.step?raw";
import cubeIn from "./fixtures/cube-in.step?raw";
import cubeIgs from "./fixtures/cube.igs?raw";

// STEP and IGES are text, so the fixtures load as strings.
const FIXTURES: Record<string, string> = { "as1.stp": as1, "cube-mm.step": cubeMM, "cube-in.step": cubeIn, "cube.igs": cubeIgs };
const fixture = (name: string) => new TextEncoder().encode(FIXTURES[name]);

let occt: Promise<Occt> | null = null;
const loadOcct = () => (occt ??= factory());

function bounds(objects: SceneObject[]) {
    const box = new THREE.Box3();
    for (const o of objects) {
        const b = worldBounds(o);
        box.expandByPoint(new THREE.Vector3(...b.min)).expandByPoint(new THREE.Vector3(...b.max));
    }
    return box;
}

const size = (r: ImportResult) => bounds(r.objects).getSize(new THREE.Vector3());

function expectOnFloor(r: ImportResult) {
    const box = bounds(r.objects);
    expect(box.min.y).toBeCloseTo(0, 5);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 5);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(0, 5);
}

function stl(width: number, height: number, depth: number, binary: boolean) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth));
    const out = new STLExporter().parse(mesh, { binary });
    return typeof out === "string" ? new TextEncoder().encode(out).buffer : (out.buffer as ArrayBuffer);
}

describe("formats", () => {
    it("knows each file type by its extension", () => {
        expect(formatOf("Bracket.STEP")).toBe("step");
        expect(formatOf("a.stp")).toBe("step");
        expect(formatOf("a.igs")).toBe("iges");
        expect(formatOf("a.3mf")).toBe("3mf");
        expect(formatOf("a.glb")).toBe("gltf");
        expect(formatOf("notes.txt")).toBeNull();
    });
});

describe("STEP and IGES", () => {
    it("keeps the assembly tree and part names, and shares repeated parts", async () => {
        const model = await readCad(await loadOcct(), "step", fixture("as1.stp"), "as1");
        const result = await buildImport(model);
        expect(result.objects.map((o) => o.name)).toContain("PLATE");
        expect(result.objects.every((o) => o.path?.[0] === "as1")).toBe(true);
        expect(new Set(result.objects.map((o) => o.path?.[1]))).toEqual(new Set([undefined, "L_BRACKET_ASSEMBLY_ASM", "ROD_ASM"]));
        // The two bracket assemblies are the same parts placed twice, and each has repeated nuts and bolts.
        expect(result.objects).toHaveLength(18);
        expect(result.meshes.length).toBeLessThanOrEqual(7);
        expectOnFloor(result);
    }, 60_000);

    it("reads the file's units", async () => {
        // The same 1 m cube, saved in millimeters and in inches.
        const mm = await buildImport(await readCad(await loadOcct(), "step", fixture("cube-mm.step"), "mm"));
        const inch = await buildImport(await readCad(await loadOcct(), "step", fixture("cube-in.step"), "in"));
        const igs = await buildImport(await readCad(await loadOcct(), "iges", fixture("cube.igs"), "igs"));
        expect(size(mm).x).toBeCloseTo(1, 5);
        expect(size(inch).x).toBeCloseTo(1, 5);
        expect(size(igs).x).toBeCloseTo(0.01, 5);
    }, 60_000);

    it("picks the up axis from the tool that wrote the file", () => {
        expect(isYUp("FILE_NAME('a','2014',(''),(''),'SwSTEP 2.0','SolidWorks 2013','');")).toBe(true);
        expect(isYUp("FILE_NAME('a','2020',(''),(''),'Open CASCADE','FreeCAD','');")).toBe(false);
    });

    it("explains a file it can't read", async () => {
        const bad = new TextEncoder().encode("ISO-10303-21;\nnot really a step file");
        await expect(readCad(await loadOcct(), "step", bad, "bad").then(buildImport)).rejects.toThrow();
    }, 60_000);
});

describe("STL", () => {
    it("reads binary and text files in millimeters with Z up", async () => {
        for (const binary of [true, false]) {
            const result = await buildImport(readSTL(stl(10, 20, 30, binary), "box"));
            const s = size(result);
            expect(s.x).toBeCloseTo(0.01, 6);
            expect(s.y).toBeCloseTo(0.03, 6);
            expect(s.z).toBeCloseTo(0.02, 6);
            expectOnFloor(result);
            const mesh = decodeMesh(result.meshes[0].buffer);
            // Shared corners are stored once, while the sharp edges keep their own normals.
            expect(mesh.positions.length / 3).toBe(24);
            expect(mesh.indices.length).toBe(36);
        }
    });

    it("rejects an empty file", () => {
        expect(() => readSTL(new ArrayBuffer(84), "empty")).toThrow(/no triangles/);
    });
});

describe("OBJ", () => {
    const obj = ["mtllib parts.mtl", "o Left", "usemtl red", "v 0 0 0", "v 10 0 0", "v 0 10 0", "f 1 2 3", "o Right", "usemtl blue", "v 20 0 0", "v 30 0 0", "v 20 10 0", "f 4 5 6"].join("\n");
    const mtl = ["newmtl red", "Kd 1 0 0", "newmtl blue", "Kd 0 0 1"].join("\n");

    it("keeps object names and material colors", async () => {
        const result = await buildImport(readOBJ(obj, "parts", mtl));
        expect(result.objects.map((o) => o.name)).toEqual(["Left", "Right"]);
        expect(result.objects.map((o) => o.material.color)).toEqual(["#ff0000", "#0000ff"]);
        expect(size(result).x).toBeCloseTo(0.03, 6);
    });

    it("uses the default color without materials", async () => {
        const result = await buildImport(readOBJ(obj, "parts"));
        expect(result.objects[0].material.color).toBe("#c7ccd4");
    });
});

describe("3MF", () => {
    const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="centimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <basematerials id="1"><base name="Orange" displaycolor="#FF8000FF"/></basematerials>
    <object id="2" type="model" name="Peg" pid="1" pindex="0">
      <mesh>
        <vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/><vertex x="0" y="0" z="2"/></vertices>
        <triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="1" v2="2" v3="3"/><triangle v1="2" v2="0" v3="3"/></triangles>
      </mesh>
    </object>
    <object id="3" type="model" name="Pegs"><components>
      <component objectid="2"/>
      <component objectid="2" transform="1 0 0 0 1 0 0 0 1 5 0 0"/>
    </components></object>
  </resources>
  <build><item objectid="3"/></build>
</model>`;
    const file = zipSync({ "3D/3dmodel.model": strToU8(model), "_rels/.rels": strToU8('<Relationships><Relationship Target="/3D/3dmodel.model" Id="r0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>') });

    it("reads units, colors, names and components that reuse a mesh", async () => {
        const result = await buildImport(read3MF(file.buffer as ArrayBuffer, "pegs"));
        expect(result.objects).toHaveLength(2);
        expect(result.meshes).toHaveLength(1);
        expect(result.objects.map((o) => o.name)).toEqual(["Peg", "Peg"]);
        expect(result.objects[0].path).toEqual(["pegs", "Pegs"]);
        expect(result.objects[0].material.color).toBe("#ff8000");
        // 6 cm wide, 2 cm tall once Z becomes Y.
        expect(size(result).x).toBeCloseTo(0.06, 6);
        expect(size(result).y).toBeCloseTo(0.02, 6);
    });

    it("rejects a file that isn't a zip", () => {
        expect(() => read3MF(new TextEncoder().encode("nope").buffer, "bad")).toThrow(/couldn't be opened/);
    });
});

describe("repeated parts", () => {
    it("finds a part that was turned and moved", () => {
        const geometry = new THREE.TorusKnotGeometry(1, 0.3, 32, 8);
        const a = geometry.getAttribute("position").array as Float32Array;
        const turn = new THREE.Matrix4().compose(new THREE.Vector3(5, -2, 3), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 1.2, -0.7)), new THREE.Vector3(1, 1, 1));
        const b = a.slice();
        const v = new THREE.Vector3();
        for (let i = 0; i < b.length; i += 3) {
            v.set(b[i], b[i + 1], b[i + 2]).applyMatrix4(turn);
            b.set([v.x, v.y, v.z], i);
        }
        const match = rigidMatch(a, b)!;
        expect(match).not.toBeNull();
        expect(v.set(1, 2, 3).applyMatrix4(match).distanceTo(new THREE.Vector3(1, 2, 3).applyMatrix4(turn))).toBeLessThan(1e-4);
        b[30] += 0.5;
        expect(rigidMatch(a, b)).toBeNull();
    });

    it("doesn't treat a mirrored part as a copy", () => {
        const a = new THREE.TorusKnotGeometry(1, 0.3, 32, 8).getAttribute("position").array as Float32Array;
        const b = a.slice();
        for (let i = 0; i < b.length; i += 3) b[i] = -b[i];
        expect(rigidMatch(a, b)).toBeNull();
    });
});
