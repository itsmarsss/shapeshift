import styled, { css, keyframes } from "styled-components";

// Pieces shared by the pages around the editor (home, Explore, pricing), so
// they look like one site.

const enter = keyframes`
    from {
        opacity: 0;
        transform: translateY(10px);
    }
`;

const fadeIn = keyframes`
    from {
        opacity: 0;
    }
`;

// Fades in, for pictures that arrive after the page.
export const appearing = css`
    @media (prefers-reduced-motion: no-preference) {
        animation: ${fadeIn} 0.3s ease backwards;
    }
`;

// Rises into place when the page opens. Plain CSS rather than the animation
// library, so a page never waits on it to show. Set --i on siblings to have
// them come in one after another.
export const entering = css`
    @media (prefers-reduced-motion: no-preference) {
        animation: ${enter} 0.38s cubic-bezier(0.22, 1, 0.36, 1) backwards;
        animation-delay: calc(min(var(--i, 0), 12) * 35ms);
    }
`;

export const Container = styled.main`
    width: min(1120px, 100%);
    margin: 0 auto;
    padding: 36px 24px 64px;

    @media (max-width: 640px) {
        padding: 24px 16px 48px;
    }
`;

// A page's title, a line about it, and its main actions.
export const PageHead = styled.header`
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px 24px;
    flex-wrap: wrap;
    margin-bottom: 32px;
    ${entering}

    h1 {
        margin: 0;
        font-size: 30px;
        line-height: 1.15;
        letter-spacing: -0.025em;
    }
    p {
        margin: 8px 0 0;
        max-width: 560px;
        color: var(--text-muted);
        font-size: 15px;
        line-height: 1.5;
    }

    @media (max-width: 640px) {
        margin-bottom: 24px;

        h1 {
            font-size: 24px;
        }
    }
`;

export const SectionHead = styled.div`
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin: 44px 0 14px;

    h2 {
        margin: 0;
        font-size: 17px;
        letter-spacing: -0.01em;
    }
    span {
        color: var(--text-faint);
        font-weight: 600;
    }
`;

// Cards laid out in as many columns as fit, two on phones.
export const Tiles = styled.div<{ $min?: number }>`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(${(p) => p.$min ?? 200}px, 1fr));
    gap: 16px;

    @media (max-width: 640px) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
    }
`;

// A card with a picture on top and a caption under it.
export const tile = css`
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    background: var(--surface);
    color: var(--text);
    text-decoration: none;
    transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease,
        transform 0.15s ease;
    ${entering}

    &:hover {
        border-color: var(--border-strong);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.12);
        transform: translateY(-2px);
    }
`;

export const TileArt = styled.div`
    aspect-ratio: 4 / 3;
    display: grid;
    place-items: center;
    background: linear-gradient(160deg, var(--surface-raised), var(--surface-hover));
    color: var(--text-faint);
    overflow: hidden;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        ${appearing}
    }
`;

export const TileCaption = styled.div`
    padding: 10px 12px 12px;
    min-width: 0;

    b {
        display: block;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    small {
        display: block;
        margin-top: 2px;
        color: var(--text-muted);
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

export const Empty = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 44px 20px;
    border: 1px dashed var(--border-strong);
    border-radius: 16px;
    text-align: center;
    color: var(--text-muted);
    line-height: 1.55;
    ${entering}

    svg {
        color: var(--text-faint);
    }
    b {
        color: var(--text);
        font-size: 15px;
    }
`;

const action = css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 40px;
    padding: 0 16px;
    border-radius: 10px;
    font-weight: 600;
    white-space: nowrap;
    text-decoration: none;
    transition:
        background 0.15s ease,
        border-color 0.15s ease,
        transform 0.12s ease;

    @media (prefers-reduced-motion: no-preference) {
        &:active {
            transform: scale(0.97);
        }
    }
`;

export const PrimaryAction = styled.a`
    ${action}
    background: var(--accent);
    border: 1px solid var(--accent);
    color: var(--accent-text);

    &:hover {
        background: var(--accent-hover);
    }
`;

export const SecondaryAction = styled.a`
    ${action}
    background: var(--surface);
    border: 1px solid var(--border-strong);
    color: var(--text);

    &:hover {
        background: var(--surface-hover);
    }
`;
