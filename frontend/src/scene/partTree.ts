import type { SceneObject } from "@shapeshift/shared/scene/schema";

export type PartNode = {
    key: string;
    name: string;
    depth: number;
    // Every object at or below this node.
    ids: string[];
    children: PartNode[];
    object?: SceneObject;
};

// The scene as a tree: imported models by their assemblies, groups as
// folders, and everything else at the top.
export function buildPartTree(objects: SceneObject[]): PartNode[] {
    const roots: PartNode[] = [];
    const folders = new Map<string, PartNode>();
    for (const o of objects) {
        const path = o.path ?? (o.group ? [o.group] : []);
        let siblings = roots;
        const chain: PartNode[] = [];
        let key = "";
        path.forEach((name, depth) => {
            key += `/${name}`;
            let folder = folders.get(key);
            if (!folder) {
                folder = { key, name, depth, ids: [], children: [] };
                folders.set(key, folder);
                siblings.push(folder);
            }
            chain.push(folder);
            siblings = folder.children;
        });
        for (const folder of chain) folder.ids.push(o.id);
        siblings.push({ key: o.id, name: o.name, depth: path.length, ids: [o.id], children: [], object: o });
    }
    return roots;
}

// The folder keys above an object, outermost first.
export function ancestorKeys(o: SceneObject): string[] {
    const path = o.path ?? (o.group ? [o.group] : []);
    const keys: string[] = [];
    let key = "";
    for (const name of path) keys.push((key += `/${name}`));
    return keys;
}
