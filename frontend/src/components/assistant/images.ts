import type { Attachment } from "../../assistant/store";

export const MAX_ATTACHMENTS = 3;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

function encode(bitmap: ImageBitmap, maxSize: number, quality: number): string {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d")!;
    // JPEG has no alpha, so transparent areas become the app background.
    ctx.fillStyle = "#0d0e10";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
}

// Downscales a picture the user attached: a 1024 px copy for the model and a
// small thumbnail for the chat.
export async function readAttachment(file: File): Promise<Attachment> {
    if (!file.type.startsWith("image/")) throw new Error("Only images can be attached.");
    if (file.size > MAX_INPUT_BYTES) throw new Error("That image is too large. Try one under 20 MB.");
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        throw new Error("Couldn't read that image.");
    }
    try {
        const full = encode(bitmap, 1024, 0.85);
        return { data: full.slice(full.indexOf(",") + 1), thumbnail: encode(bitmap, 160, 0.7) };
    } finally {
        bitmap.close();
    }
}
