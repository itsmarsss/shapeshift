import { useState } from "react";
import styled from "styled-components";
import { ArrowRight, CheckCircle } from "@phosphor-icons/react";
import { GlobalStyle, Input } from "../components/ui";

const Page = styled.main`
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    background: radial-gradient(1200px 600px at 50% -10%, color-mix(in srgb, var(--accent) 22%, transparent), transparent), var(--bg);
`;

const Card = styled.div`
    width: min(460px, 100%);
    display: flex;
    flex-direction: column;
    gap: 18px;
    text-align: center;

    h1 {
        margin: 0;
        font-size: 34px;
        letter-spacing: -0.02em;
    }
    p {
        margin: 0;
        color: var(--text-muted);
        font-size: 15px;
        line-height: 1.55;
    }
`;

const Logo = styled.img`
    width: 56px;
    height: 56px;
    margin: 0 auto;
`;

const Form = styled.form`
    display: flex;
    gap: 8px;

    input {
        height: 44px;
        font-size: 15px;
    }
    button {
        height: 44px;
        padding: 0 18px;
        border: 0;
        border-radius: var(--radius);
        background: var(--accent);
        color: var(--accent-text);
        font-weight: 600;
        white-space: nowrap;
    }
    button:disabled {
        opacity: 0.6;
    }
    @media (max-width: 420px) {
        flex-direction: column;
    }
`;

const Done = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--success) 14%, transparent);
    color: var(--text);
`;

const ErrorText = styled.div`
    color: var(--danger);
    font-size: 13px;
`;

const Editor = styled.a`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--text-muted);
    text-decoration: none;

    &:hover {
        color: var(--text);
    }
`;

export default function WaitlistPage() {
    const [email, setEmail] = useState("");
    const [state, setState] = useState<"idle" | "sending" | "done" | "already">("idle");
    const [error, setError] = useState<string | null>(null);
    const source = new URL(location.href).searchParams.get("from") ?? undefined;

    async function join(e: React.FormEvent) {
        e.preventDefault();
        setState("sending");
        setError(null);
        try {
            const res = await fetch("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, source }) });
            const data = (await res.json()) as { already?: boolean; error?: string };
            if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
            setState(data.already ? "already" : "done");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
            setState("idle");
        }
    }

    return (
        <Page>
            <GlobalStyle />
            <Card>
                <Logo src="/icon.svg" alt="" />
                <h1>ShapeShift</h1>
                <p>Build 3D scenes with your hands, your voice or plain words. Join the waitlist to hear about new features first.</p>
                {state === "done" || state === "already" ? (
                    <Done role="status">
                        <CheckCircle size={18} weight="fill" color="var(--success)" />
                        {state === "done" ? "You're on the list. Check your inbox." : "You're already on the list."}
                    </Done>
                ) : (
                    <Form onSubmit={join}>
                        <Input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                        <button type="submit" disabled={state === "sending" || !email.trim()}>
                            {state === "sending" ? "Joining…" : "Join the waitlist"}
                        </button>
                    </Form>
                )}
                {error && <ErrorText role="alert">{error}</ErrorText>}
                <Editor href="/">
                    Or start building now <ArrowRight size={14} />
                </Editor>
            </Card>
        </Page>
    );
}
