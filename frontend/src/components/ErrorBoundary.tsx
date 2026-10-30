import { Component, type ErrorInfo, type ReactNode } from "react";
import styled from "styled-components";

const SCENE_KEY = "shapeshift-scene";
const BACKUP_KEY = "shapeshift-scene-backup";

const Screen = styled.div`
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    background: #0d0e10;
    color: #ececee;
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
`;

const Card = styled.div`
    max-width: 440px;
    display: flex;
    flex-direction: column;
    gap: 12px;

    h1 {
        margin: 0;
        font-size: 18px;
    }
    p {
        margin: 0;
        color: #8e9099;
    }
    pre {
        margin: 0;
        max-height: 160px;
        overflow: auto;
        padding: 10px;
        border-radius: 8px;
        background: #16171a;
        color: #8e9099;
        font-size: 12px;
        white-space: pre-wrap;
    }
`;

const Row = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    button {
        height: 34px;
        padding: 0 14px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;
    }
    button:first-child {
        background: var(--accent, #5b80ff);
        border-color: var(--accent, #5b80ff);
        color: #fff;
    }
`;

type State = { error: Error | null };

// Catches render errors so one broken panel doesn't leave a blank page.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("ShapeShift crashed", error, info.componentStack);
    }

    private reloadWithoutScene = () => {
        try {
            // Keep a copy in case the scene is fine and something else broke.
            const saved = localStorage.getItem(SCENE_KEY);
            if (saved) localStorage.setItem(BACKUP_KEY, saved);
            localStorage.removeItem(SCENE_KEY);
        } catch {
            // Storage may be unavailable; reloading is still worth trying.
        }
        location.reload();
    };

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        return (
            <Screen role="alert">
                <Card>
                    <h1>Something went wrong</h1>
                    <p>Your scene is saved in this browser. Reloading usually fixes this.</p>
                    <pre>{error.message || String(error)}</pre>
                    <Row>
                        <button onClick={() => location.reload()}>Reload</button>
                        <button onClick={this.reloadWithoutScene} title={`The saved scene is kept as ${BACKUP_KEY}`}>
                            Reload with an empty scene
                        </button>
                    </Row>
                </Card>
            </Screen>
        );
    }
}
