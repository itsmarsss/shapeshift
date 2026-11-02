import { produce } from "immer";
import { nanoid } from "nanoid";
import type { Command, Keyframe, SceneDoc, Vec3 } from "@shapeshift/shared/scene/schema";
import { applyCommand } from "./commands";
import { emptyDoc } from "./store";

export type Template = {
    id: string;
    name: string;
    blurb: string;
    commands: Command[];
};

// Points around a circle, as keyframes that loop smoothly.
function orbit(radius: number, height: number, seconds: number, offset = 0): Keyframe[] {
    const steps = 12;
    return Array.from({ length: steps + 1 }, (_, i) => {
        const a = offset + (i / steps) * Math.PI * 2;
        return { time: (i / steps) * seconds, value: [Math.cos(a) * radius, height, Math.sin(a) * radius] as Vec3, easing: "linear" as const };
    });
}

const snowman: Command[] = [
    { type: "add", primitive: "plane", name: "Snow", geometry: { type: "plane", width: 8, height: 8 }, position: [0, 0, 0], color: "#f4f7fb" },
    { type: "add", primitive: "sphere", name: "Bottom", geometry: { type: "sphere", radius: 0.8 }, position: [0, 0.75, 0], color: "#ffffff" },
    { type: "add", primitive: "sphere", name: "Middle", geometry: { type: "sphere", radius: 0.58 }, position: [0, 1.9, 0], color: "#ffffff" },
    { type: "add", primitive: "sphere", name: "Head", geometry: { type: "sphere", radius: 0.42 }, position: [0, 2.75, 0], color: "#ffffff" },
    { type: "add", primitive: "cone", name: "Carrot nose", geometry: { type: "cone", radius: 0.07, height: 0.4 }, position: [0, 2.75, 0.55], rotation: [Math.PI / 2, 0, 0], color: "#f28c28" },
    { type: "add", primitive: "sphere", name: "Left eye", geometry: { type: "sphere", radius: 0.05 }, position: [-0.15, 2.88, 0.37], color: "#1d1d1f" },
    { type: "add", primitive: "sphere", name: "Right eye", geometry: { type: "sphere", radius: 0.05 }, position: [0.15, 2.88, 0.37], color: "#1d1d1f" },
    { type: "add", primitive: "cylinder", name: "Hat brim", geometry: { type: "cylinder", radiusTop: 0.5, radiusBottom: 0.5, height: 0.05 }, position: [0, 3.12, 0], color: "#26262b" },
    { type: "add", primitive: "cylinder", name: "Hat", geometry: { type: "cylinder", radiusTop: 0.3, radiusBottom: 0.3, height: 0.45 }, position: [0, 3.36, 0], color: "#26262b" },
    { type: "add", primitive: "torus", name: "Scarf", geometry: { type: "torus", radius: 0.4, tube: 0.08 }, position: [0, 2.38, 0], rotation: [Math.PI / 2, 0, 0], color: "#d64545" },
    { type: "group", name: "Snowman", targets: ["Bottom", "Middle", "Head", "Carrot nose", "Left eye", "Right eye", "Hat brim", "Hat", "Scarf"] },
];

const solarSystem: Command[] = [
    { type: "add", primitive: "sphere", name: "Sun", geometry: { type: "sphere", radius: 1 }, position: [0, 1.5, 0], color: "#ffb02e" },
    { type: "material", target: "Sun", emissive: "#ffa000", emissiveIntensity: 2.5 },
    { type: "add", primitive: "sphere", name: "Mercury", geometry: { type: "sphere", radius: 0.15 }, position: [1.8, 1.5, 0], color: "#a39e96" },
    { type: "add", primitive: "sphere", name: "Earth", geometry: { type: "sphere", radius: 0.3 }, position: [3, 1.5, 0], color: "#3b7dd8" },
    { type: "add", primitive: "sphere", name: "Mars", geometry: { type: "sphere", radius: 0.22 }, position: [4.2, 1.5, 0], color: "#c4532d" },
    { type: "add", primitive: "torus", name: "Earth's orbit", geometry: { type: "torus", radius: 3, tube: 0.01 }, position: [0, 1.5, 0], rotation: [Math.PI / 2, 0, 0], color: "#5a6070" },
    { type: "timeline", duration: 8, loop: true },
    { type: "animate", target: "Mercury", property: "position", keys: orbit(1.8, 1.5, 2) },
    { type: "animate", target: "Earth", property: "position", keys: orbit(3, 1.5, 8, 1) },
    { type: "animate", target: "Mars", property: "position", keys: orbit(4.2, 1.5, 8, 2.5) },
    { type: "environment", preset: "night" },
];

const house: Command[] = [
    { type: "add", primitive: "plane", name: "Lawn", geometry: { type: "plane", width: 10, height: 10 }, position: [0, 0, 0], color: "#6fae4f" },
    { type: "add", primitive: "box", name: "Walls", geometry: { type: "box", width: 2.4, height: 1.8, depth: 2 }, position: [0, 0.9, 0], color: "#f1e3c8" },
    { type: "add", primitive: "box", name: "Roof", geometry: { type: "box", width: 2, height: 2, depth: 2.3 }, position: [0, 1.8, 0], rotation: [0, 0, Math.PI / 4], scale: [0.95, 0.95, 1], color: "#b5483a" },
    { type: "add", primitive: "box", name: "Door", geometry: { type: "box", width: 0.5, height: 0.9, depth: 0.05 }, position: [0, 0.45, 1.01], color: "#6b4226" },
    { type: "add", primitive: "box", name: "Window", geometry: { type: "box", width: 0.45, height: 0.45, depth: 0.05 }, position: [0.75, 1.1, 1.01], color: "#a8d8ff" },
    { type: "add", primitive: "box", name: "Chimney", geometry: { type: "box", width: 0.3, height: 0.8, depth: 0.3 }, position: [0.7, 2.6, -0.4], color: "#8a8f99" },
    { type: "add", primitive: "cylinder", name: "Trunk", geometry: { type: "cylinder", radiusTop: 0.12, radiusBottom: 0.15, height: 0.8 }, position: [-2.4, 0.4, 0.8], color: "#7a5230" },
    { type: "add", primitive: "cone", name: "Leaves", geometry: { type: "cone", radius: 0.7, height: 1.6 }, position: [-2.4, 1.6, 0.8], color: "#2f7d3a" },
    { type: "group", name: "House", targets: ["Walls", "Roof", "Door", "Window", "Chimney"] },
    { type: "group", name: "Tree", targets: ["Trunk", "Leaves"] },
    { type: "environment", preset: "sunset" },
];

// Water: an oxygen with two hydrogens 104.5 degrees apart.
const bond = (Math.PI * 104.5) / 180 / 2;
const water: Command[] = [
    { type: "add", primitive: "sphere", name: "Oxygen", geometry: { type: "sphere", radius: 0.6 }, position: [0, 1.5, 0], color: "#e0403a" },
    { type: "add", primitive: "sphere", name: "Hydrogen 1", geometry: { type: "sphere", radius: 0.35 }, position: [Math.sin(bond) * 1.4, 1.5 - Math.cos(bond) * 1.4, 0], color: "#f2f2f2" },
    { type: "add", primitive: "sphere", name: "Hydrogen 2", geometry: { type: "sphere", radius: 0.35 }, position: [-Math.sin(bond) * 1.4, 1.5 - Math.cos(bond) * 1.4, 0], color: "#f2f2f2" },
    { type: "add", primitive: "cylinder", name: "Bond 1", geometry: { type: "cylinder", radiusTop: 0.08, radiusBottom: 0.08, height: 1.4 }, position: [Math.sin(bond) * 0.7, 1.5 - Math.cos(bond) * 0.7, 0], rotation: [0, 0, bond], color: "#b8bcc6" },
    { type: "add", primitive: "cylinder", name: "Bond 2", geometry: { type: "cylinder", radiusTop: 0.08, radiusBottom: 0.08, height: 1.4 }, position: [-Math.sin(bond) * 0.7, 1.5 - Math.cos(bond) * 0.7, 0], rotation: [0, 0, -bond], color: "#b8bcc6" },
    { type: "group", name: "Water molecule", targets: ["Oxygen", "Hydrogen 1", "Hydrogen 2", "Bond 1", "Bond 2"] },
    { type: "environment", preset: "studio" },
];

const productShot: Command[] = [
    { type: "add", primitive: "cylinder", name: "Pedestal", geometry: { type: "cylinder", radiusTop: 1.1, radiusBottom: 1.1, height: 0.6 }, position: [0, 0.3, 0], color: "#ececef" },
    { type: "add", primitive: "torus", name: "Ring", geometry: { type: "torus", radius: 0.55, tube: 0.18 }, position: [0, 1.35, 0], color: "#d4af37" },
    { type: "material", target: "Ring", metalness: 1, roughness: 0.2 },
    { type: "addLight", light: "spot", name: "Key light", position: [2.5, 4, 2.5], aim: [0, 1, 0], intensity: 80, angle: 0.5 },
    { type: "timeline", duration: 6, loop: true },
    {
        type: "animate",
        target: "Ring",
        property: "rotation",
        keys: [
            { time: 0, value: [0, 0, 0], easing: "linear" },
            { time: 6, value: [0, Math.PI * 2, 0], easing: "linear" },
        ],
    },
    { type: "environment", preset: "studio" },
];


// A cabin by a lake, all from basic shapes: the landing page shows it off.
function pine(name: string, x: number, z: number, size = 1): Command[] {
    return [
        { type: "add", primitive: "cylinder", name: `${name} trunk`, geometry: { type: "cylinder", radiusTop: 0.08 * size, radiusBottom: 0.11 * size, height: 0.5 * size }, position: [x, 0.25 * size, z], color: "#6b4a30" },
        { type: "add", primitive: "cone", name: `${name} lower`, geometry: { type: "cone", radius: 0.62 * size, height: 1.0 * size }, position: [x, 0.85 * size, z], color: "#2f7d4a" },
        { type: "add", primitive: "cone", name: `${name} upper`, geometry: { type: "cone", radius: 0.45 * size, height: 0.8 * size }, position: [x, 1.4 * size, z], color: "#3b9a5a" },
        { type: "group", name, targets: [`${name} trunk`, `${name} lower`, `${name} upper`] },
    ];
}

const cabin: Command[] = [
    { type: "add", primitive: "cylinder", name: "Island", geometry: { type: "cylinder", radiusTop: 4, radiusBottom: 3.7, height: 0.4 }, position: [0, -0.2, 0], color: "#7cb36a" },
    { type: "add", primitive: "cylinder", name: "Lake", geometry: { type: "cylinder", radiusTop: 1.3, radiusBottom: 1.3, height: 0.06 }, position: [2.2, 0.02, 1.2], color: "#5aa6d6" },
    { type: "material", target: "Lake", roughness: 0.15, metalness: 0.1 },
    { type: "add", primitive: "box", name: "Walls", geometry: { type: "box", width: 2.2, height: 1.4, depth: 1.8 }, position: [-0.5, 0.7, -0.5], color: "#c98b5b" },
    { type: "add", primitive: "roof", name: "Roof", geometry: { type: "roof", width: 2.7, height: 1.0, depth: 2.2 }, position: [-0.5, 1.9, -0.5], color: "#5b3a2a" },
    { type: "add", primitive: "box", name: "Door", geometry: { type: "box", width: 0.45, height: 0.8, depth: 0.06 }, position: [-0.5, 0.4, 0.42], color: "#3f2a1e" },
    { type: "add", primitive: "box", name: "Left window", geometry: { type: "box", width: 0.4, height: 0.4, depth: 0.06 }, position: [-1.15, 0.85, 0.42], color: "#ffd98a" },
    { type: "add", primitive: "box", name: "Right window", geometry: { type: "box", width: 0.4, height: 0.4, depth: 0.06 }, position: [0.15, 0.85, 0.42], color: "#ffd98a" },
    { type: "material", target: "Left window", emissive: "#ffb648", emissiveIntensity: 0.8 },
    { type: "material", target: "Right window", emissive: "#ffb648", emissiveIntensity: 0.8 },
    { type: "add", primitive: "box", name: "Chimney", geometry: { type: "box", width: 0.3, height: 0.9, depth: 0.3 }, position: [0.2, 2.25, -1.0], color: "#8d8f96" },
    { type: "add", primitive: "box", name: "Step", geometry: { type: "box", width: 0.9, height: 0.12, depth: 0.4 }, position: [-0.5, 0.06, 0.65], color: "#a0714b" },
    { type: "group", name: "Cabin", targets: ["Walls", "Roof", "Door", "Left window", "Right window", "Chimney", "Step"] },
    { type: "add", primitive: "box", name: "Dock", geometry: { type: "box", width: 1.1, height: 0.06, depth: 0.36 }, position: [1.3, 0.08, 1.0], color: "#a0714b" },
    { type: "add", primitive: "cylinder", name: "Stone 1", geometry: { type: "cylinder", radiusTop: 0.2, radiusBottom: 0.22, height: 0.05 }, position: [-0.35, 0.02, 1.1], color: "#c9c5bd" },
    { type: "add", primitive: "cylinder", name: "Stone 2", geometry: { type: "cylinder", radiusTop: 0.18, radiusBottom: 0.2, height: 0.05 }, position: [-0.1, 0.02, 1.65], color: "#c9c5bd" },
    { type: "add", primitive: "cylinder", name: "Stone 3", geometry: { type: "cylinder", radiusTop: 0.2, radiusBottom: 0.22, height: 0.05 }, position: [0.25, 0.02, 2.2], color: "#c9c5bd" },
    { type: "add", primitive: "sphere", name: "Rock", geometry: { type: "sphere", radius: 0.26 }, position: [3.3, 0.12, 0.2], scale: [1, 0.7, 0.9], color: "#9a9ca3" },
    { type: "add", primitive: "sphere", name: "Bush", geometry: { type: "sphere", radius: 0.3 }, position: [-1.75, 0.22, 0.45], color: "#4fa35e" },
    { type: "add", primitive: "cylinder", name: "Lamp post", geometry: { type: "cylinder", radiusTop: 0.035, radiusBottom: 0.045, height: 1.1 }, position: [0.55, 0.55, 1.05], color: "#2d2f36" },
    { type: "add", primitive: "sphere", name: "Lamp", geometry: { type: "sphere", radius: 0.11 }, position: [0.55, 1.15, 1.05], color: "#ffe7a8" },
    { type: "material", target: "Lamp", emissive: "#ffcf6e", emissiveIntensity: 1.5 },
    ...pine("Pine 1", -2.6, -1.5, 1.2),
    ...pine("Pine 2", -2.9, 0.9),
    ...pine("Pine 3", 1.4, -2.3, 1.35),
    ...pine("Pine 4", 2.9, -1.2, 0.85),
    { type: "environment", preset: "sunset" },
];

export const TEMPLATES: Template[] = [
    { id: "cabin", name: "Lakeside cabin", blurb: "A cabin, pines and a lake, all from basic shapes", commands: cabin },
    { id: "snowman", name: "Snowman", blurb: "Stacked shapes, grouped together", commands: snowman },
    { id: "solar-system", name: "Solar system", blurb: "Planets orbiting on the timeline", commands: solarSystem },
    { id: "house", name: "House and tree", blurb: "A little scene to make your own", commands: house },
    { id: "water", name: "Water molecule", blurb: "H₂O with real bond angles", commands: water },
    { id: "product", name: "Product shot", blurb: "A spinning ring on a pedestal", commands: productShot },
];

// The scene a template makes, for previews.
export function buildTemplate(template: Template): SceneDoc {
    return produce(emptyDoc(), (draft) => {
        for (const cmd of template.commands) applyCommand(draft, cmd, () => nanoid(8));
    });
}
