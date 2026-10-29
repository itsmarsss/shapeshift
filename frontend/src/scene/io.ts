import * as THREE from "three";
import { buildGeometry, toMeshGeometry } from "./geometry";
import { DEFAULT_MATERIAL } from "./commands";
import { SceneDoc, type SceneObject } from "./schema";

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
    for (const o of doc.objects) {
        const mesh = new THREE.Mesh(
            buildGeometry(o.geometry),
            new THREE.MeshStandardMaterial({
                color: o.material.color,
                metalness: o.material.metalness,
                roughness: o.material.roughness,
                opacity: o.material.opacity,
                transparent: o.material.opacity < 1,
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
    const result = await new GLTFExporter().parseAsync(toThreeScene(doc), { binary: true });
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
