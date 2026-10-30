import { create } from "zustand";

type ImportState = {
    busy: boolean;
    file: string | null;
    label: string;
    fraction: number | null;
    error: string | null;
    dismiss: () => void;
};

export const useImport = create<ImportState>()((set) => ({
    busy: false,
    file: null,
    label: "",
    fraction: null,
    error: null,
    dismiss: () => set({ error: null, file: null }),
}));

// Loads the readers only when a file is opened.
export function openFiles(files: File[] | FileList) {
    const list = [...files];
    void import("./importFiles").then((m) => m.importFiles(list));
}
