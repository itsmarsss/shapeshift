import { useUI } from "../ui/store";

// Opens the assistant and sends it a prompt, as if typed. The assistant is
// loaded on demand, like its panel, to keep the first load small.
export async function askAssistant(prompt: string) {
    useUI.getState().setShowChat(true);
    const { useAssistant } = await import("./store");
    useAssistant.getState().send(prompt);
}
