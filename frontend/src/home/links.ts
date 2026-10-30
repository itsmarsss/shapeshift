// Links from the scene gallery into the editor. The editor reads them once
// when it opens and then tidies the address bar.
export const editorLinks = {
    blank: "/edit?new=1",
    scene: (id: string) => `/edit?scene=${encodeURIComponent(id)}`,
    template: (id: string) => `/edit?template=${encodeURIComponent(id)}`,
};
