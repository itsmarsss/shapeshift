import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { ArrowLeft, EnvelopeSimple } from "@phosphor-icons/react";
import { Button, Input } from "../components/ui";
import { api, ApiError } from "./api";
import { Dialog } from "./Dialog";
import { useAccount } from "./store";

const Lead = styled.p`
    margin: 0 0 16px;
    color: var(--text-muted);
    line-height: 1.5;
`;

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: 10px;

    input {
        height: 42px;
        font-size: 15px;
    }
    button[type="submit"] {
        height: 40px;
    }
`;

const Code = styled(Input)`
    text-align: center;
    letter-spacing: 10px;
    font-size: 22px !important;
    font-variant-numeric: tabular-nums;
`;

const Row = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: var(--text-muted);

    button {
        border: 0;
        background: none;
        padding: 4px 0;
        color: var(--accent);
    }
    button:disabled {
        color: var(--text-faint);
    }
`;

const ErrorText = styled.div`
    color: var(--danger);
    font-size: 12px;
`;

const DevNote = styled.div`
    padding: 8px 10px;
    border-radius: var(--radius);
    background: var(--surface-raised);
    color: var(--text-muted);
    font-size: 12px;
`;

export function SignInDialog() {
    const setShow = useAccount((s) => s.setShowSignIn);
    const signedIn = useAccount((s) => s.signedIn);
    const [step, setStep] = useState<"email" | "code">("email");
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [devCode, setDevCode] = useState<string | null>(null);
    const [resendIn, setResendIn] = useState(0);
    const codeRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (resendIn <= 0) return;
        const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [resendIn]);

    async function send() {
        setBusy(true);
        setError(null);
        try {
            const res = await api.start(email);
            setDevCode(res.devCode ?? null);
            setStep("code");
            setResendIn(30);
            requestAnimationFrame(() => codeRef.current?.focus());
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Something went wrong.");
        } finally {
            setBusy(false);
        }
    }

    async function verify(value = code) {
        setBusy(true);
        setError(null);
        try {
            const { user } = await api.verify(email, value);
            signedIn(user);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Something went wrong.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog title={step === "email" ? "Sign in to ShapeShift" : "Check your email"} onClose={() => setShow(false)}>
            {step === "email" ? (
                <>
                    <Lead>Save your scenes to the cloud and open them anywhere. We'll email you a code, so there's no password to remember.</Lead>
                    <Form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void send();
                        }}
                    >
                        <Input type="email" autoFocus required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                        {error && <ErrorText role="alert">{error}</ErrorText>}
                        <Button type="submit" $variant="primary" disabled={busy || !email.trim()}>
                            <EnvelopeSimple size={16} />
                            {busy ? "Sending…" : "Email me a code"}
                        </Button>
                    </Form>
                </>
            ) : (
                <>
                    <Lead>
                        We sent a 6-digit code to <b>{email}</b>. It works for 10 minutes.
                    </Lead>
                    <Form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void verify();
                        }}
                    >
                        <Code
                            ref={codeRef}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            placeholder="000000"
                            value={code}
                            onChange={(e) => {
                                const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                                setCode(digits);
                                // Six digits is everything we need, so don't make them press a button.
                                if (digits.length === 6) void verify(digits);
                            }}
                        />
                        {devCode && <DevNote>Local development: your code is {devCode}.</DevNote>}
                        {error && <ErrorText role="alert">{error}</ErrorText>}
                        <Button type="submit" $variant="primary" disabled={busy || code.length !== 6}>
                            {busy ? "Signing in…" : "Sign in"}
                        </Button>
                        <Row>
                            <button
                                type="button"
                                onClick={() => {
                                    setStep("email");
                                    setCode("");
                                    setError(null);
                                }}
                            >
                                <ArrowLeft size={11} /> Different email
                            </button>
                            <button type="button" disabled={resendIn > 0 || busy} onClick={() => void send()}>
                                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                            </button>
                        </Row>
                    </Form>
                </>
            )}
        </Dialog>
    );
}

export default SignInDialog;
