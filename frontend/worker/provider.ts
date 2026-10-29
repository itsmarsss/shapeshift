import type { AgentErrorCode, AgentInfo, StopReason, WireAssistantMessage, WireMessage } from "../src/assistant/protocol";

export type StepCallbacks = {
    onText: (text: string) => void;
    onToolStart: (name: string) => void;
    signal?: AbortSignal;
};

export type StepOutput = { message: WireAssistantMessage; stop: StopReason; model: string };

export type Provider = {
    info: AgentInfo;
    step: (messages: WireMessage[], callbacks: StepCallbacks) => Promise<StepOutput>;
};

export class ProviderError extends Error {
    readonly code: AgentErrorCode;
    readonly retryAfter?: number;
    constructor(code: AgentErrorCode, message: string, retryAfter?: number) {
        super(message);
        this.code = code;
        this.retryAfter = retryAfter;
    }
}

// The scene snapshot travels with the prompt it belongs to, so earlier turns
// stay byte-identical from one request to the next.
export function userText(m: Extract<WireMessage, { role: "user" }>): string {
    return m.scene ? `${m.content}\n\n<scene>\n${m.scene}\n</scene>` : m.content;
}
