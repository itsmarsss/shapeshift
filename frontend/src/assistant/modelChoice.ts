import { useEffect } from "react";
import type { ModelChoice } from "@shapeshift/shared/assistant/models";
import { useSettings } from "../settings/store";
import { useAssistant } from "./store";

// The assistant models this server offers and the one picked in Settings
// (the server's default until one is). Null while that's still loading, or
// when there's only one to choose from.
export function useModelChoice(): { choices: ModelChoice[]; current: ModelChoice; pick: (id: string) => void } | null {
    const info = useAssistant((s) => s.info);
    const loadInfo = useAssistant((s) => s.loadInfo);
    const picked = useSettings((s) => s.assistantModel);
    const set = useSettings((s) => s.set);
    useEffect(() => loadInfo(), [loadInfo]);
    const choices = info?.choices ?? [];
    if (choices.length < 2) return null;
    const current = choices.find((c) => c.id === picked) ?? choices.find((c) => c.id === info?.default) ?? choices[0]!;
    return { choices, current, pick: (id) => set({ assistantModel: id }) };
}
