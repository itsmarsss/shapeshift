import type { ReactNode } from "react";
import styled from "styled-components";
import { X } from "@phosphor-icons/react";
import { IconButton } from "../components/ui";
import { Modal } from "../components/Modal";

const Head = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 12px 6px 20px;

    h2 {
        margin: 0;
        font-size: 16px;
    }
`;

const Body = styled.div`
    padding: 6px 20px 20px;

    // A dialog's main action is the same size everywhere, as tall as its fields.
    button[type="submit"],
    form > button:last-child,
    & > button:last-child {
        height: 40px;
    }
    overflow: auto;
`;

export function Dialog({ title, width = 400, onClose, children }: { title: string; width?: number; onClose: () => void; children: ReactNode }) {
    return (
        <Modal label={title} onClose={onClose} style={{ width: `min(${width}px, 100%)` }}>
            <Head>
                <h2>{title}</h2>
                <IconButton title="Close" onClick={onClose}>
                    <X size={16} />
                </IconButton>
            </Head>
            <Body>{children}</Body>
        </Modal>
    );
}
