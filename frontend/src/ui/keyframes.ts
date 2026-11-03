import { keyframes } from "styled-components";

// Looping animations used in more than one place.

// A loading spinner turning.
export const spin = keyframes`to { transform: rotate(360deg); }`;
// Something waiting: fades down and back.
export const pulse = keyframes`50% { opacity: 0.4; }`;
// A sweep of light across a placeholder or a "thinking" label.
export const shimmer = keyframes`
    0% { background-position: 100% 0; }
    100% { background-position: -100% 0; }
`;
