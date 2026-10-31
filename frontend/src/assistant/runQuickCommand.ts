import type { QuickCommand } from "./quickCommands";
import { useScene } from "../scene/store";
import { duplicateSelection, removeSelection } from "../scene/selection";
import { frameSelection, resetView } from "../viewport/frame";
import { useUI } from "../ui/store";

const MODE_NAME = { object: "Arrange", edit: "Reshape", render: "Preview" } as const;

// Does a quick command and says what happened, to show under the message field.
export function runQuickCommand(command: QuickCommand): string {
    const scene = useScene.getState();
    const selected = scene.selectedIds.length > 0;
    switch (command.type) {
        case "undo":
            if (!scene.past.length) return "Nothing to undo";
            scene.undo();
            return "Undone";
        case "redo":
            if (!scene.future.length) return "Nothing to redo";
            scene.redo();
            return "Redone";
        case "delete":
            if (!selected) return "Pick something to delete first";
            removeSelection();
            return "Deleted";
        case "duplicate":
            if (!selected) return "Pick something to duplicate first";
            duplicateSelection();
            return "Duplicated";
        case "add":
            scene.run({ type: "add", primitive: command.primitive });
            return "Added";
        case "fit":
            frameSelection();
            return "Fitted in view";
        case "resetView":
            resetView();
            return "View reset";
        case "selectAll":
            scene.selectMany(scene.doc.objects.map((o) => o.id));
            return "Selected everything";
        case "deselect":
            scene.select(null);
            return "Nothing selected";
        case "mode":
            scene.setMode(command.mode);
            return `${MODE_NAME[command.mode]} mode`;
        case "closeAssistant":
            useUI.getState().setShowChat(false);
            return "";
    }
}
