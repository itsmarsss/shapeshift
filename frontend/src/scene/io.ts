import * as THREE from "three";
import { boundsIn, flipWinding, toMeshGeometry } from "./geometry";
import { holeGroups, solidMeshes } from "./holes";
import { loadCsg } from "./csg";
import { animationClip } from "./clip";
import { DEFAULT_MATERIAL } from "./commands";
import { SceneDoc, type SceneObject } from "@shapeshift/shared/scene/schema";
import { track } from "../telemetry";

export function download(data: BlobPart, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function saveSceneFile(doc: SceneDoc) {
    download(JSON.stringify(doc, null, 2), "scene.shapeshift.json", "application/json");
}

export function parseSceneFile(text: string): SceneDoc | null {
    try {
        const parsed = SceneDoc.safeParse(JSON.parse(text));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

export function toThreeScene(doc: SceneDoc): THREE.Scene {
    const scene = new THREE.Scene();
    for (const { object: o, geometry } of solidMeshes(doc.objects)) {
        const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshPhysicalMaterial({
                color: o.material.color,
                metalness: o.material.metalness,
                roughness: o.material.roughness,
                opacity: o.material.opacity,
                transparent: o.material.opacity < 1,
                emissive: o.material.emissive ?? o.material.color,
                emissiveIntensity: o.material.emissiveIntensity ?? 0,
                transmission: o.material.transmission ?? 0,
            })
        );
        mesh.name = o.name;
        mesh.position.set(...o.position);
        mesh.rotation.set(...o.rotation);
        mesh.scale.set(...o.scale);
        scene.add(mesh);
    }
    for (const l of doc.lights) {
        const light =
            l.type === "point"
                ? new THREE.PointLight(l.color, l.intensity, l.distance)
                : l.type === "spot"
                  ? new THREE.SpotLight(l.color, l.intensity, l.distance, l.angle, 0.35)
                  : new THREE.DirectionalLight(l.color, l.intensity);
        light.name = l.name;
        light.position.set(...l.position);
        if (light instanceof THREE.SpotLight || light instanceof THREE.DirectionalLight) {
            // glTF lights shine down their local -Z axis, so point that at the aim.
            light.lookAt(new THREE.Vector3(...l.aim));
            light.target.position.set(...l.aim);
            scene.add(light.target);
        }
        scene.add(light);
    }
    return scene;
}

export async function exportGLB(doc: SceneDoc) {
    if (holeGroups(doc.objects).size) await loadCsg();
    track("export", "glb");
    const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
    const clip = animationClip(doc);
    const result = await new GLTFExporter().parseAsync(toThreeScene(doc), { binary: true, ...(clip ? { animations: [clip] } : {}) });
    download(result as ArrayBuffer, "scene.glb", "model/gltf-binary");
}

export async function importModel(file: File): Promise<SceneObject[]> {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const gltf = await new GLTFLoader().parseAsync(await file.arrayBuffer(), "");
    gltf.scene.updateMatrixWorld(true);
    const objects: SceneObject[] = [];
    gltf.scene.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        node.matrixWorld.decompose(position, quaternion, scale);
        const rotation = new THREE.Euler().setFromQuaternion(quaternion);
        const material = Array.isArray(node.material) ? node.material[0] : node.material;
        const color = material && "color" in material ? `#${(material.color as THREE.Color).getHexString()}` : DEFAULT_MATERIAL.color;
        objects.push({
            id: "",
            name: node.name || file.name.replace(/\.[^.]+$/, ""),
            geometry: toMeshGeometry(node.geometry),
            position: position.toArray(),
            rotation: [rotation.x, rotation.y, rotation.z],
            scale: scale.toArray(),
            material: { ...DEFAULT_MATERIAL, color },
        });
    });
    return objects;
}

export type PrintOptions = {
    // Length of the longest side of the print, in millimetres.
    size: number;
    // Only these objects, or everything when empty.
    ids?: string[];
};

// Objects to print with their real-world size in scene units (metres). Holes
// aren't printed.
export function printableBounds(doc: SceneDoc, ids: string[] = []) {
    const objects = (ids.length ? doc.objects.filter((o) => ids.includes(o.id)) : doc.objects).filter((o) => !o.hole);
    return { objects, box: boundsIn(objects) };
}

// Builds a binary STL scaled to the requested size. Slicers expect Z up and
// millimetres, and the model resting on the bed, so it's turned and moved to fit.
export async function stlBuffer(doc: SceneDoc, { size, ids }: PrintOptions): Promise<DataView> {
    const { STLExporter } = await import("three/examples/jsm/exporters/STLExporter.js");
    // Holes have to be cut out before the shape is written.
    if (holeGroups(doc.objects).size) await loadCsg();
    const { objects, box } = printableBounds(doc, ids);
    const chosen = new Set(objects.map((o) => o.id));
    const root = new THREE.Group();
    const inner = new THREE.Group();
    for (const { object: o, geometry } of solidMeshes(doc.objects)) {
        if (!chosen.has(o.id)) continue;
        const mirrored = o.scale[0] * o.scale[1] * o.scale[2] < 0;
        const mesh = new THREE.Mesh(mirrored ? flipWinding(geometry) : geometry);
        mesh.position.set(...o.position);
        mesh.rotation.set(...o.rotation);
        mesh.scale.set(...o.scale);
        inner.add(mesh);
    }
    const extent = box.getSize(new THREE.Vector3());
    const longest = Math.max(extent.x, extent.y, extent.z) || 1;
    const center = box.getCenter(new THREE.Vector3());
    // Centre on the bed with the lowest point at zero, then scale and turn Y-up into Z-up.
    inner.position.set(-center.x, -box.min.y, -center.z);
    root.add(inner);
    root.scale.setScalar(size / longest);
    root.rotation.x = Math.PI / 2;
    root.updateMatrixWorld(true);
    return new STLExporter().parse(root, { binary: true });
}

export async function exportSTL(doc: SceneDoc, options: PrintOptions) {
    track("export", "stl");
    const data = await stlBuffer(doc, options);
    download(data.buffer as ArrayBuffer, "scene.stl", "model/stl");
}
