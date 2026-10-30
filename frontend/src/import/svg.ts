import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { partFromGeometry } from "./mesh";
import type { RGB, RawModel, RawPart } from "./types";
import { ImportError } from "./types";

// SVGLoader works in pixels at 90 per inch.
const PX = 25.4 / 90 / 1000;

// Each filled shape becomes a solid, standing up and extruded a little. Holes,
// like the middle of an "O", stay open.
export function readSVG(text: string, name: string): RawModel {
    let data;
    try {
        data = new SVGLoader().parse(text);
    } catch {
        throw new ImportError("That SVG file couldn't be read.");
    }
    const filled = data.paths
        .map((path, i) => ({ path, i, shapes: path.userData?.style?.fill && path.userData.style.fill !== "none" ? SVGLoader.createShapes(path) : [] }))
        .filter((p) => p.shapes.length);
    if (!filled.length) throw new ImportError("That SVG has no filled shapes to turn into solids.");

    const bounds = new THREE.Box2();
    for (const { shapes } of filled) for (const shape of shapes) for (const p of shape.getPoints()) bounds.expandByPoint(p);
    const size = bounds.getSize(new THREE.Vector2());
    const depth = Math.max(Math.min(size.x, size.y) * 0.08, Math.max(size.x, size.y) * 0.02) || 1;

    const parts: RawPart[] = filled.map(({ path, i, shapes }) => {
        const geometry = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 16 });
        // SVG's Y axis points down. Turning it over keeps the faces outward.
        geometry.rotateX(Math.PI);
        const color = path.color.toArray() as RGB;
        const node = path.userData?.node as Element | undefined;
        const label = node?.getAttribute("id") || node?.getAttribute("inkscape:label") || `Shape ${i + 1}`;
        return partFromGeometry(geometry, label, [], [color]);
    });
    return { name, parts, unitScale: PX, zUp: false };
}
