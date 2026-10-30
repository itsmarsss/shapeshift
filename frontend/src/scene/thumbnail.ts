import * as THREE from "three";
import type { SceneDoc } from "@shapeshift/shared/scene/schema";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { toThreeScene } from "./io";

let renderer: THREE.WebGLRenderer | null = null;
let environment: THREE.Texture | null = null;

// Renders a small picture of a scene from a three-quarter view, framed to fit.
// One renderer is shared across calls, since browsers limit WebGL contexts.
export function renderThumbnail(doc: SceneDoc, width = 320, height = 240): string | null {
    try {
        renderer ??= new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    } catch {
        return null;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Soft studio reflections, so metal doesn't render black.
    environment ??= new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    const scene = toThreeScene(doc);
    scene.environment = environment;
    scene.add(new THREE.HemisphereLight("#ffffff", "#6b7080", 0.8));
    const sun = new THREE.DirectionalLight("#ffffff", 2);
    sun.position.set(4, 8, 6);
    scene.add(sun);

    // Frame the subject, not the ground it stands on.
    const flat = new Set(doc.objects.filter((o) => o.geometry.type === "plane").map((o) => o.name));
    const subject = doc.objects.length > flat.size ? (o: THREE.Object3D) => !flat.has(o.name) : () => true;
    const box = new THREE.Box3();
    scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && subject(o)) box.expandByObject(o);
    });
    const sphere = box.isEmpty() ? new THREE.Sphere(new THREE.Vector3(), 2) : box.getBoundingSphere(new THREE.Sphere());
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 500);
    const distance = sphere.radius / Math.sin(THREE.MathUtils.degToRad(40) / 2);
    camera.position.copy(sphere.center).add(new THREE.Vector3(0.6, 0.45, 1).normalize().multiplyScalar(distance * 0.85));
    camera.lookAt(sphere.center);

    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL("image/png");
    scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
    });
    return url;
}
