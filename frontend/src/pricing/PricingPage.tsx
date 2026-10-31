import { lazy, Suspense, useEffect, useState } from "react";
import styled from "styled-components";
import { ArrowLeft, Check, Sparkle } from "@phosphor-icons/react";
import { PLANS, PRO_PRICES, type BillingInterval } from "@shapeshift/shared/billing/plans";
import { GlobalStyle, Segment, Segmented } from "../components/ui";
import { useResolvedTheme } from "../settings/theme";
import { useAccount } from "../account/store";
import { api, ApiError } from "../account/api";
import { track } from "../telemetry";

const SignInDialog = lazy(() => import("../account/SignInDialog"));

const Page = styled.div`
    // The editor turns off page scrolling, so pages scroll inside themselves.
    height: 100%;
    overflow-y: auto;
    background: radial-gradient(1000px 500px at 50% -10%, color-mix(in srgb, var(--accent) 16%, transparent), transparent), var(--bg);
    color: var(--text);
    padding: calc(20px + env(safe-area-inset-top, 0px)) 20px 56px;
`;

const Back = styled.a`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    text-decoration: none;

    &:hover {
        color: var(--text);
    }
`;

const Head = styled.header`
    max-width: 640px;
    margin: 32px auto 24px;
    text-align: center;

    h1 {
        margin: 0 0 8px;
        font-size: 32px;
        letter-spacing: -0.02em;
    }
    p {
        margin: 0 0 20px;
        color: var(--text-muted);
        font-size: 15px;
        line-height: 1.5;
    }
`;

const Banner = styled.div`
    max-width: 760px;
    margin: 0 auto 20px;
    padding: 12px 16px;
    border-radius: 12px;
    border: 1px solid var(--success);
    background: color-mix(in srgb, var(--success) 12%, transparent);
    text-align: center;
`;

const Cards = styled.div`
    max-width: 760px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
`;

const Card = styled.section<{ $featured?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 22px;
    border-radius: 16px;
    background: var(--surface);
    border: 1px solid ${(p) => (p.$featured ? "var(--accent)" : "var(--border)")};
    box-shadow: ${(p) => (p.$featured ? "0 16px 40px color-mix(in srgb, var(--accent) 18%, transparent)" : "none")};

    h2 {
        margin: 0;
        font-size: 18px;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    ul {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
    }
    li {
        display: flex;
        gap: 8px;
        line-height: 1.4;
    }
    li svg {
        flex-shrink: 0;
        margin-top: 2px;
        color: var(--success);
    }
`;

const Price = styled.div`
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -0.02em;

    small {
        font-size: 14px;
        font-weight: 400;
        color: var(--text-muted);
    }
`;

const Cta = styled.button<{ $primary?: boolean }>`
    height: 42px;
    border-radius: var(--radius);
    border: 1px solid ${(p) => (p.$primary ? "var(--accent)" : "var(--border-strong)")};
    background: ${(p) => (p.$primary ? "var(--accent)" : "transparent")};
    color: ${(p) => (p.$primary ? "var(--accent-text)" : "var(--text)")};
    font-weight: 600;
    font-size: 14px;

    &:disabled {
        opacity: 0.6;
    }
`;

const Small = styled.p`
    margin: 0;
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;
`;

const Faq = styled.dl`
    max-width: 640px;
    margin: 40px auto 0;

    dt {
        font-weight: 600;
        margin-top: 16px;
    }
    dd {
        margin: 4px 0 0;
        color: var(--text-muted);
        line-height: 1.5;
    }
`;

const FREE_FEATURES = [
    "The full editor, hand and voice control",
    "Templates, animation and video recording",
    "Export for 3D printing, GLB and images",
    "Live rooms to build together",
    `${PLANS.free.prompts} assistant prompts a month`,
    `${PLANS.free.cloudScenes} scenes saved to the cloud`,
];

const PRO_FEATURES = [
    "Everything in Free",
    `${PLANS.pro.prompts} assistant prompts a month`,
    "Our most capable assistant for harder builds",
    `${PLANS.pro.cloudScenes} scenes saved to the cloud`,
    "Helps keep ShapeShift free for everyone else",
];

export default function PricingPage() {
    const user = useAccount((s) => s.user);
    const loaded = useAccount((s) => s.loaded);
    const usage = useAccount((s) => s.usage);
    const showSignIn = useAccount((s) => s.showSignIn);
    const [period, setPeriod] = useState<BillingInterval>("year");
    const [available, setAvailable] = useState<boolean | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [slow, setSlow] = useState(false);
    const upgraded = new URLSearchParams(location.search).has("upgraded");
    const theme = useResolvedTheme();
    const pro = user?.plan === "pro";

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);
    useEffect(() => {
        void useAccount.getState().load();
        api.billing()
            .then((b) => setAvailable(b.available))
            .catch(() => setAvailable(false));
    }, []);
    // Stripe tells the server about a new subscription a moment after checkout,
    // so check back a few times until the plan shows up.
    useEffect(() => {
        if (!upgraded || pro) return;
        let tries = 0;
        const timer = setInterval(() => {
            if (++tries > 10) {
                clearInterval(timer);
                setSlow(true);
                return;
            }
            void useAccount.getState().load();
        }, 1500);
        return () => clearInterval(timer);
    }, [upgraded, pro]);

    async function go(action: "checkout" | "portal") {
        if (action === "checkout") track("upgrade_clicked", period);
        setBusy(true);
        setError(null);
        try {
            const { url } = action === "checkout" ? await api.checkout(period) : await api.portal();
            location.assign(url);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Something went wrong.");
            setBusy(false);
        }
    }

    const price = PRO_PRICES[period];
    const renews = usage?.renewsAt ? new Date(usage.renewsAt).toLocaleDateString(undefined, { month: "long", day: "numeric" }) : null;

    let proButton: React.ReactNode;
    if (!loaded || available === null) proButton = <Cta disabled>Loading…</Cta>;
    else if (pro)
        proButton = (
            <Cta onClick={() => void go("portal")} disabled={busy}>
                Manage billing
            </Cta>
        );
    else if (!available) proButton = <Cta disabled>Coming soon</Cta>;
    else if (!user)
        proButton = (
            <Cta $primary onClick={() => useAccount.getState().setShowSignIn(true)}>
                Sign in to upgrade
            </Cta>
        );
    else
        proButton = (
            <Cta $primary onClick={() => void go("checkout")} disabled={busy}>
                {busy ? "Opening checkout…" : "Upgrade to Pro"}
            </Cta>
        );

    return (
        <Page>
            <GlobalStyle />
            <Back href={user ? "/" : "/edit"}>
                <ArrowLeft size={16} />
                {user ? "Your scenes" : "Back to the editor"}
            </Back>
            <Head>
                <h1>Make more with Pro</h1>
                <p>Everything that runs on your device is free, always. Pro adds more assistant help and room for more scenes in the cloud.</p>
                <Segmented>
                    <Segment $active={period === "month"} onClick={() => setPeriod("month")}>
                        Monthly
                    </Segment>
                    <Segment $active={period === "year"} onClick={() => setPeriod("year")}>
                        Yearly · {PRO_PRICES.year.note}
                    </Segment>
                </Segmented>
            </Head>

            {upgraded && <Banner role="status">{pro
                        ? "You're on Pro. Thanks for supporting ShapeShift!"
                        : slow
                          ? "Your payment went through, but your plan hasn't updated yet. Refresh this page in a minute."
                          : "Finishing your upgrade…"}</Banner>}

            <Cards>
                <Card aria-label="Free plan">
                    <h2>Free</h2>
                    <Price>
                        $0 <small>forever</small>
                    </Price>
                    <ul>
                        {FREE_FEATURES.map((f) => (
                            <li key={f}>
                                <Check size={16} weight="bold" />
                                {f}
                            </li>
                        ))}
                    </ul>
                    {user && !pro ? <Cta disabled>Your plan</Cta> : <Cta onClick={() => location.assign("/edit")}>Start creating</Cta>}
                </Card>
                <Card $featured aria-label="Pro plan">
                    <h2>
                        <Sparkle size={18} weight="fill" color="var(--accent)" /> Pro
                    </h2>
                    <Price>
                        ${price.amount} <small>/ {period}</small>
                    </Price>
                    <ul>
                        {PRO_FEATURES.map((f) => (
                            <li key={f}>
                                <Check size={16} weight="bold" />
                                {f}
                            </li>
                        ))}
                    </ul>
                    {proButton}
                    {error && <Small role="alert">{error}</Small>}
                    {pro && usage?.status === "canceling" && renews && <Small>Pro ends on {renews}. You can turn it back on from Manage billing.</Small>}
                    {pro && usage?.status === "past_due" && <Small>Your last payment didn't go through. Update your card in Manage billing.</Small>}
                    {!pro && <Small>Cancel anytime. Payments are handled by Stripe.</Small>}
                </Card>
            </Cards>

            {usage && (
                <Small style={{ marginTop: 20 }}>
                    {user ? "This month you've" : "As a visitor, this month you've"} used {usage.prompts.used} of {usage.prompts.limit} assistant prompts.
                </Small>
            )}

            <Faq>
                <dt>What counts as a prompt?</dt>
                <dd>Each message you send the assistant. However many steps it takes to build what you asked for, it's one prompt.</dd>
                <dt>What happens to my scenes if I cancel?</dt>
                <dd>Nothing is deleted. You keep everything you saved; you just can't add more cloud scenes past the free limit.</dd>
                <dt>Do I need Pro to use hand control or export?</dt>
                <dd>No. Everything that runs on your device, including hands, voice, templates and every export, is free.</dd>
            </Faq>

            {showSignIn && (
                <Suspense fallback={null}>
                    <SignInDialog />
                </Suspense>
            )}
        </Page>
    );
}
