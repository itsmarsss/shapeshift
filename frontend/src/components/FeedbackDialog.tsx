import { useMemo, useState } from "react";
import styled from "styled-components";
import { CheckCircle, PaperPlaneTilt } from "@phosphor-icons/react";
import { Dialog } from "../account/Dialog";
import { useAccount } from "../account/store";
import { takeSnapshot } from "../viewport/snapshot";
import { useUI } from "../ui/store";
import { Button, Input } from "./ui";

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: 12px;

    p {
        margin: 0;
        color: var(--text-muted);
        line-height: 1.5;
    }
    textarea {
        min-height: 120px;
        resize: vertical;
        padding: 10px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg);
        color: var(--text);
        font: inherit;
        line-height: 1.45;
    }
    label {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--text-muted);
    }
    img {
        width: 100%;
        max-height: 160px;
        object-fit: cover;
        border-radius: var(--radius);
        border: 1px solid var(--border);
    }
`;

const Error = styled.p`
    color: var(--danger) !important;
`;

const Thanks = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 20px 0 8px;
    text-align: center;
    color: var(--text-muted);

    svg {
        color: var(--success);
    }
`;

// Tell us what's confusing or broken. Includes a picture of the scene unless
// unticked, and asks for an email only when we don't already have one.
export default function FeedbackDialog() {
    const close = () => useUI.getState().setShowFeedback(false);
    const user = useAccount((s) => s.user);
    const picture = useMemo(() => takeSnapshot({ view: "current", format: "jpeg", maxSize: 900 })?.dataUrl ?? null, []);
    const [message, setMessage] = useState("");
    const [email, setEmail] = useState("");
    const [withPicture, setWithPicture] = useState(true);
    const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
    const [error, setError] = useState<string | null>(null);

    async function send(e: React.FormEvent) {
        e.preventDefault();
        if (!message.trim()) return setError("Write a message first.");
        setState("sending");
        setError(null);
        try {
            const res = await fetch("/api/feedback", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message, email: email.trim(), page: location.pathname, ...(withPicture && picture ? { picture } : {}) }),
            });
            if (!res.ok) throw new globalThis.Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't send that. Try again in a moment.");
            setState("sent");
        } catch (err) {
            setError(err instanceof globalThis.Error ? err.message : "Couldn't send that.");
            setState("idle");
        }
    }

    return (
        <Dialog title="Send feedback" width={440} onClose={close}>
            {state === "sent" ? (
                <Thanks>
                    <CheckCircle size={36} weight="fill" />
                    <b>Thanks! We read every message.</b>
                    <Button onClick={close}>Done</Button>
                </Thanks>
            ) : (
                <Form onSubmit={send}>
                    <p>What's confusing, broken or missing? Anything helps.</p>
                    <textarea autoFocus aria-label="Your feedback" value={message} maxLength={4000} onChange={(e) => setMessage(e.target.value)} />
                    {!user && <Input type="email" placeholder="Email, if you'd like a reply" value={email} onChange={(e) => setEmail(e.target.value)} />}
                    {picture && (
                        <>
                            <label>
                                <input type="checkbox" checked={withPicture} onChange={(e) => setWithPicture(e.target.checked)} />
                                Include a picture of my scene
                            </label>
                            {withPicture && <img src={picture} alt="What will be sent" />}
                        </>
                    )}
                    {error && <Error role="alert">{error}</Error>}
                    <Button $variant="primary" type="submit" disabled={state === "sending"}>
                        <PaperPlaneTilt size={16} />
                        {state === "sending" ? "Sending…" : "Send"}
                    </Button>
                </Form>
            )}
        </Dialog>
    );
}
