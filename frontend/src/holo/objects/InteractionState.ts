import type { Coords } from "./coords";

interface InteractionState {
    Left: InteractionStateHand | null;
    Right: InteractionStateHand | null;
    angleBetween: number;
}

interface InteractionStateHand {
    isHolding: boolean;
    isPinching: boolean;
    cursor: {
        coords: Coords;
        angle: number;
    } | null;
    depth: number;
}

const DEFAULT_INTERACTION_STATE_HAND: InteractionStateHand = {
    isHolding: false,
    isPinching: false,
    cursor: null,
    depth: 0,
};

const DEFAULT_INTERACTION_STATE: InteractionState = {
    Left: null,
    Right: null,
    angleBetween: 0,
};

export type { InteractionState, InteractionStateHand };
export { DEFAULT_INTERACTION_STATE, DEFAULT_INTERACTION_STATE_HAND };
