const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// HTML to paste into another site to show a shared scene.
export function embedCode(origin: string, slug: string, title: string) {
    return `<iframe src="${origin}/s/${slug}?embed=1" width="640" height="400" style="border:0;border-radius:12px;max-width:100%" allow="fullscreen" loading="lazy" title="${escape(title)} · ShapeShift"></iframe>`;
}
