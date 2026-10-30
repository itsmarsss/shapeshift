import { beforeAll, describe, expect, it } from "vitest";
import { DOMParser } from "linkedom";
import * as THREE from "three";
import { buildImport } from "./pipeline";
import { readSVG } from "./svg";
import { decodeMesh } from "../scene/meshCodec";

// A ring: the outer circle drawn clockwise and the hole counterclockwise, the
// way fonts draw the letter O.
const ring = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <path id="letter-o" fill="#2060ff" d="M50 10 A40 40 0 1 1 49.99 10 Z M50 30 A20 20 0 1 0 50.01 30 Z"/>
  <rect id="bar" x="0" y="95" width="100" height="5" fill="#ff0000"/>
  <path d="M0 0 L10 10" fill="none" stroke="#000"/>
</svg>`;

function hits(buffer: ArrayBuffer, origin: THREE.Vector3, direction: THREE.Vector3) {
    const m = decodeMesh(buffer);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(m.indices, 1));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    return new THREE.Raycaster(origin, direction).intersectObject(mesh).length;
}

describe("SVG", () => {
    beforeAll(() => {
        globalThis.DOMParser ??= DOMParser as unknown as typeof globalThis.DOMParser;
    });

    it("extrudes each filled shape into a solid and keeps holes open", async () => {
        const result = await buildImport(readSVG(ring, "logo"));
        expect(result.objects.map((o) => o.name)).toEqual(["letter-o", "bar"]);
        expect(result.objects.map((o) => o.material.color)).toEqual(["#2060ff", "#ff0000"]);
        const o = result.objects[0];
        const mesh = result.meshes.find((m) => m.hash === (o.geometry as { hash: string }).hash)!;
        // Straight through the hole hits nothing; through the ring hits front and back.
        const back = new THREE.Vector3(0, 0, -1);
        expect(hits(mesh.buffer, new THREE.Vector3(0, 0, 10), back)).toBe(0);
        const ringWidth = (o.geometry as { max: number[] }).max[0] * 0.8;
        expect(hits(mesh.buffer, new THREE.Vector3(ringWidth, 0, 10), back)).toBe(2);
    });

    it("stands upright at the right size", async () => {
        const result = await buildImport(readSVG(ring, "logo"));
        const o = result.objects[0];
        const g = o.geometry as { min: number[]; max: number[] };
        // 80 px across at 90 px per inch, in meters.
        expect(g.max[0] - g.min[0]).toBeCloseTo((80 / 90) * 0.0254, 3);
        expect(g.max[1] - g.min[1]).toBeCloseTo((80 / 90) * 0.0254, 3);
        expect(g.max[2] - g.min[2]).toBeLessThan(g.max[0] - g.min[0]);
    });

    it("explains an SVG with nothing filled", () => {
        expect(() => readSVG('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L5 5" stroke="#000" fill="none"/></svg>', "lines")).toThrow(/no filled shapes/);
    });
});
