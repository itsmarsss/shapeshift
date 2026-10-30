// The contract between the browser and the Worker's /api/agent endpoint.
// The browser runs the agent loop because the scene lives there: it sends the
// conversation, the Worker asks the model for the next step and streams it
// back, the browser runs the tool calls and sends the results on the next step.
import { z } from "zod";

export const LIMITS = {
    requestBytes: 3_000_000,
    messages: 120,
    promptChars: 4_000,
    sceneChars: 60_000,
    toolResultChars: 20_000,
    imageChars: 600_000,
    toolCallsPerStep: 64,
    stepsPerTurn: 12,
} as const;

export const WireToolCall = z.object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(64),
    arguments: z.string().max(200_000),
});
export type WireToolCall = z.infer<typeof WireToolCall>;

// Provider content blocks (text, thinking, tool_use) kept exactly as the model
// produced them. Claude needs its thinking blocks replayed unchanged on the
// next request; other providers ignore this.
const RawBlock = z.looseObject({ type: z.enum(["text", "thinking", "redacted_thinking", "tool_use"]) });

export const WireMessage = z.discriminatedUnion("role", [
    z.object({
        role: z.literal("user"),
        content: z.string().min(1).max(LIMITS.promptChars),
        scene: z.string().max(LIMITS.sceneChars).optional(),
        // Base64 JPEG reference pictures the user attached.
        images: z.array(z.string().max(LIMITS.imageChars).regex(/^[A-Za-z0-9+/=]+$/)).max(4).optional(),
    }),
    z.object({
        role: z.literal("assistant"),
        content: z.string().max(100_000).nullable(),
        tool_calls: z.array(WireToolCall).max(LIMITS.toolCallsPerStep).optional(),
        raw: z.array(RawBlock).max(256).optional(),
    }),
    z.object({
        role: z.literal("tool"),
        tool_call_id: z.string().min(1).max(128),
        content: z.string().max(LIMITS.toolResultChars),
        is_error: z.boolean().optional(),
        // Base64 JPEG snapshots of the viewport, for models that can see.
        images: z.array(z.string().max(LIMITS.imageChars).regex(/^[A-Za-z0-9+/=]+$/)).max(4).optional(),
    }),
]);
export type WireMessage = z.infer<typeof WireMessage>;
export type WireAssistantMessage = Extract<WireMessage, { role: "assistant" }>;

export const AgentRequest = z.object({
    messages: z.array(WireMessage).min(1).max(LIMITS.messages),
});
export type AgentRequest = z.infer<typeof AgentRequest>;

export type StopReason = "end" | "tool_use" | "max_tokens" | "refusal";

export type AgentErrorCode = "bad_request" | "rate_limited" | "overloaded" | "upstream" | "not_configured" | "internal";

// Newline-delimited JSON events streamed back from /api/agent.
export type AgentEvent =
    | { type: "text"; text: string }
    | { type: "tool_start"; name: string }
    | { type: "message"; message: WireAssistantMessage; stop: StopReason; model: string }
    | { type: "error"; code: AgentErrorCode; error: string; retryAfter?: number };

export type AgentInfo = { provider: "anthropic" | "workers-ai"; model: string };
