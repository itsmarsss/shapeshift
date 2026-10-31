import styled, { createGlobalStyle, css } from "styled-components";
import * as m from "motion/react-m";
import { PALETTE, type ThemeName } from "../ui/palette";

const tokens = (t: ThemeName) => `
        --accent: ${PALETTE[t].accent};
        --accent-hover: ${PALETTE[t].accentHover};
        --accent-text: ${PALETTE[t].accentText};
        --accent-soft: color-mix(in srgb, ${PALETTE[t].accent} 16%, transparent);
        --danger: ${PALETTE[t].danger};
        --success: ${PALETTE[t].success};
        --warning: ${PALETTE[t].warning};
        --axis-x: ${PALETTE[t].axisX};
        --axis-y: ${PALETTE[t].axisY};
        --axis-z: ${PALETTE[t].axisZ};
`;

export const GlobalStyle = createGlobalStyle`
    :root {
        --bg: #0d0e10;
        --surface: #16171a;
        --surface-raised: #1e1f23;
        --surface-hover: #26272c;
        --border: rgba(255, 255, 255, 0.07);
        --border-strong: rgba(255, 255, 255, 0.14);
        --text: #ececee;
        --text-muted: #8e9099;
        --text-faint: #5d5f66;
        ${tokens("dark")}
        --radius: 8px;
        --radius-lg: 12px;
        --topbar: 48px;
        --gap: 12px;
        --cursor: rgba(236, 236, 238, 0.85);
        color-scheme: dark;
    }
    :root[data-theme="light"] {
        --bg: #f4f4f5;
        --surface: #ffffff;
        --surface-raised: #f0f0f2;
        --surface-hover: #e8e8eb;
        --border: rgba(0, 0, 0, 0.08);
        --border-strong: rgba(0, 0, 0, 0.16);
        --text: #18181b;
        --text-muted: #6b6d75;
        --text-faint: #a5a7ae;
        --cursor: rgba(24, 24, 27, 0.8);
        ${tokens("light")}
        color-scheme: light;
    }
    html, body, #root {
        height: 100%;
    }
    body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        overflow: hidden;
        font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
    }
    * { box-sizing: border-box; }
    button, input, select, textarea { font: inherit; color: inherit; }
    button { cursor: pointer; }
    button:disabled { cursor: default; }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
`;

// A motion element, so panels can slide in and out.
export const Panel = styled(m.div)`
    position: absolute;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    overflow: hidden;
`;

export const PanelHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    height: 44px;
    padding: 0 8px 0 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
`;

export const PanelTitle = styled.div`
    font-weight: 600;
`;

const control = css`
    height: 30px;
    border-radius: var(--radius);
    border: 1px solid transparent;
    background: transparent;
    color: var(--text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    white-space: nowrap;
    transition: background 0.12s ease, color 0.12s ease, transform 0.12s ease;

    &:hover:not(:disabled) {
        background: var(--surface-hover);
    }
    &:disabled {
        color: var(--text-faint);
    }
    // A small press, so clicks feel answered.
    @media (prefers-reduced-motion: no-preference) {
        &:active:not(:disabled) {
            transform: scale(0.96);
        }
    }
`;

export const Button = styled.button<{ $variant?: "default" | "primary" | "danger" }>`
    ${control}
    padding: 0 10px;
    ${(p) =>
        p.$variant === "primary" &&
        css`
            background: var(--accent);
            color: var(--accent-text);
            &:hover:not(:disabled) {
                background: var(--accent);
                opacity: 0.9;
            }
            &:disabled {
                background: var(--surface-raised);
            }
        `}
    ${(p) =>
        p.$variant === "danger" &&
        css`
            color: var(--danger);
        `}
`;

export const IconButton = styled.button<{ $active?: boolean; $size?: number }>`
    ${control}
    width: ${(p) => p.$size ?? 30}px;
    height: ${(p) => p.$size ?? 30}px;
    padding: 0;
    color: ${(p) => (p.$active ? "var(--text)" : "var(--text-muted)")};
    background: ${(p) => (p.$active ? "var(--surface-raised)" : "transparent")};

    &:hover:not(:disabled) {
        color: var(--text);
    }
`;

export const Segmented = styled.div`
    display: inline-flex;
    padding: 2px;
    gap: 2px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
`;

export const Segment = styled.button<{ $active: boolean }>`
    ${control}
    height: 26px;
    padding: 0 12px;
    border-radius: 6px;
    color: ${(p) => (p.$active ? "var(--text)" : "var(--text-muted)")};
    background: ${(p) => (p.$active ? "var(--surface-raised)" : "transparent")};
`;

const field = css`
    height: 30px;
    width: 100%;
    min-width: 0;
    padding: 0 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);

    &:focus {
        outline: none;
        border-color: var(--accent);
    }
`;

export const Input = styled.input`
    ${field}
    &[type="color"] {
        padding: 2px;
        cursor: pointer;
    }
    &[type="number"] {
        font-variant-numeric: tabular-nums;
    }
`;

export const Select = styled.select`
    ${field}
    cursor: pointer;
`;

export const FieldLabel = styled.div`
    color: var(--text-muted);
    font-size: 12px;
    margin-bottom: 6px;
`;

export const Divider = styled.div`
    height: 1px;
    background: var(--border);
    flex-shrink: 0;
`;
