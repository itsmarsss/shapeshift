import { createContext, useContext } from "react";
import type { RefObject } from "react";
import * as THREE from "three";

export interface ThreeDContextType {
    selectObject: (objectName: string) => void;
    setObjectVisibility: (objectName: string, visible: boolean) => void;
    registerObject: (
        objectName: string,
        object: THREE.Group<THREE.Object3DEventMap>
    ) => void;
    unregisterObject: (objectName: string) => void;
    setupScene: (mountRef: RefObject<HTMLDivElement>) => void;
    createCube: (
        objectName: string,
        position: THREE.Vector3,
        faceColor: number
    ) => THREE.Group;
    createSphere: (
        objectName: string,
        position: THREE.Vector3,
        radius: number,
        faceColor: number
    ) => THREE.Group;
    createShape: (
        objectName: string,
        geometry: THREE.BufferGeometry,
        position: THREE.Vector3,
        faceColor: number
    ) => THREE.Group;
    resetCamera: () => void;
    objectsRef: RefObject<{
        [key: string]: THREE.Group<THREE.Object3DEventMap>;
    }>;
    renderScene: () => void;
    cameraRef: RefObject<THREE.PerspectiveCamera | undefined>;
    sceneRef: RefObject<THREE.Scene>;
    mainGroupRef: RefObject<THREE.Group>;
    rendererRef: RefObject<THREE.WebGLRenderer>;
    cornerMarkersRef: RefObject<THREE.Mesh[]>;
    zoomRef: RefObject<number>;
    resetCameraRef: RefObject<boolean>;
    renameObject: (oldName: string, newName: string) => void;
    updateCubeGeometry: (faceMesh: THREE.Mesh) => void;
    updateSphereGeometry: (sphereMesh: THREE.Mesh) => void;
}

export const ThreeDContext = createContext<ThreeDContextType | null>(null);

export const useThreeD = () => {
    const context = useContext(ThreeDContext);
    if (!context) {
        throw new Error("useThreeD must be used within an ThreeDProvider");
    }
    return context;
};
