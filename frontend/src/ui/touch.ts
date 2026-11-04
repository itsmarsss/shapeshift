// A device with only a finger to point with, where there's no Shift-click.
export const touchOnly = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
