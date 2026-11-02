import * as THREE from "three";
import { RoundedBoxGeometry } from "three-stdlib";
import type { SceneObject } from "@shapeshift/shared/scene/schema";
import { buildGeometry } from "../scene/geometry";

// The landing page's look: soft-edged, matte "clay" shapes under studio light,
// so scenes built from basic shapes look finished rather than like a sketch.

// Boxes get rounded edges; everything else keeps its own shape.
export function clayGeometry(o: SceneObject): THREE.BufferGeometry {
    const g = o.geometry;
    if (g.type === "box") {
        // Just enough to catch the light; big boxes shouldn't look puffy.
        const radius = Math.min(0.05, Math.min(g.width, g.height, g.depth) * 0.12);
        return new RoundedBoxGeometry(g.width, g.height, g.depth, 3, radius);
    }
    return buildGeometry(g);
}

export function clayMaterial(o: SceneObject): THREE.MeshStandardMaterial {
    const m = o.material;
    const metal = m.metalness > 0.5;
    return new THREE.MeshStandardMaterial({
        color: m.color,
        // Matte unless it's meant to shine.
        roughness: metal ? m.roughness : Math.max(0.55, m.roughness),
        metalness: m.metalness,
        emissive: m.emissive ?? "#000000",
        emissiveIntensity: m.emissiveIntensity ?? 0,
        opacity: m.opacity,
        transparent: m.opacity < 1,
    });
}
