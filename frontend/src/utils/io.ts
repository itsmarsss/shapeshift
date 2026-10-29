import { GLTFExporter, GLTFLoader } from "three-stdlib";
import { saveAs } from "file-saver";
import * as THREE from "three";
import type { SceneObject, GeometryParamsMap } from "../types";
import { serializeGeometry } from "./geometry";
import { nanoid } from "nanoid";

export function buildSceneFromObjects(objects: SceneObject[]): THREE.Scene {
    const scene = new THREE.Scene();
    const light = new THREE.AmbientLight(0xffffff, 1);
    scene.add(light);
    for (const o of objects) {
        let geometry: THREE.BufferGeometry;
        switch (o.geometry) {
            case "box": {
                const p = o.geometryParams as
                    | GeometryParamsMap["box"]
                    | undefined;
                geometry = new THREE.BoxGeometry(
                    p?.width ?? 1,
                    p?.height ?? 1,
                    p?.depth ?? 1
                );
                break;
            }
            case "sphere": {
                const p = o.geometryParams as
                    | GeometryParamsMap["sphere"]
                    | undefined;
                geometry = new THREE.SphereGeometry(
                    p?.radius ?? 0.5,
                    p?.widthSegments ?? 8,
                    p?.heightSegments ?? 8
                );
                // Ensure smooth shading
                geometry.computeVertexNormals();
                break;
            }
            case "cylinder": {
                const p = o.geometryParams as
                    | GeometryParamsMap["cylinder"]
                    | undefined;
                geometry = new THREE.CylinderGeometry(
                    p?.radiusTop ?? 0.5,
                    p?.radiusBottom ?? 0.5,
                    p?.height ?? 1,
                    p?.radialSegments ?? 32
                );
                break;
            }
            case "cone": {
                const p = o.geometryParams as
                    | GeometryParamsMap["cone"]
                    | undefined;
                geometry = new THREE.ConeGeometry(
                    p?.radius ?? 0.5,
                    p?.height ?? 1,
                    p?.radialSegments ?? 32
                );
                break;
            }
            case "torus": {
                const p = o.geometryParams as
                    | GeometryParamsMap["torus"]
                    | undefined;
                geometry = new THREE.TorusGeometry(
                    p?.radius ?? 0.5,
                    p?.tube ?? 0.2,
                    p?.radialSegments ?? 8,
                    p?.tubularSegments ?? 16
                );
                // Ensure smooth shading
                geometry.computeVertexNormals();
                break;
            }
            case "plane": {
                const p = o.geometryParams as
                    | GeometryParamsMap["plane"]
                    | undefined;
                geometry = new THREE.PlaneGeometry(
                    p?.width ?? 1,
                    p?.height ?? 1,
                    p?.widthSegments ?? 1,
                    p?.heightSegments ?? 1
                );
                break;
            }
            default:
                geometry = new THREE.BoxGeometry(1, 1, 1);
        }
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(o.material.color),
            metalness: o.material.metalness,
            roughness: o.material.roughness,
            opacity: o.material.opacity,
            transparent: o.material.transparent,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(o.position.x, o.position.y, o.position.z);
        mesh.rotation.set(o.rotation.x, o.rotation.y, o.rotation.z);
        mesh.scale.set(o.scale.x, o.scale.y, o.scale.z);
        mesh.visible = o.visible;
        scene.add(mesh);
    }
    return scene;
}

export async function exportSceneToGLB(
    scene: THREE.Scene,
    filename = "scene.glb"
) {
    const exporter = new GLTFExporter();
    return new Promise<void>((resolve, reject) => {
        exporter.parse(
            scene,
            (gltf) => {
                try {
                    if (gltf instanceof ArrayBuffer) {
                        const blob = new Blob([gltf], {
                            type: "model/gltf-binary",
                        });
                        saveAs(blob, filename);
                    } else {
                        const json = JSON.stringify(gltf);
                        const blob = new Blob([json], {
                            type: "application/json",
                        });
                        saveAs(blob, filename.replace(/\.glb$/, ".gltf"));
                    }
                    resolve();
                } catch (e) {
                    reject(e);
                }
            },
            (error) => reject(error),
            { binary: true }
        );
    });
}

export async function exportSceneToGLTF(
    scene: THREE.Scene,
    filename = "scene.gltf"
) {
    const exporter = new GLTFExporter();
    return new Promise<void>((resolve, reject) => {
        exporter.parse(
            scene,
            (gltf) => {
                try {
                    if (gltf instanceof ArrayBuffer) {
                        // If binary returned, convert to JSON first
                        reject(
                            new Error("Expected JSON glTF export, got binary")
                        );
                        return;
                    }
                    const json = JSON.stringify(gltf);
                    const blob = new Blob([json], { type: "application/json" });
                    saveAs(blob, filename);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            },
            (error) => reject(error),
            { binary: false }
        );
    });
}

function meshToSceneObject(mesh: THREE.Mesh): SceneObject | null {
    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    if (!geometry) return null;
    const material = mesh.material as
        | THREE.MeshStandardMaterial
        | THREE.MeshPhysicalMaterial
        | undefined;
    const color = material?.color ?? new THREE.Color("#9aa7ff");
    const metalness = material?.metalness ?? 0.1;
    const roughness = material?.roughness ?? 0.8;
    const opacity = material?.opacity ?? 1;
    const transparent = material?.transparent ?? false;

    return {
        id: nanoid(8),
        name: mesh.name || "Imported",
        geometry: "custom",
        geometryParams: serializeGeometry(geometry),
        position: {
            x: mesh.position.x,
            y: mesh.position.y,
            z: mesh.position.z,
        },
        rotation: {
            x: mesh.rotation.x,
            y: mesh.rotation.y,
            z: mesh.rotation.z,
        },
        scale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z },
        material: {
            color: `#${color.getHexString()}`,
            metalness,
            roughness,
            opacity,
            transparent,
        },
        visible: mesh.visible,
        locked: false,
    };
}

function extractObjectsFromThreeScene(root: THREE.Object3D): SceneObject[] {
    const result: SceneObject[] = [];
    root.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            const obj = meshToSceneObject(child as THREE.Mesh);
            if (obj) result.push(obj);
        }
    });
    return result;
}

export async function importObjectsFromGLTF(
    file: File
): Promise<SceneObject[]> {
    const loader = new GLTFLoader();
    const ext = file.name.toLowerCase().split(".").pop() || "";
    if (ext === "glb") {
        const arrayBuffer = await file.arrayBuffer();
        return new Promise((resolve, reject) => {
            loader.parse(
                arrayBuffer as unknown as ArrayBuffer,
                "",
                (gltf) => {
                    try {
                        const objs = extractObjectsFromThreeScene(gltf.scene);
                        resolve(objs);
                    } catch (e) {
                        reject(e);
                    }
                },
                (err) => reject(err)
            );
        });
    }
    if (ext === "gltf") {
        const text = await file.text();
        return new Promise((resolve, reject) => {
            loader.parse(
                text,
                "",
                (gltf) => {
                    try {
                        const objs = extractObjectsFromThreeScene(gltf.scene);
                        resolve(objs);
                    } catch (e) {
                        reject(e);
                    }
                },
                (err) => reject(err)
            );
        });
    }
    throw new Error("Unsupported file type for GLTF import");
}
