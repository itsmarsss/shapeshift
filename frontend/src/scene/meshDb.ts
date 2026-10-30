// Imported meshes kept in IndexedDB by hash, so a scene with big models
// survives a reload without the meshes ever going into the scene document.
// Works in the import worker as well as on the page.

const NAME = "shapeshift-meshes";
const STORE = "meshes";

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    opening ??= new Promise((resolve) => {
        const request = indexedDB.open(NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
    });
    return opening;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
    return open().then(
        (db) =>
            new Promise<T | undefined>((resolve) => {
                if (!db) return resolve(undefined);
                try {
                    const request = fn(db.transaction(STORE, mode).objectStore(STORE));
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => resolve(undefined);
                } catch {
                    resolve(undefined);
                }
            })
    );
}

export async function readStoredMesh(hash: string): Promise<ArrayBuffer | null> {
    const value = await run<unknown>("readonly", (s) => s.get(hash));
    return value instanceof ArrayBuffer ? value : null;
}

export async function storeMesh(hash: string, buffer: ArrayBuffer): Promise<void> {
    await run("readwrite", (s) => s.put(buffer, hash));
}
