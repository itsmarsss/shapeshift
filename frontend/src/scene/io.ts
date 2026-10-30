import * as THREE from "three";
import { buildGeometry } from "./geometry";
import { animationClip } from "./clip";
import { SceneDoc } from "@shapeshift/shared/scene/schema";
import { gunzip, gzip, meshHash } from "@shapeshift/shared/scene/meshes";
import { loadMesh, meshBuffer, meshHashes, putMeshes } from "./meshStore";

export function download(data: BlobPart, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function toBase64(bytes: Uint8Array) {
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text);
}

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

// A scene file carries the imported meshes it uses, gzipped, so it opens
// anywhere on its own.
export async function sceneFileText(doc: SceneDoc): Promise<string> {
    const hashes = meshHashes(doc);
    if (!hashes.length) return JSON.stringify(doc, null, 2);
    const meshes: Record<string, string> = {};
    for (const hash of hashes) {
        if (!meshBuffer(hash)) await loadMesh(hash);
        const buffer = meshBuffer(hash);
        if (buffer) meshes[hash] = toBase64(await gzip(new Uint8Array(buffer)));
    }
    return JSON.stringify({ ...doc, meshes });
}

export async function saveSceneFile(doc: SceneDoc) {
    download(await sceneFileText(doc), "scene.shapeshift.json", "application/json");
}

// Stores any meshes carried in a scene file.
export async function readSceneFileMeshes(text: string): Promise<void> {
    let meshes: unknown;
    try {
        meshes = (JSON.parse(text) as { meshes?: unknown }).meshes;
    } catch {
        return;
    }
    if (!meshes || typeof meshes !== "object") return;
    const found: { hash: string; buffer: ArrayBuffer }[] = [];
    for (const [hash, data] of Object.entries(meshes as Record<string, unknown>)) {
        if (typeof data !== "string") continue;
        const bytes = await gunzip(fromBase64(data)).catch(() => null);
        if (bytes && (await meshHash(bytes)) === hash) found.push({ hash, buffer: bytes.buffer as ArrayBuffer });
    }
    await putMeshes(found);
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
    for (const o of doc.objects) {
        const mesh = new THREE.Mesh(
            buildGeometry(o.geometry),
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
    const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
    const clip = animationClip(doc);
    const result = await new GLTFExporter().parseAsync(toThreeScene(doc), { binary: true, ...(clip ? { animations: [clip] } : {}) });
    download(result as ArrayBuffer, "scene.glb", "model/gltf-binary");
}

export type PrintOptions = {
    // Length of the longest side of the print, in millimetres.
    size: number;
    // Only these objects, or everything when empty.
    ids?: string[];
};

// Objects to print with their real-world size in scene units (metres).
export function printableBounds(doc: SceneDoc, ids: string[] = []) {
    const objects = ids.length ? doc.objects.filter((o) => ids.includes(o.id)) : doc.objects;
    const box = new THREE.Box3();
    for (const o of objects) {
        const geometry = buildGeometry(o.geometry);
        geometry.computeBoundingBox();
        const matrix = new THREE.Matrix4().compose(
            new THREE.Vector3(...o.position),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.rotation)),
            new THREE.Vector3(...o.scale),
        );
        box.union(geometry.boundingBox!.clone().applyMatrix4(matrix));
        geometry.dispose();
    }
    return { objects, box };
}

// Builds a binary STL scaled to the requested size. Slicers expect Z up and
// millimetres, and the model resting on the bed, so it's turned and moved to fit.
export async function stlBuffer(doc: SceneDoc, { size, ids }: PrintOptions): Promise<DataView> {
    const { STLExporter } = await import("three/examples/jsm/exporters/STLExporter.js");
    const { objects, box } = printableBounds(doc, ids);
    const root = new THREE.Group();
    const inner = new THREE.Group();
    for (const o of objects) {
        const mesh = new THREE.Mesh(buildGeometry(o.geometry));
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
    const data = await stlBuffer(doc, options);
    download(data.buffer as ArrayBuffer, "scene.stl", "model/stl");
}
