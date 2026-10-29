import { memo, useRef, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import type { ThreeElements } from "@react-three/fiber";
import {
    GizmoHelper,
    GizmoViewport,
    Grid,
    Line,
    OrbitControls,
    PerspectiveCamera,
    TransformControls,
} from "@react-three/drei";
import { useEditor } from "../store/editor";
import * as THREE from "three";
import { deserializeGeometry } from "../utils/geometry";
import type {
    GeometryParamsMap,
    EditorState,
    SceneObject,
    SceneLight,
} from "../types";
import { useRegisterViewportActions } from "../provider/ViewportContext";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { TransformControls as TransformControlsImpl } from "three-stdlib";

function Selectable(props: { id: string; children: React.ReactNode }) {
    const selectedId = useEditor((s) => s.selectedId);
    const select = useEditor((s) => s.select);
    const isSelected = selectedId === props.id;
    return (
        <group
            onClick={(e) => {
                e.stopPropagation();
                select(props.id);
            }}
        >
            {props.children}
            {isSelected ? (
                <mesh>
                    <sphereGeometry args={[0.05, 8, 8]} />
                    <meshBasicMaterial color="#71d1ff" />
                </mesh>
            ) : null}
        </group>
    );
}

function RenderObject({
    o,
    isSelected,
    mode,
    snap,
    orbitRef,
    beginTransform,
    endTransform,
    updateTransform,
    editorMode,
}: {
    o: SceneObject;
    isSelected: boolean;
    mode: "translate" | "rotate" | "scale";
    snap: {
        enableSnapping: boolean;
        translateSnap: number;
        rotateSnap: number;
        scaleSnap: number;
    };
    orbitRef: React.RefObject<OrbitControlsImpl | null>;
    beginTransform: () => void;
    endTransform: () => void;
    updateTransform: (
        id: string,
        partial: Partial<Pick<SceneObject, "position" | "rotation" | "scale">>
    ) => void;
    editorMode: "object" | "edit" | "render";
}) {
    const transformRef = useRef<TransformControlsImpl>(null);
    const meshRef = useRef<THREE.Mesh>(null);
    const setGizmoInteracting = useEditor((s) => s.setGizmoInteracting);
    const isTransforming = useEditor(
        (s: EditorState) => s.isTransforming ?? false
    );

    const position: ThreeElements["group"]["position"] = [
        o.position.x,
        o.position.y,
        o.position.z,
    ];
    const rotation: ThreeElements["group"]["rotation"] = [
        o.rotation.x,
        o.rotation.y,
        o.rotation.z,
    ];
    const scale: ThreeElements["group"]["scale"] = [
        o.scale.x,
        o.scale.y,
        o.scale.z,
    ];
    const material = (
        <meshStandardMaterial
            color={o.material.color}
            metalness={o.material.metalness}
            roughness={o.material.roughness}
            opacity={o.material.opacity}
            transparent={o.material.transparent}
        />
    );

    const geom = (() => {
        switch (o.geometry) {
            case "box": {
                const p = o.geometryParams as
                    | GeometryParamsMap["box"]
                    | undefined;
                return (
                    <boxGeometry
                        args={[p?.width ?? 1, p?.height ?? 1, p?.depth ?? 1]}
                    />
                );
            }
            case "sphere": {
                const p = o.geometryParams as
                    | GeometryParamsMap["sphere"]
                    | undefined;
                const geometry = new THREE.SphereGeometry(
                    p?.radius ?? 0.5,
                    p?.widthSegments ?? 8,
                    p?.heightSegments ?? 8
                );
                // Ensure smooth shading
                geometry.computeVertexNormals();
                return <primitive attach="geometry" object={geometry} />;
            }
            case "cylinder": {
                const p = o.geometryParams as
                    | GeometryParamsMap["cylinder"]
                    | undefined;
                return (
                    <cylinderGeometry
                        args={[
                            p?.radiusTop ?? 0.5,
                            p?.radiusBottom ?? 0.5,
                            p?.height ?? 1,
                            p?.radialSegments ?? 32,
                        ]}
                    />
                );
            }
            case "cone": {
                const p = o.geometryParams as
                    | GeometryParamsMap["cone"]
                    | undefined;
                return (
                    <coneGeometry
                        args={[
                            p?.radius ?? 0.5,
                            p?.height ?? 1,
                            p?.radialSegments ?? 32,
                        ]}
                    />
                );
            }
            case "torus": {
                const p = o.geometryParams as
                    | GeometryParamsMap["torus"]
                    | undefined;
                const geometry = new THREE.TorusGeometry(
                    p?.radius ?? 0.5,
                    p?.tube ?? 0.2,
                    p?.radialSegments ?? 8,
                    p?.tubularSegments ?? 16
                );
                // Ensure smooth shading
                geometry.computeVertexNormals();
                return <primitive attach="geometry" object={geometry} />;
            }
            case "plane": {
                const p = o.geometryParams as
                    | GeometryParamsMap["plane"]
                    | undefined;
                return (
                    <planeGeometry
                        args={[
                            p?.width ?? 1,
                            p?.height ?? 1,
                            p?.widthSegments ?? 1,
                            p?.heightSegments ?? 1,
                        ]}
                    />
                );
            }
            case "custom": {
                const data = o.geometryParams as
                    | GeometryParamsMap["custom"]
                    | undefined;
                if (!data) return <boxGeometry args={[1, 1, 1]} />;
                const g = deserializeGeometry(data);
                return <primitive attach="geometry" object={g} />;
            }
            default:
                return <boxGeometry args={[1, 1, 1]} />;
        }
    })();

    const meshProps =
        !isSelected || !isTransforming ? { position, rotation, scale } : {};

    const mesh = (
        <mesh
            ref={meshRef}
            visible={o.visible}
            {...(meshProps as Partial<ThreeElements["mesh"]>)}
            castShadow
            receiveShadow
            raycast={isSelected ? () => {} : undefined}
        >
            {geom}
            {material}
        </mesh>
    );

    if (isSelected && editorMode !== "render") {
        return (
            <TransformControls
                ref={transformRef as React.Ref<TransformControlsImpl>}
                mode={mode}
                showX
                showY
                showZ
                translationSnap={
                    snap.enableSnapping ? snap.translateSnap : undefined
                }
                rotationSnap={snap.enableSnapping ? snap.rotateSnap : undefined}
                scaleSnap={snap.enableSnapping ? snap.scaleSnap : undefined}
                onPointerDown={() => {
                    if (orbitRef.current) orbitRef.current.enabled = false;
                    setGizmoInteracting(true);
                    beginTransform();
                }}
                onPointerUp={() => {
                    const obj = (
                        transformRef.current as unknown as {
                            object?: THREE.Object3D;
                        }
                    )?.object;
                    if (obj) {
                        updateTransform(o.id, {
                            position: {
                                x: obj.position.x,
                                y: obj.position.y,
                                z: obj.position.z,
                            },
                            rotation: {
                                x: obj.rotation.x,
                                y: obj.rotation.y,
                                z: obj.rotation.z,
                            },
                            scale: {
                                x: obj.scale.x,
                                y: obj.scale.y,
                                z: obj.scale.z,
                            },
                        });
                    }
                    endTransform();
                    setGizmoInteracting(false);
                    if (orbitRef.current) orbitRef.current.enabled = true;
                }}
            >
                {mesh}
            </TransformControls>
        );
    }

    return <Selectable id={o.id}>{mesh}</Selectable>;
}

function RenderLight({
    light,
    isSelected,
    mode,
    snap,
    orbitRef,
    beginTransform,
    endTransform,
    updateTransform,
    editorMode,
}: {
    light: SceneLight;
    isSelected: boolean;
    mode: "translate" | "rotate" | "scale";
    snap: {
        enableSnapping: boolean;
        translateSnap: number;
        rotateSnap: number;
        scaleSnap: number;
    };
    orbitRef: React.RefObject<OrbitControlsImpl | null>;
    beginTransform: () => void;
    endTransform: () => void;
    updateTransform: (
        id: string,
        partial: Partial<Pick<SceneLight, "position" | "rotation">>
    ) => void;
    editorMode: "object" | "edit" | "render";
}) {
    const transformRef = useRef<TransformControlsImpl>(null);
    const setGizmoInteracting = useEditor((s) => s.setGizmoInteracting);
    const isTransforming = useEditor(
        (s: EditorState) => s.isTransforming ?? false
    );

    const position: ThreeElements["group"]["position"] = [
        light.position.x,
        light.position.y,
        light.position.z,
    ];
    const rotation: ThreeElements["group"]["rotation"] = [
        light.rotation.x,
        light.rotation.y,
        light.rotation.z,
    ];

    // Create a visual representation of the light
    const lightVisual = (() => {
        console.log(
            "Creating light visual for:",
            light.type,
            "at position:",
            position
        );
        switch (light.type) {
            case "directional": {
                // Calculate direction based on rotation
                const direction = new THREE.Vector3(0, -1, 0);
                const euler = new THREE.Euler(
                    light.rotation.x,
                    light.rotation.y,
                    light.rotation.z
                );
                direction.applyEuler(euler);

                return (
                    <group>
                        <mesh>
                            <sphereGeometry args={[0.2, 8, 8]} />
                            <meshBasicMaterial color={light.props.color} />
                        </mesh>
                        <arrowHelper
                            args={[
                                direction,
                                new THREE.Vector3(0, 0, 0),
                                0.8,
                                light.props.color,
                            ]}
                        />
                    </group>
                );
            }
            case "point":
                return (
                    <group>
                        <mesh>
                            <sphereGeometry args={[0.2, 8, 8]} />
                            <meshBasicMaterial color={light.props.color} />
                        </mesh>
                        {/* Multiple concentric spheres to show light falloff */}
                        <mesh>
                            <sphereGeometry args={[0.2, 16, 16]} />
                            <meshBasicMaterial
                                color={light.props.color}
                                transparent
                                opacity={0.3}
                            />
                        </mesh>
                        <mesh>
                            <sphereGeometry args={[0.4, 16, 16]} />
                            <meshBasicMaterial
                                color={light.props.color}
                                transparent
                                opacity={0.1}
                            />
                        </mesh>
                        {/* Light rays emanating from center */}
                        <group>
                            {Array.from({ length: 8 }, (_, i) => {
                                const angle = (i / 8) * Math.PI * 2;
                                return (
                                    <mesh
                                        key={i}
                                        position={[
                                            Math.cos(angle) * 0.15,
                                            Math.sin(angle) * 0.15,
                                            0,
                                        ]}
                                    >
                                        <cylinderGeometry
                                            args={[0.01, 0.01, 0.3, 4]}
                                        />
                                        <meshBasicMaterial
                                            color={light.props.color}
                                            transparent
                                            opacity={0.6}
                                        />
                                    </mesh>
                                );
                            })}
                        </group>
                    </group>
                );
            case "spot":
                return (
                    <group>
                        <mesh>
                            <sphereGeometry args={[0.2, 8, 8]} />
                            <meshBasicMaterial color={light.props.color} />
                        </mesh>
                        {/* Spotlight cone */}
                        <mesh position={[0, -0.25, 0]}>
                            <coneGeometry args={[0.3, 0.5, 8]} />
                            <meshBasicMaterial
                                color={light.props.color}
                                transparent
                                opacity={0.2}
                                side={2} // DoubleSide
                            />
                        </mesh>
                        {/* Light beam lines */}
                        <group>
                            {Array.from({ length: 6 }, (_, i) => {
                                const angle = (i / 6) * Math.PI * 2;
                                const radius = 0.25;
                                return (
                                    <mesh
                                        key={i}
                                        position={[
                                            Math.cos(angle) * radius,
                                            -0.5,
                                            Math.sin(angle) * radius,
                                        ]}
                                    >
                                        <cylinderGeometry
                                            args={[0.005, 0.005, 0.4, 4]}
                                        />
                                        <meshBasicMaterial
                                            color={light.props.color}
                                            transparent
                                            opacity={0.8}
                                        />
                                    </mesh>
                                );
                            })}
                        </group>
                        {/* Base/stand */}
                        <mesh position={[0, -0.6, 0]}>
                            <cylinderGeometry args={[0.05, 0.05, 0.1, 8]} />
                            <meshBasicMaterial color={light.props.color} />
                        </mesh>
                    </group>
                );
            case "ambient":
                return (
                    <group>
                        <mesh>
                            <sphereGeometry args={[0.2, 8, 8]} />
                            <meshBasicMaterial color={light.props.color} />
                        </mesh>
                        {/* Soft, pulsing glow effect */}
                        <mesh>
                            <sphereGeometry args={[0.2, 16, 16]} />
                            <meshBasicMaterial
                                color={light.props.color}
                                transparent
                                opacity={0.4}
                            />
                        </mesh>
                        <mesh>
                            <sphereGeometry args={[0.35, 16, 16]} />
                            <meshBasicMaterial
                                color={light.props.color}
                                transparent
                                opacity={0.2}
                            />
                        </mesh>
                        <mesh>
                            <sphereGeometry args={[0.5, 16, 16]} />
                            <meshBasicMaterial
                                color={light.props.color}
                                transparent
                                opacity={0.1}
                            />
                        </mesh>
                        {/* Floating particles to show ambient nature */}
                        <group>
                            {Array.from({ length: 12 }, (_, i) => {
                                const angle = (i / 12) * Math.PI * 2;
                                const radius = 0.3 + Math.sin(i) * 0.1;
                                const height = Math.cos(i * 0.5) * 0.1;
                                return (
                                    <mesh
                                        key={i}
                                        position={[
                                            Math.cos(angle) * radius,
                                            height,
                                            Math.sin(angle) * radius,
                                        ]}
                                    >
                                        <sphereGeometry args={[0.02, 4, 4]} />
                                        <meshBasicMaterial
                                            color={light.props.color}
                                            transparent
                                            opacity={0.6}
                                        />
                                    </mesh>
                                );
                            })}
                        </group>
                    </group>
                );
            default:
                return null;
        }
    })();

    const meshProps =
        !isSelected || !isTransforming ? { position, rotation } : {};

    const mesh = (
        <group {...(meshProps as Partial<ThreeElements["group"]>)}>
            {lightVisual}
        </group>
    );

    if (isSelected && editorMode !== "render") {
        return (
            <TransformControls
                ref={transformRef as React.Ref<TransformControlsImpl>}
                mode={mode}
                showX
                showY
                showZ
                translationSnap={
                    snap.enableSnapping ? snap.translateSnap : undefined
                }
                rotationSnap={snap.enableSnapping ? snap.rotateSnap : undefined}
                onPointerDown={() => {
                    if (orbitRef.current) orbitRef.current.enabled = false;
                    setGizmoInteracting(true);
                    beginTransform();
                }}
                onPointerUp={() => {
                    const obj = (
                        transformRef.current as unknown as {
                            object?: THREE.Object3D;
                        }
                    )?.object;
                    if (obj) {
                        updateTransform(light.id, {
                            position: {
                                x: obj.position.x,
                                y: obj.position.y,
                                z: obj.position.z,
                            },
                            rotation: {
                                x: obj.rotation.x,
                                y: obj.rotation.y,
                                z: obj.rotation.z,
                            },
                        });
                    }
                    endTransform();
                    setGizmoInteracting(false);
                    if (orbitRef.current) orbitRef.current.enabled = true;
                }}
            >
                {mesh}
            </TransformControls>
        );
    }

    return <Selectable id={light.id}>{mesh}</Selectable>;
}

function SceneObjects({
    orbitRef,
    editorMode,
}: {
    orbitRef: React.RefObject<OrbitControlsImpl | null>;
    editorMode: "object" | "edit" | "render";
}) {
    const objects = useEditor((s) => s.objects);
    const lights = useEditor((s) => s.lights);
    const selectedId = useEditor((s) => s.selectedId);
    const mode = useEditor((s) => s.mode);
    const snap = useEditor((s) => s.snap);
    const updateTransform = useEditor((s) => s.updateTransform);
    const updateLightTransform = useEditor((s) => s.updateLightTransform);
    const beginTransform = useEditor((s) => s.beginTransform);
    const endTransform = useEditor((s) => s.endTransform);

    console.log("SceneObjects - lights array:", lights.length, lights);
    console.log("SceneObjects - objects array:", objects.length, objects);

    return (
        <group>
            {objects.map((o) => (
                <RenderObject
                    key={o.id}
                    o={o}
                    isSelected={selectedId === o.id}
                    mode={mode}
                    snap={snap}
                    orbitRef={orbitRef}
                    beginTransform={beginTransform}
                    endTransform={endTransform}
                    updateTransform={updateTransform}
                    editorMode={editorMode}
                />
            ))}
            {editorMode !== "render" && lights.map((light) => {
                console.log(
                    "Rendering light in SceneObjects:",
                    light.id,
                    light.type,
                    "editorMode:",
                    editorMode
                );
                return (
                    <RenderLight
                        key={light.id}
                        light={light}
                        isSelected={selectedId === light.id}
                        mode={mode}
                        snap={snap}
                        orbitRef={orbitRef}
                        beginTransform={beginTransform}
                        endTransform={endTransform}
                        updateTransform={updateLightTransform}
                        editorMode={editorMode}
                    />
                );
            })}
        </group>
    );
}

function Lights() {
    const lights = useEditor((s) => s.lights);

    return (
        <>
            {lights.map((light) => {
                const position: ThreeElements["group"]["position"] = [
                    light.position.x,
                    light.position.y,
                    light.position.z,
                ];
                const rotation: ThreeElements["group"]["rotation"] = [
                    light.rotation.x,
                    light.rotation.y,
                    light.rotation.z,
                ];

                const lightElement = (() => {
                    switch (light.type) {
                        case "directional": {
                            // Calculate target position based on rotation
                            const targetDirection = new THREE.Vector3(0, -1, 0);
                            const targetEuler = new THREE.Euler(
                                light.rotation.x,
                                light.rotation.y,
                                light.rotation.z
                            );
                            targetDirection.applyEuler(targetEuler);
                            const targetPosition = new THREE.Vector3(
                                light.position.x + targetDirection.x,
                                light.position.y + targetDirection.y,
                                light.position.z + targetDirection.z
                            );

                            return (
                                <directionalLight
                                    position={position}
                                    target-position={[
                                        targetPosition.x,
                                        targetPosition.y,
                                        targetPosition.z,
                                    ]}
                                    intensity={light.props.intensity}
                                    color={light.props.color}
                                    castShadow={light.castShadow}
                                    visible={light.visible}
                                />
                            );
                        }
                        case "point":
                            return (
                                <pointLight
                                    position={position}
                                    intensity={light.props.intensity}
                                    color={light.props.color}
                                    distance={light.props.distance || 0}
                                    decay={light.props.decay || 2}
                                    castShadow={light.castShadow}
                                    visible={light.visible}
                                />
                            );
                        case "spot":
                            return (
                                <spotLight
                                    position={position}
                                    rotation={rotation}
                                    intensity={light.props.intensity}
                                    color={light.props.color}
                                    distance={light.props.distance || 0}
                                    angle={light.props.angle || Math.PI / 3}
                                    penumbra={light.props.penumbra || 0}
                                    decay={light.props.decay || 2}
                                    castShadow={light.castShadow}
                                    visible={light.visible}
                                />
                            );
                        case "ambient":
                            return (
                                <ambientLight
                                    intensity={light.props.intensity}
                                    color={light.props.color}
                                    visible={light.visible}
                                />
                            );
                        default:
                            return null;
                    }
                })();

                // Wrap the light in a clickable group
                return (
                    <Selectable key={light.id} id={light.id}>
                        {lightElement}
                    </Selectable>
                );
            })}
        </>
    );
}

export function Viewport() {
    const select = useEditor((s) => s.select);
    const isTransforming = useEditor(
        (s: EditorState) => s.isTransforming ?? false
    );
    const isGizmoInteracting = useEditor(
        (s: EditorState & { isGizmoInteracting?: boolean }) =>
            s.isGizmoInteracting ?? false
    );
    const editorMode = useEditor((s) => s.editorMode) || "object";
    const orbitRef = useRef<OrbitControlsImpl | null>(null);
    const addObject = useEditor((s) => s.addObject);
    const register = useRegisterViewportActions();

    useEffect(() => {
        register({
            resetCamera: () => {
                if (!orbitRef.current) return;
                orbitRef.current.target.set(0, 0, 0);
                orbitRef.current.object.position.set(4, 3, 6);
                orbitRef.current.update();
            },
            createCube: () => addObject("box"),
            createSphere: () => addObject("sphere"),
            startHandDrag: () => {
                let selectedId = useEditor.getState().selectedId;
                if (!selectedId) {
                    useEditor.getState().addObject("box");
                    selectedId = useEditor.getState().selectedId;
                }
                if (selectedId) useEditor.getState().beginTransform();
            },
            updateHandDragNormalized: (u: number, v: number) => {
                const selectedId = useEditor.getState().selectedId;
                if (!selectedId) return;
                const objects = useEditor.getState().objects;
                const obj = objects.find((o) => o.id === selectedId);
                if (!obj) return;
                const range = 5;
                const x = (u - 0.5) * 2 * range;
                const z = (v - 0.5) * 2 * range;
                useEditor.getState().updateTransform(selectedId, {
                    position: { x, y: obj.position.y, z },
                });
            },
            endHandDrag: () => {
                const selectedId = useEditor.getState().selectedId;
                if (selectedId) useEditor.getState().endTransform();
            },
            orbitRotate: (dxN: number, dyN: number) => {
                if (!orbitRef.current) return;
                const ctrl = orbitRef.current;
                const camera = ctrl.object;
                const target = ctrl.target;

                const pos = camera.position;
                const offset = new THREE.Vector3().subVectors(pos, target);
                const spherical = new THREE.Spherical().setFromVector3(offset);

                const rotSpeed = Math.PI; // radians per full dxN=1 movement
                spherical.theta -= dxN * rotSpeed;
                spherical.phi -= dyN * rotSpeed;

                const EPS = 1e-6;
                spherical.phi = Math.max(
                    EPS,
                    Math.min(Math.PI - EPS, spherical.phi)
                );

                const newOffset = new THREE.Vector3().setFromSpherical(
                    spherical
                );
                pos.copy(new THREE.Vector3().addVectors(target, newOffset));
                camera.lookAt(target);
                ctrl.update();
            },
            orbitPan: (dxN: number, dyN: number) => {
                if (!orbitRef.current) return;
                const ctrl = orbitRef.current;
                const camera = ctrl.object;
                const target = ctrl.target;

                // Determine pan distance scaling
                let panX = 0;
                let panY = 0;
                if (camera instanceof THREE.PerspectiveCamera) {
                    const perspective = camera;
                    const distance = perspective.position
                        .clone()
                        .sub(target)
                        .length();
                    const halfFovY = (perspective.fov * Math.PI) / 180 / 2;
                    const heightAtDistance = 2 * distance * Math.tan(halfFovY);
                    panX = -dxN * heightAtDistance;
                    panY = dyN * heightAtDistance;
                } else if (camera instanceof THREE.OrthographicCamera) {
                    const ortho = camera;
                    const width = (ortho.right - ortho.left) / ortho.zoom;
                    const height = (ortho.top - ortho.bottom) / ortho.zoom;
                    panX = -dxN * width;
                    panY = dyN * height;
                } else {
                    const fallbackScale = 10;
                    panX = -dxN * fallbackScale;
                    panY = dyN * fallbackScale;
                }

                // Move camera and target along camera axes
                const xAxis = new THREE.Vector3();
                const yAxis = new THREE.Vector3();
                const zAxis = new THREE.Vector3();
                camera.matrix.extractBasis(xAxis, yAxis, zAxis);
                const panOffset = new THREE.Vector3();
                panOffset
                    .add(xAxis.multiplyScalar(panX))
                    .add(yAxis.multiplyScalar(panY));
                camera.position.add(panOffset);
                target.add(panOffset);
                ctrl.update();
            },
            orbitDolly: (delta: number) => {
                if (!orbitRef.current) return;
                const ctrl = orbitRef.current;
                const zoomFactor = Math.exp(delta * 0.5);
                ctrl.dollyIn(zoomFactor);
                ctrl.update();
            },
        });
    }, [register, addObject]);

    return (
        <Canvas
            shadows
            dpr={[1, 2]}
            onPointerMissed={() => {
                if (!isTransforming && !isGizmoInteracting) select(null);
            }}
        >
            <color attach="background" args={["#0d0e10"]} />
            <PerspectiveCamera makeDefault position={[4, 3, 6]} fov={50} />
            <OrbitControls
                ref={orbitRef as React.Ref<OrbitControlsImpl>}
                makeDefault
                enableDamping
                dampingFactor={0.08}
            />
            {/* Default environment lighting in render mode */}
            {editorMode === "render" ? (
                <>
                    {/* Soft ambient fill */}
                    <ambientLight intensity={0.4} color={"#ffffff"} />
                    {/* Main key light */}
                    <directionalLight
                        position={[5, 8, 5]}
                        intensity={1.2}
                        color={"#ffffff"}
                        castShadow
                    />
                    {/* Rim/back light */}
                    <directionalLight
                        position={[-6, 4, -6]}
                        intensity={0.6}
                        color={"#dfe7ff"}
                    />
                </>
            ) : (
                <Lights />
            )}
            <Grid
                infiniteGrid
                fadeDistance={40}
                cellSize={0.5}
                sectionSize={2}
                cellThickness={0.3}
                sectionThickness={1}
                cellColor="#26282d"
                sectionColor="#3a3d44"
            />
            <Line points={[[-500, 0.002, 0], [500, 0.002, 0]]} color="#e5484d" lineWidth={1.5} />
            <Line points={[[0, -500, 0], [0, 500, 0]]} color="#46a758" lineWidth={1.5} />
            <Line points={[[0, 0.002, -500], [0, 0.002, 500]]} color="#4f7cff" lineWidth={1.5} />
            {/* Gizmo helper - only show in non-render modes */}
            {editorMode !== "render" && (
                <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
                    <GizmoViewport
                        axisColors={["#e5484d", "#46a758", "#4f7cff"]}
                        labelColor="#dee2e6"
                    />
                </GizmoHelper>
            )}
            <SceneObjects orbitRef={orbitRef} editorMode={editorMode} />
        </Canvas>
    );
}

export default memo(Viewport);
