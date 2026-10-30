import { useEffect, useState } from "react";
import styled from "styled-components";
import { WifiSlash } from "@phosphor-icons/react";

const Note = styled.div`
    position: absolute;
    top: calc(var(--topbar) + var(--gap));
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    color: var(--text-muted);
    font-size: 12px;
    z-index: 90;
    pointer-events: none;
`;

// Tells people they can keep working when the connection drops.
export function OfflineNote() {
    const [online, setOnline] = useState(() => navigator.onLine);
    useEffect(() => {
        const update = () => setOnline(navigator.onLine);
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
            window.removeEventListener("online", update);
            window.removeEventListener("offline", update);
        };
    }, []);
    if (online) return null;
    return (
        <Note role="status">
            <WifiSlash size={14} />
            You're offline. Keep building; your work is saved on this device.
        </Note>
    );
}
