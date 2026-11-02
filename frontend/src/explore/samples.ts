import type { Command, Primitive, Vec3 } from "@shapeshift/shared/scene/schema";
import type { Template } from "../scene/templates";

// Sample projects shown first on the Explore page, made by the ShapeShift
// team from the app's own shapes, so anyone can open one and remix it.

type Extra = { rotation?: Vec3; scale?: Vec3 };
const add = (primitive: Primitive, name: string, geometry: Record<string, number>, position: Vec3, color: string, extra: Extra = {}): Command =>
    ({ type: "add", primitive, name, geometry: { type: primitive, ...geometry }, position, color, ...extra }) as Command;
const glow = (target: string, emissive: string, emissiveIntensity = 1): Command => ({ type: "material", target, emissive, emissiveIntensity });
const shiny = (target: string, metalness: number, roughness: number): Command => ({ type: "material", target, metalness, roughness });
// A full turn about one axis over `seconds`, looping.
const spin = (target: string, seconds: number, from: Vec3, axis: 0 | 1 | 2): Command => {
    const to = from.slice() as Vec3;
    to[axis] += Math.PI * 2;
    return { type: "animate", target, property: "rotation", keys: [{ time: 0, value: from, easing: "linear" }, { time: seconds, value: to, easing: "linear" }] };
};

function pine(name: string, x: number, z: number, size = 1, y = 0): Command[] {
    return [
        add("cylinder", `${name} trunk`, { radiusTop: 0.07 * size, radiusBottom: 0.1 * size, height: 0.45 * size }, [x, y + 0.22 * size, z], "#6b4a30"),
        add("cone", `${name} lower`, { radius: 0.55 * size, height: 0.9 * size }, [x, y + 0.8 * size, z], "#2f7d4a"),
        add("cone", `${name} upper`, { radius: 0.4 * size, height: 0.7 * size }, [x, y + 1.3 * size, z], "#3b9a5a"),
    ];
}

const STONE = "#cfc8bc";
const SLATE = "#4561b8";

const castle: Command[] = [
    add("cylinder", "Hill", { radiusTop: 3.6, radiusBottom: 4.2, height: 0.6 }, [0, -0.3, 0], "#7cb36a"),
    add("box", "Keep", { width: 1.8, height: 2.2, depth: 1.8 }, [0, 1.1, -0.4], STONE),
    add("pyramid", "Keep roof", { width: 2, height: 1.2, depth: 2 }, [0, 2.8, -0.4], SLATE),
    ...[
        [-1.7, 1.3],
        [1.7, 1.3],
        [-1.7, -1.3],
        [1.7, -1.3],
    ].flatMap(([x, z], i) => [
        add("cylinder", `Tower ${i + 1}`, { radiusTop: 0.45, radiusBottom: 0.5, height: 2.6 }, [x, 1.3, z], STONE),
        add("cone", `Tower roof ${i + 1}`, { radius: 0.62, height: 1.1 }, [x, 3.15, z], SLATE),
    ]),
    add("box", "Front wall", { width: 2.9, height: 1.4, depth: 0.3 }, [0, 0.7, 1.3], STONE),
    add("box", "Back wall", { width: 2.9, height: 1.4, depth: 0.3 }, [0, 0.7, -1.3], STONE),
    add("box", "Left wall", { width: 0.3, height: 1.4, depth: 2.3 }, [-1.7, 0.7, 0], STONE),
    add("box", "Right wall", { width: 0.3, height: 1.4, depth: 2.3 }, [1.7, 0.7, 0], STONE),
    ...[-1, -0.5, 0.5, 1].map((x, i) => add("box", `Merlon ${i + 1}`, { width: 0.28, height: 0.28, depth: 0.32 }, [x, 1.54, 1.3], STONE)),
    add("box", "Gate", { width: 0.72, height: 0.95, depth: 0.08 }, [0, 0.48, 1.46], "#5b3a2a"),
    add("box", "Path", { width: 0.7, height: 0.03, depth: 1.9 }, [0, 0.015, 2.5], "#ddd0b4"),
    add("cylinder", "Flagpole", { radiusTop: 0.025, radiusBottom: 0.025, height: 0.8 }, [0, 3.8, -0.4], "#3a3a40"),
    add("box", "Flag", { width: 0.45, height: 0.28, depth: 0.02 }, [0.24, 4.03, -0.4], "#e5484d"),
    ...pine("Pine 1", -2.8, 1.6, 0.9),
    ...pine("Pine 2", 2.7, -2.0, 1.1),
    ...pine("Pine 3", 2.9, 1.4, 0.8),
    { type: "environment", preset: "sunset" },
];

const METAL = "#e8ebf0";
const robot: Command[] = [
    add("cylinder", "Floor", { radiusTop: 1.7, radiusBottom: 1.7, height: 0.06 }, [0, -0.03, 0], "#dfe3ea"),
    add("box", "Left foot", { width: 0.48, height: 0.2, depth: 0.7 }, [-0.35, 0.1, 0.06], "#3b3f4a"),
    add("box", "Right foot", { width: 0.48, height: 0.2, depth: 0.7 }, [0.35, 0.1, 0.06], "#3b3f4a"),
    add("cylinder", "Left leg", { radiusTop: 0.12, radiusBottom: 0.12, height: 0.7 }, [-0.35, 0.55, 0], "#9aa0ab"),
    add("cylinder", "Right leg", { radiusTop: 0.12, radiusBottom: 0.12, height: 0.7 }, [0.35, 0.55, 0], "#9aa0ab"),
    add("box", "Body", { width: 1.3, height: 1.1, depth: 0.8 }, [0, 1.45, 0], METAL),
    add("box", "Chest panel", { width: 0.7, height: 0.42, depth: 0.05 }, [0, 1.55, 0.42], "#4f7bff"),
    glow("Chest panel", "#4f7bff", 0.5),
    ...[-0.2, 0, 0.2].map((x, i) => add("sphere", `Button ${i + 1}`, { radius: 0.05 }, [x, 1.2, 0.41], ["#e5484d", "#f5a524", "#22c55e"][i])),
    add("sphere", "Left shoulder", { radius: 0.17 }, [-0.78, 1.82, 0], "#9aa0ab"),
    add("sphere", "Right shoulder", { radius: 0.17 }, [0.78, 1.82, 0], "#9aa0ab"),
    add("cylinder", "Left arm", { radiusTop: 0.1, radiusBottom: 0.1, height: 0.8 }, [-0.86, 1.42, 0], METAL, { rotation: [0, 0, -0.15] }),
    add("cylinder", "Right arm", { radiusTop: 0.1, radiusBottom: 0.1, height: 0.8 }, [0.86, 1.42, 0], METAL, { rotation: [0, 0, 0.15] }),
    add("torus", "Left claw", { radius: 0.12, tube: 0.045 }, [-0.93, 0.95, 0], "#3b3f4a", { rotation: [0, Math.PI / 2, 0] }),
    add("torus", "Right claw", { radius: 0.12, tube: 0.045 }, [0.93, 0.95, 0], "#3b3f4a", { rotation: [0, Math.PI / 2, 0] }),
    add("cylinder", "Neck", { radiusTop: 0.13, radiusBottom: 0.13, height: 0.16 }, [0, 2.08, 0], "#9aa0ab"),
    add("box", "Head", { width: 0.92, height: 0.7, depth: 0.72 }, [0, 2.5, 0], METAL),
    add("sphere", "Left eye", { radius: 0.11 }, [-0.2, 2.56, 0.35], "#7cf0ff"),
    add("sphere", "Right eye", { radius: 0.11 }, [0.2, 2.56, 0.35], "#7cf0ff"),
    glow("Left eye", "#38d9ff", 1.4),
    glow("Right eye", "#38d9ff", 1.4),
    add("box", "Mouth", { width: 0.36, height: 0.06, depth: 0.04 }, [0, 2.32, 0.37], "#3b3f4a"),
    add("cylinder", "Antenna", { radiusTop: 0.025, radiusBottom: 0.025, height: 0.36 }, [0, 3.03, 0], "#9aa0ab"),
    add("sphere", "Antenna light", { radius: 0.075 }, [0, 3.24, 0], "#ff6b5e"),
    glow("Antenna light", "#ff4b3e", 1.5),
    { type: "group", name: "Robot", targets: ["Body", "Chest panel", "Button 1", "Button 2", "Button 3", "Left shoulder", "Right shoulder", "Left arm", "Right arm", "Left claw", "Right claw"] },
    { type: "group", name: "Robot head", targets: ["Head", "Left eye", "Right eye", "Mouth", "Antenna", "Antenna light"] },
    { type: "environment", preset: "studio" },
];

// The tower narrows as it rises; bands sit just proud of it.
const towerRadius = (y: number) => 0.62 - ((y - 0.55) / 2.6) * 0.17;
const lighthouse: Command[] = [
    add("cylinder", "Sea", { radiusTop: 4, radiusBottom: 4, height: 0.1 }, [0, -0.05, 0], "#4c9bd6"),
    shiny("Sea", 0.1, 0.15),
    add("halfSphere", "Island", { radius: 1.5 }, [0, 0, 0], "#8d8a83", { scale: [1, 0.42, 1] }),
    add("sphere", "Rock 1", { radius: 0.35 }, [1.5, 0.05, 0.9], "#7b7973", { scale: [1, 0.6, 0.9] }),
    add("sphere", "Rock 2", { radius: 0.25 }, [-1.4, 0.02, -0.9], "#7b7973", { scale: [1, 0.6, 1] }),
    add("sphere", "Rock 3", { radius: 0.2 }, [-1.6, 0.02, 0.6], "#8d8a83", { scale: [1, 0.7, 1] }),
    add("cylinder", "Tower", { radiusTop: 0.45, radiusBottom: 0.62, height: 2.6 }, [0, 1.85, 0], "#f5f5f7"),
    add("cylinder", "Lower band", { radiusTop: towerRadius(1.6) + 0.012, radiusBottom: towerRadius(1.2) + 0.012, height: 0.4 }, [0, 1.4, 0], "#d8473a"),
    add("cylinder", "Upper band", { radiusTop: towerRadius(2.6) + 0.012, radiusBottom: towerRadius(2.2) + 0.012, height: 0.4 }, [0, 2.4, 0], "#d8473a"),
    add("cylinder", "Gallery", { radiusTop: 0.66, radiusBottom: 0.66, height: 0.08 }, [0, 3.19, 0], "#2d2f36"),
    add("cylinder", "Lamp room", { radiusTop: 0.36, radiusBottom: 0.36, height: 0.5 }, [0, 3.48, 0], "#fff2b3"),
    glow("Lamp room", "#ffd36e", 1.4),
    add("cone", "Lamp roof", { radius: 0.5, height: 0.45 }, [0, 3.95, 0], "#d8473a"),
    add("sphere", "Finial", { radius: 0.06 }, [0, 4.22, 0], "#2d2f36"),
    add("box", "Cottage", { width: 0.8, height: 0.55, depth: 0.6 }, [0.85, 0.65, -0.35], "#f5f5f7"),
    add("roof", "Cottage roof", { width: 0.95, height: 0.4, depth: 0.7 }, [0.85, 1.12, -0.35], "#8b4a2b"),
    add("halfSphere", "Boat hull", { radius: 0.35 }, [2.5, 0.1, 1.6], "#a0714b", { rotation: [Math.PI, 0, 0], scale: [1.6, 0.5, 0.8] }),
    add("cylinder", "Mast", { radiusTop: 0.02, radiusBottom: 0.02, height: 0.7 }, [2.5, 0.45, 1.6], "#6b4a30"),
    add("wedge", "Sail", { width: 0.45, height: 0.55, depth: 0.02 }, [2.73, 0.48, 1.6], "#f5f5f7"),
    { type: "environment", preset: "sunset" },
];

const BALLOON = "#e5484d";
const balloon: Command[] = [
    add("cylinder", "Meadow", { radiusTop: 3.8, radiusBottom: 3.8, height: 0.12 }, [0, -0.06, 0], "#9fd38a"),
    add("halfSphere", "Hill 1", { radius: 1.6 }, [-2, 0, -1.2], "#7cb36a", { scale: [1, 0.35, 1] }),
    add("halfSphere", "Hill 2", { radius: 1.2 }, [2.2, 0, 0.8], "#86c070", { scale: [1, 0.4, 1] }),
    add("sphere", "Balloon", { radius: 1.1 }, [0, 3.4, 0], BALLOON, { scale: [1, 1.12, 1] }),
    add("cone", "Balloon bottom", { radius: 0.78, height: 0.95 }, [0, 2.3, 0], BALLOON, { rotation: [Math.PI, 0, 0] }),
    add("torus", "Middle stripe", { radius: 1.09, tube: 0.07 }, [0, 3.4, 0], "#f5c542", { rotation: [Math.PI / 2, 0, 0] }),
    add("torus", "Top stripe", { radius: 0.82, tube: 0.06 }, [0, 4.15, 0], "#f5c542", { rotation: [Math.PI / 2, 0, 0] }),
    add("torus", "Lower stripe", { radius: 0.86, tube: 0.06 }, [0, 2.65, 0], "#f5c542", { rotation: [Math.PI / 2, 0, 0] }),
    ...[
        [0.22, 0.22],
        [-0.22, 0.22],
        [0.22, -0.22],
        [-0.22, -0.22],
    ].map(([x, z], i) => add("cylinder", `Rope ${i + 1}`, { radiusTop: 0.012, radiusBottom: 0.012, height: 0.55 }, [x, 1.65, z], "#6b4a30")),
    add("box", "Basket", { width: 0.55, height: 0.4, depth: 0.55 }, [0, 1.2, 0], "#a0714b"),
    add("sphere", "Burner", { radius: 0.08 }, [0, 1.85, 0], "#ffb648"),
    glow("Burner", "#ff9a2e", 1.6),
    ...[
        [-2.4, 3.4, -1.5],
        [2.6, 4.4, -2],
        [1.8, 2.3, 2.2],
    ].flatMap(([x, y, z], c) =>
        [
            [0, 0, 0, 0.45],
            [0.45, -0.08, 0.05, 0.35],
            [-0.42, -0.1, 0, 0.32],
        ].map(([dx, dy, dz, r], i) => add("sphere", `Cloud ${c + 1}.${i + 1}`, { radius: r }, [x + dx, y + dy, z + dz], "#ffffff")),
    ),
    { type: "group", name: "Hot air balloon", targets: ["Balloon", "Balloon bottom", "Middle stripe", "Top stripe", "Lower stripe", "Rope 1", "Rope 2", "Rope 3", "Rope 4", "Basket", "Burner"] },
    { type: "environment", preset: "sunset" },
];

const windmill: Command[] = [
    add("cylinder", "Field", { radiusTop: 3.6, radiusBottom: 3.6, height: 0.2 }, [0, -0.1, 0], "#8cc26b"),
    ...[0, 1, 2, 3, 4].map((i) => add("box", `Row ${i + 1}`, { width: 0.22, height: 0.1, depth: 2.4 }, [-2.6 + i * 0.4, 0.05, -0.2], i % 2 ? "#6aa84f" : "#9b6b43")),
    add("cylinder", "Tower", { radiusTop: 0.42, radiusBottom: 0.72, height: 2.4 }, [0, 1.2, 0], "#ecdfc8"),
    add("cone", "Cap", { radius: 0.58, height: 0.6 }, [0, 2.7, 0], "#8b4a2b"),
    add("box", "Door", { width: 0.34, height: 0.55, depth: 0.05 }, [0, 0.28, 0.71], "#6b4a30"),
    add("box", "Window", { width: 0.2, height: 0.22, depth: 0.04 }, [0, 1.45, 0.58], "#ffd98a"),
    add("sphere", "Hub", { radius: 0.13 }, [0, 2.3, 0.6], "#5b3a2a"),
    add("box", "Sails 1", { width: 0.24, height: 3.1, depth: 0.04 }, [0, 2.3, 0.66], "#f4efe6"),
    add("box", "Sails 2", { width: 0.24, height: 3.1, depth: 0.04 }, [0, 2.3, 0.67], "#f4efe6", { rotation: [0, 0, Math.PI / 2] }),
    ...[0, 1, 2, 3, 4, 5].map((i) => add("cylinder", `Post ${i + 1}`, { radiusTop: 0.04, radiusBottom: 0.04, height: 0.45 }, [-1.5 + i * 0.6, 0.22, 2.2], "#8b5a2b")),
    add("box", "Rail", { width: 3.1, height: 0.05, depth: 0.04 }, [0, 0.32, 2.2], "#a0714b"),
    add("cylinder", "Hay bale 1", { radiusTop: 0.3, radiusBottom: 0.3, height: 0.5 }, [1.6, 0.3, 0.6], "#e6c36a", { rotation: [Math.PI / 2, 0, 0] }),
    add("cylinder", "Hay bale 2", { radiusTop: 0.3, radiusBottom: 0.3, height: 0.5 }, [2.0, 0.3, -0.2], "#e6c36a", { rotation: [Math.PI / 2, 0, 0.4] }),
    { type: "timeline", duration: 6, loop: true },
    spin("Sails 1", 6, [0, 0, 0], 2),
    spin("Sails 2", 6, [0, 0, Math.PI / 2], 2),
    { type: "environment", preset: "sunset" },
];

// The ring stands upright, facing the viewer, and turns about the spine.
const station: Command[] = [
    add("torus", "Ring", { radius: 1.6, tube: 0.16 }, [0, 1.6, 0], "#e8ebf0"),
    add("box", "Spokes 1", { width: 3.2, height: 0.07, depth: 0.07 }, [0, 1.6, 0], "#b9bec8"),
    add("box", "Spokes 2", { width: 3.2, height: 0.07, depth: 0.07 }, [0, 1.6, 0], "#b9bec8", { rotation: [0, 0, Math.PI / 2] }),
    add("sphere", "Hub", { radius: 0.4 }, [0, 1.6, 0], "#c9ccd3"),
    add("cylinder", "Spine", { radiusTop: 0.14, radiusBottom: 0.14, height: 2.8 }, [0, 1.6, -0.2], "#c9ccd3", { rotation: [Math.PI / 2, 0, 0] }),
    ...[-0.8, -1.4].flatMap((z, i) => [
        add("box", `Panel ${i * 2 + 1}`, { width: 1.3, height: 0.55, depth: 0.03 }, [0.82, 1.6, z], "#2b4c9a"),
        add("box", `Panel ${i * 2 + 2}`, { width: 1.3, height: 0.55, depth: 0.03 }, [-0.82, 1.6, z], "#2b4c9a"),
    ]),
    shiny("Panel 1", 0.6, 0.25),
    shiny("Panel 2", 0.6, 0.25),
    shiny("Panel 3", 0.6, 0.25),
    shiny("Panel 4", 0.6, 0.25),
    add("cylinder", "Capsule", { radiusTop: 0.18, radiusBottom: 0.18, height: 0.5 }, [0, 1.6, 1.45], "#f4f5f7", { rotation: [Math.PI / 2, 0, 0] }),
    add("cone", "Capsule nose", { radius: 0.18, height: 0.28 }, [0, 1.6, 1.84], "#e5484d", { rotation: [Math.PI / 2, 0, 0] }),
    add("sphere", "Planet", { radius: 2.2 }, [-4.2, 0.4, -5], "#3a7bd5"),
    add("torus", "Planet ring", { radius: 3, tube: 0.06 }, [-4.2, 0.4, -5], "#d9c8a0", { rotation: [1.2, 0.3, 0] }),
    ...[
        [3.5, 4, -4],
        [-1.5, 4.6, -3],
        [4.2, 1, -3.5],
        [1.2, 3.8, -5],
        [-3.2, 3.6, 1],
        [3, 0.2, 2],
        [-2.6, -0.3, 2.5],
        [0.4, 4.4, 2],
    ].map(([x, y, z], i) => add("sphere", `Star ${i + 1}`, { radius: 0.05 }, [x, y, z], "#ffffff")),
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => glow(`Star ${i}`, "#ffffff", 2)),
    { type: "timeline", duration: 12, loop: true },
    spin("Ring", 12, [0, 0, 0], 2),
    spin("Spokes 1", 12, [0, 0, 0], 2),
    spin("Spokes 2", 12, [0, 0, Math.PI / 2], 2),
    { type: "environment", preset: "night" },
];

function mushroom(name: string, x: number, z: number, size: number, cap: string): Command[] {
    const h = 0.9 * size;
    return [
        add("cylinder", `${name} stem`, { radiusTop: 0.34 * size, radiusBottom: 0.44 * size, height: h }, [x, h / 2, z], "#f1e6cf"),
        add("halfSphere", `${name} cap`, { radius: 0.75 * size }, [x, h, z], cap, { scale: [1, 0.8, 1] }),
        add("box", `${name} door`, { width: 0.22 * size, height: 0.4 * size, depth: 0.04 }, [x, 0.2 * size, z + 0.43 * size], "#8b5a2b"),
        add("sphere", `${name} window`, { radius: 0.08 * size }, [x + 0.18 * size, 0.6 * size, z + 0.36 * size], "#ffd98a", { scale: [1, 1, 0.4] }),
        ...[
            [0.3, 0.3, 0.45],
            [-0.35, 0.25, 0.35],
            [0.05, 0.55, 0.3],
            [-0.1, 0.35, -0.5],
        ].map(([dx, dy, dz], i) => add("sphere", `${name} spot ${i + 1}`, { radius: 0.09 * size }, [x + dx * size, h + dy * size, z + dz * size], "#ffffff")),
    ];
}

const village: Command[] = [
    add("cylinder", "Meadow", { radiusTop: 3.4, radiusBottom: 3.2, height: 0.24 }, [0, -0.12, 0], "#77b55a"),
    ...mushroom("Red house", -0.9, -0.4, 1.2, "#d9453b"),
    ...mushroom("Orange house", 1.2, -0.8, 0.9, "#f28c28"),
    ...mushroom("Purple house", 0.6, 1.2, 0.75, "#9b59d0"),
    ...[
        [-0.2, 0.8],
        [0.15, 1.4],
        [-0.5, 1.9],
        [0.9, 0.3],
    ].map(([x, z], i) => add("cylinder", `Stone ${i + 1}`, { radiusTop: 0.16, radiusBottom: 0.18, height: 0.04 }, [x, 0.02, z], "#d6d0c4")),
    ...[
        [-2.1, 0.9, "#f5c542"],
        [-1.8, 1.4, "#ec4899"],
        [2.1, 0.6, "#f5f5f7"],
        [1.9, 1.5, "#f5c542"],
        [-2.3, -1.5, "#ec4899"],
    ].flatMap(([x, z, color], i) => [
        add("cylinder", `Flower stem ${i + 1}`, { radiusTop: 0.015, radiusBottom: 0.015, height: 0.3 }, [x as number, 0.15, z as number], "#3b9a5a"),
        add("sphere", `Flower ${i + 1}`, { radius: 0.08 }, [x as number, 0.33, z as number], color as string),
    ]),
    add("cylinder", "Lantern post", { radiusTop: 0.03, radiusBottom: 0.03, height: 0.8 }, [0.3, 0.4, 0.4], "#3a3a40"),
    add("sphere", "Lantern", { radius: 0.09 }, [0.3, 0.84, 0.4], "#ffe7a8"),
    glow("Lantern", "#ffcf6e", 1.5),
    ...pine("Pine 1", -2.2, -0.5, 0.9),
    ...pine("Pine 2", 2.4, -1.6, 1.1),
    { type: "environment", preset: "sunset" },
];

const WOOD = "#b88457";
const desk: Command[] = [
    add("cylinder", "Rug", { radiusTop: 2.2, radiusBottom: 2.2, height: 0.03 }, [0, 0.015, 0.2], "#c9b8e6"),
    add("box", "Desk", { width: 2.4, height: 0.1, depth: 1.1 }, [0, 1.0, 0], WOOD),
    ...[
        [1.1, 0.45],
        [-1.1, 0.45],
        [1.1, -0.45],
        [-1.1, -0.45],
    ].map(([x, z], i) => add("cylinder", `Leg ${i + 1}`, { radiusTop: 0.04, radiusBottom: 0.04, height: 0.95 }, [x, 0.475, z], "#3a3a40")),
    add("box", "Monitor", { width: 1.2, height: 0.7, depth: 0.05 }, [0, 1.78, -0.32], "#1d1d22"),
    add("box", "Screen", { width: 1.1, height: 0.6, depth: 0.02 }, [0, 1.78, -0.29], "#4f7bff"),
    glow("Screen", "#4f7bff", 0.7),
    add("cylinder", "Stand", { radiusTop: 0.05, radiusBottom: 0.05, height: 0.36 }, [0, 1.25, -0.34], "#3a3a40"),
    add("box", "Stand base", { width: 0.36, height: 0.03, depth: 0.26 }, [0, 1.065, -0.34], "#3a3a40"),
    add("box", "Keyboard", { width: 0.8, height: 0.04, depth: 0.25 }, [-0.05, 1.07, 0.15], "#e8e8ec"),
    add("sphere", "Mouse", { radius: 0.07 }, [0.6, 1.07, 0.18], "#e8e8ec", { scale: [0.8, 0.45, 1.2] }),
    add("tube", "Mug", { radius: 0.09, thickness: 0.02, height: 0.18 }, [-0.7, 1.14, 0.32], "#e5484d"),
    add("torus", "Mug handle", { radius: 0.05, tube: 0.015 }, [-0.61, 1.15, 0.32], "#e5484d"),
    add("cylinder", "Lamp base", { radiusTop: 0.12, radiusBottom: 0.13, height: 0.04 }, [0.95, 1.07, -0.3], "#2d2f36"),
    add("cylinder", "Lamp arm", { radiusTop: 0.02, radiusBottom: 0.02, height: 0.62 }, [0.88, 1.37, -0.3], "#2d2f36", { rotation: [0, 0, 0.25] }),
    add("cone", "Lamp shade", { radius: 0.13, height: 0.2 }, [0.78, 1.7, -0.25], "#f5c542", { rotation: [0.2, 0, 2.6] }),
    glow("Lamp shade", "#ffcf6e", 0.6),
    add("tube", "Pot", { radius: 0.12, thickness: 0.02, height: 0.2 }, [-1.0, 1.15, -0.35], "#c8693d"),
    ...[
        [0, 0.12, 0, 0.12],
        [0.08, 0.2, 0.04, 0.09],
        [-0.07, 0.22, -0.03, 0.1],
        [0.01, 0.3, -0.02, 0.08],
    ].map(([dx, dy, dz, r], i) => add("sphere", `Leaf ${i + 1}`, { radius: r }, [-1.0 + dx, 1.25 + dy, -0.35 + dz], "#3b9a5a")),
    ...["#4f7bff", "#22c55e", "#f5a524"].map((color, i) => add("box", `Book ${i + 1}`, { width: 0.42, height: 0.06, depth: 0.3 }, [-0.5, 1.08 + i * 0.06, -0.35], color, { rotation: [0, i * 0.12, 0] })),
    add("box", "Seat", { width: 0.6, height: 0.08, depth: 0.6 }, [0.9, 0.55, 1.05], "#3b3f4a"),
    add("box", "Backrest", { width: 0.6, height: 0.6, depth: 0.06 }, [0.9, 0.9, 1.34], "#3b3f4a"),
    add("cylinder", "Chair post", { radiusTop: 0.04, radiusBottom: 0.04, height: 0.48 }, [0.9, 0.27, 1.05], "#9aa0ab"),
    add("polygon", "Chair base", { radius: 0.34, sides: 5, height: 0.04 }, [0.9, 0.04, 1.05], "#3a3a40"),
    { type: "environment", preset: "studio" },
];

export const SAMPLES: Template[] = [
    { id: "castle", name: "Hilltop castle", blurb: "Towers, walls and a flag on a hill", commands: castle },
    { id: "robot", name: "Friendly robot", blurb: "Glowing eyes and claw hands", commands: robot },
    { id: "lighthouse", name: "Lighthouse cove", blurb: "A lighthouse, a cottage and a little boat", commands: lighthouse },
    { id: "windmill", name: "Windmill farm", blurb: "Sails that turn on the timeline", commands: windmill },
    { id: "station", name: "Orbital station", blurb: "A spinning ring above a planet", commands: station },
    { id: "balloon", name: "Up and away", blurb: "A hot air balloon over the hills", commands: balloon },
    { id: "village", name: "Mushroom village", blurb: "Three little houses and a lantern", commands: village },
    { id: "desk", name: "Cozy desk", blurb: "A desk setup, down to the mug", commands: desk },
];
