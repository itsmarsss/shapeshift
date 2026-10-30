import { beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { PRIMITIVES, type Geometry } from "@shapeshift/shared/scene/schema";
import { DEFAULT_GEOMETRY } from "./commands";
import { boundsIn, buildGeometry, localBounds } from "./geometry";
import { emptyDoc, useScene } from "./store";

const s = () => useScene.getState();

beforeEach(() => s().load(emptyDoc()));

function signedVolume(geometry: THREE.BufferGeometry) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = g.getAttribute("position");
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    let volume = 0;
    for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i);
        b.fromBufferAttribute(p, i + 1);
        c.fromBufferAttribute(p, i + 2);
        volume += a.dot(b.cross(c)) / 6;
    }
    return volume;
}

const SOLIDS = PRIMITIVES.filter((p) => p !== "plane" && p !== "torus");

describe("shapes", () => {
    it.each(SOLIDS)("builds a closed, outward-facing %s centered on its origin", (primitive) => {
        const geometry = buildGeometry(DEFAULT_GEOMETRY[primitive]);
        expect(geometry.getAttribute("position").count).toBeGreaterThan(0);
        expect(geometry.getAttribute("normal")).toBeDefined();
        expect(signedVolume(geometry)).toBeGreaterThan(0);
        const center = localBounds(DEFAULT_GEOMETRY[primitive]).getCenter(new THREE.Vector3());
        expect(Math.abs(center.y)).toBeLessThan(1e-6);
        if (primitive !== "star") expect(center.length()).toBeLessThan(1e-6);
    });

    it("has the expected volume for shapes with a closed form", () => {
        const volume = (g: Geometry) => signedVolume(buildGeometry(g));
        expect(volume({ type: "wedge", width: 2, height: 1, depth: 1 })).toBeCloseTo(1, 5);
        expect(volume({ type: "roof", width: 2, height: 1, depth: 1 })).toBeCloseTo(1, 5);
        expect(volume({ type: "pyramid", width: 1, height: 3, depth: 1 })).toBeCloseTo(1, 5);
        expect(volume({ type: "halfSphere", radius: 1 })).toBeCloseTo((2 / 3) * Math.PI, 1);
        expect(volume({ type: "tube", radius: 1, thickness: 0.5, height: 1 })).toBeCloseTo(Math.PI * 0.75, 1);
        expect(volume({ type: "paraboloid", radius: 1, height: 2 })).toBeCloseTo(Math.PI, 1);
    });

    it("sizes polygons, stars and text from their parameters", () => {
        const hex = localBounds({ type: "polygon", radius: 1, sides: 6, height: 2 });
        expect(hex.max.y - hex.min.y).toBeCloseTo(2);
        const star = localBounds({ type: "star", radius: 1, innerRadius: 0.4, points: 5, height: 0.3 });
        expect(star.max.y - star.min.y).toBeCloseTo(0.3);
        expect(star.min.z).toBeCloseTo(-1);
        const short = localBounds({ type: "text", text: "Hi", size: 1, height: 0.2 });
        const long = localBounds({ type: "text", text: "Hello there", size: 1, height: 0.2 });
        expect(short.max.y - short.min.y).toBeCloseTo(0.2);
        expect(long.max.x - long.min.x).toBeGreaterThan((short.max.x - short.min.x) * 3);
    });

    it.each(SOLIDS)("adds a %s resting on the ground", (primitive) => {
        s().run({ type: "add", primitive });
        const o = s().doc.objects[0];
        expect(boundsIn([o]).min.y).toBeCloseTo(0, 5);
    });

    it("edits shape parameters through the geometry command and undoes them", () => {
        s().run({ type: "add", primitive: "text" });
        const id = s().doc.objects[0].id;
        s().run({ type: "geometry", target: id, geometry: { type: "text", text: "Hello", size: 0.5, height: 0.1 } });
        expect(s().doc.objects[0].geometry).toMatchObject({ text: "Hello" });
        s().undo();
        expect(s().doc.objects[0].geometry).toMatchObject({ text: "Text" });
    });
});
