import { create } from "zustand";
import type { StepResult, SceneSnapshot } from "../agent/types";

interface AgentUiState {
    dryRun: boolean;
    setDryRun: (v: boolean) => void;
    steps: StepResult[];
    setSteps: (s: StepResult[]) => void;
    snapshot: SceneSnapshot | null;
    setSnapshot: (s: SceneSnapshot | null) => void;
    lastExportName: string | null;
    setLastExportName: (n: string | null) => void;
    showTimeline: boolean;
    setShowTimeline: (v: boolean) => void;
    toggleTimeline: () => void;
}

export const useAgentTimeline = create<AgentUiState>()((set) => ({
    dryRun: false,
    setDryRun: (v) => set((s) => ({ ...s, dryRun: v })),
    steps: [],
    setSteps: (steps) => set((s) => ({ ...s, steps })),
    snapshot: null,
    setSnapshot: (snapshot) => set((s) => ({ ...s, snapshot })),
    lastExportName: null,
    setLastExportName: (n) => set((s) => ({ ...s, lastExportName: n })),
    showTimeline: false,
    setShowTimeline: (v) => set((s) => ({ ...s, showTimeline: v })),
    toggleTimeline: () => set((s) => ({ ...s, showTimeline: !s.showTimeline })),
})); 