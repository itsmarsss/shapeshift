import { produce } from "immer";
import { nanoid } from "nanoid";
import type { Command, Primitive, SceneDoc, Vec3 } from "@shapeshift/shared/scene/schema";
import { applyCommand, freeSpot } from "./commands";
import { emptyDoc, useScene } from "./store";
import { frameSelection } from "../viewport/frame";

// Ready-made objects built from the app's own shapes, so they match its look,
// work offline and stay editable part by part. Each goes in as one group.

type Part = { primitive: Primitive; name: string; geometry: Record<string, number>; at: Vec3; rotation?: Vec3; scale?: Vec3; color: string };

export type LibraryItem = { id: string; name: string; parts: Part[] };

const WOOD = "#8b5a2b";
const LIGHT_WOOD = "#c49a6c";
const LEAF = "#46a758";
const PINE = "#2f7d3a";
const BARK = "#7a5230";
const STEEL = "#4b4f58";
const RED = "#e5484d";

const legs = (x: number, z: number, height: number, radius: number, color: string): Part[] =>
    [
        [x, z],
        [-x, z],
        [x, -z],
        [-x, -z],
    ].map(([px, pz], i) => ({ primitive: "cylinder", name: `Leg ${i + 1}`, geometry: { radiusTop: radius, radiusBottom: radius, height }, at: [px, height / 2, pz], color }));

export const LIBRARY: LibraryItem[] = [
    {
        id: "chair",
        name: "Chair",
        parts: [
            { primitive: "box", name: "Seat", geometry: { width: 0.5, height: 0.06, depth: 0.5 }, at: [0, 0.48, 0], color: WOOD },
            { primitive: "box", name: "Back", geometry: { width: 0.5, height: 0.5, depth: 0.05 }, at: [0, 0.76, -0.225], color: WOOD },
            ...legs(0.21, 0.21, 0.45, 0.03, WOOD),
        ],
    },
    {
        id: "table",
        name: "Table",
        parts: [{ primitive: "box", name: "Top", geometry: { width: 1.2, height: 0.06, depth: 0.7 }, at: [0, 0.75, 0], color: LIGHT_WOOD }, ...legs(0.53, 0.28, 0.72, 0.04, LIGHT_WOOD)],
    },
    {
        id: "tree",
        name: "Tree",
        parts: [
            { primitive: "cylinder", name: "Trunk", geometry: { radiusTop: 0.1, radiusBottom: 0.12, height: 0.8 }, at: [0, 0.4, 0], color: BARK },
            { primitive: "sphere", name: "Leaves", geometry: { radius: 0.45 }, at: [0, 1.15, 0], color: LEAF },
        ],
    },
    {
        id: "pine",
        name: "Pine tree",
        parts: [
            { primitive: "cylinder", name: "Trunk", geometry: { radiusTop: 0.08, radiusBottom: 0.1, height: 0.5 }, at: [0, 0.25, 0], color: BARK },
            { primitive: "cone", name: "Lower branches", geometry: { radius: 0.55, height: 0.8 }, at: [0, 0.8, 0], color: PINE },
            { primitive: "cone", name: "Middle branches", geometry: { radius: 0.42, height: 0.7 }, at: [0, 1.2, 0], color: PINE },
            { primitive: "cone", name: "Top branches", geometry: { radius: 0.28, height: 0.55 }, at: [0, 1.55, 0], color: PINE },
        ],
    },
    {
        id: "lamp",
        name: "Lamp",
        parts: [
            { primitive: "cylinder", name: "Base", geometry: { radiusTop: 0.18, radiusBottom: 0.2, height: 0.05 }, at: [0, 0.025, 0], color: STEEL },
            { primitive: "cylinder", name: "Pole", geometry: { radiusTop: 0.025, radiusBottom: 0.025, height: 1.2 }, at: [0, 0.65, 0], color: STEEL },
            { primitive: "sphere", name: "Bulb", geometry: { radius: 0.08 }, at: [0, 1.22, 0], color: "#fff6cc" },
            { primitive: "cone", name: "Shade", geometry: { radius: 0.25, height: 0.3 }, at: [0, 1.32, 0], color: "#f5c518" },
        ],
    },
    {
        id: "car",
        name: "Car",
        parts: [
            { primitive: "box", name: "Body", geometry: { width: 1.6, height: 0.4, depth: 0.8 }, at: [0, 0.38, 0], color: RED },
            { primitive: "box", name: "Cabin", geometry: { width: 0.9, height: 0.35, depth: 0.7 }, at: [-0.1, 0.75, 0], color: "#a0e7e5" },
            ...[
                [0.5, 0.42],
                [-0.5, 0.42],
                [0.5, -0.42],
                [-0.5, -0.42],
            ].map(([x, z], i): Part => ({
                primitive: "cylinder",
                name: `Wheel ${i + 1}`,
                geometry: { radiusTop: 0.18, radiusBottom: 0.18, height: 0.12 },
                at: [x, 0.18, z],
                rotation: [Math.PI / 2, 0, 0],
                color: "#1d1d1f",
            })),
        ],
    },
    {
        id: "rocket",
        name: "Rocket",
        parts: [
            { primitive: "cylinder", name: "Body", geometry: { radiusTop: 0.25, radiusBottom: 0.25, height: 1.4 }, at: [0, 0.75, 0], color: "#ffffff" },
            { primitive: "cone", name: "Nose", geometry: { radius: 0.25, height: 0.5 }, at: [0, 1.7, 0], color: RED },
            { primitive: "sphere", name: "Window", geometry: { radius: 0.1 }, at: [0, 1.05, 0.22], color: "#3e8ed0" },
            ...[0, (2 * Math.PI) / 3, (-2 * Math.PI) / 3].map(
                (a, i): Part => ({
                    primitive: "box",
                    name: `Fin ${i + 1}`,
                    geometry: { width: 0.05, height: 0.4, depth: 0.35 },
                    at: [Math.cos(a) * 0.3, 0.2, -Math.sin(a) * 0.3],
                    rotation: [0, a, 0],
                    color: RED,
                })
            ),
        ],
    },
    {
        id: "mug",
        name: "Mug",
        parts: [
            { primitive: "cylinder", name: "Cup", geometry: { radiusTop: 0.2, radiusBottom: 0.18, height: 0.35 }, at: [0, 0.175, 0], color: "#3e8ed0" },
            { primitive: "torus", name: "Handle", geometry: { radius: 0.1, tube: 0.03 }, at: [0.22, 0.18, 0], rotation: [0, 0, 0], color: "#3e8ed0" },
        ],
    },
    {
        id: "flower",
        name: "Flower",
        parts: [
            { primitive: "cylinder", name: "Pot", geometry: { radiusTop: 0.14, radiusBottom: 0.1, height: 0.2 }, at: [0, 0.1, 0], color: "#c4532d" },
            { primitive: "cylinder", name: "Stem", geometry: { radiusTop: 0.02, radiusBottom: 0.02, height: 0.6 }, at: [0, 0.4, 0], color: LEAF },
            { primitive: "sphere", name: "Middle", geometry: { radius: 0.08 }, at: [0, 0.72, 0], color: "#f5c518" },
            ...[0, 1, 2, 3, 4].map((i): Part => {
                const a = (i / 5) * Math.PI * 2;
                return { primitive: "sphere", name: `Petal ${i + 1}`, geometry: { radius: 0.07 }, at: [Math.cos(a) * 0.13, 0.72, Math.sin(a) * 0.13], scale: [1, 0.5, 1], color: "#ff8fa3" };
            }),
        ],
    },
];

function addCommands(item: LibraryItem, x: number, z: number): Command[] {
    return item.parts.map(
        (p) =>
            ({
                type: "add",
                primitive: p.primitive,
                name: p.name,
                geometry: { type: p.primitive, ...p.geometry },
                position: [p.at[0] + x, p.at[1], p.at[2] + z],
                ...(p.rotation ? { rotation: p.rotation } : {}),
                ...(p.scale ? { scale: p.scale } : {}),
                color: p.color,
            }) as Command
    );
}

function groupName(doc: SceneDoc, name: string) {
    const used = new Set(doc.objects.map((o) => o.group).filter(Boolean));
    if (!used.has(name)) return name;
    for (let i = 2; ; i++) if (!used.has(`${name} ${i}`)) return `${name} ${i}`;
}

// Puts an object in an empty spot on the floor, grouped and selected, as one
// undo step.
export function insertLibraryItem(item: LibraryItem) {
    const { doc, run, endCoalesce, selectMany } = useScene.getState();
    const [x, z] = freeSpot(doc);
    const key = `library:${item.id}:${Date.now()}`;
    const results = run(addCommands(item, x, z), { coalesce: key, select: false });
    const ids = results.flatMap((r) => (r.ok ? r.created : []));
    if (!ids.length) return;
    run({ type: "group", name: groupName(useScene.getState().doc, item.name), targets: ids }, { coalesce: key, select: false });
    endCoalesce();
    // The first part (a car's body, a chair's seat) leads the selection, so the
    // inspector names it rather than the last wheel or leg.
    selectMany([...ids.slice(1), ids[0]]);
    // It may land out of view, especially on a phone; show it.
    frameSelection();
}

// The object on its own, for its picture in the picker.
export function libraryPreview(item: LibraryItem): SceneDoc {
    return produce(emptyDoc(), (draft) => {
        for (const cmd of addCommands(item, 0, 0)) applyCommand(draft, cmd, () => nanoid(8));
    });
}
