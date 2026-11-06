// The models people can pick for the assistant. The server only runs these,
// and counts a message on a costlier one as more than one prompt, so the
// shared free allowance lasts (dev/text-to-cad-design.md, Model picker).

export const MODEL_IDS = ["fast", "careful", "gpt-oss", "claude"] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export type ModelChoice = {
    id: ModelId;
    label: string;
    detail: string;
    // Prompts a message uses.
    cost: number;
};

type ModelDef = ModelChoice & ({ provider: "workers-ai"; model: string } | { provider: "anthropic" });

export const MODELS: Record<ModelId, ModelDef> = {
    fast: { id: "fast", label: "Fast", detail: "GLM 4.7 Flash. Quick, and builds as well as the others.", cost: 1, provider: "workers-ai", model: "@cf/zai-org/glm-4.7-flash#nothink" },
    careful: { id: "careful", label: "Careful", detail: "GLM 4.7 Flash, thinking before it builds. Slower.", cost: 2, provider: "workers-ai", model: "@cf/zai-org/glm-4.7-flash" },
    "gpt-oss": { id: "gpt-oss", label: "GPT-OSS 120B", detail: "OpenAI's open model. Slow, and often stops early.", cost: 3, provider: "workers-ai", model: "@cf/openai/gpt-oss-120b#low" },
    claude: { id: "claude", label: "Claude", detail: "Anthropic's Claude. The most detailed builds.", cost: 1, provider: "anthropic" },
};

// What a choice shows people.
export const choiceOf = ({ id, label, detail, cost }: ModelDef): ModelChoice => ({ id, label, detail, cost });
