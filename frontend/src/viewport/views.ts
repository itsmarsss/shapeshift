export const VIEWS = ["current", "front", "back", "left", "right", "top", "iso"] as const;
export type View = (typeof VIEWS)[number];
