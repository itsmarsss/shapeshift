// What each plan includes. The editor, hands, voice and exports run on the
// person's own device and are free for everyone; the limits cover what costs
// money to run: the assistant's model calls and cloud storage.

export type PlanId = "guest" | "free" | "pro";

export type Plan = {
    name: string;
    // Assistant prompts per calendar month (UTC).
    prompts: number;
    // Scenes kept in the cloud.
    cloudScenes: number;
};

export const PLANS: Record<PlanId, Plan> = {
    // Not signed in, counted per network address.
    guest: { name: "Guest", prompts: 10, cloudScenes: 0 },
    free: { name: "Free", prompts: 50, cloudScenes: 10 },
    pro: { name: "Pro", prompts: 300, cloudScenes: 200 },
};

// Shown on the pricing page. The charged amounts come from the Stripe prices
// the server is configured with, so keep these in step with those.
export const PRO_PRICES = {
    month: { amount: 12, label: "$12 / month" },
    year: { amount: 99, label: "$99 / year", note: "Save 30%" },
} as const;
export type BillingInterval = keyof typeof PRO_PRICES;

// Model calls allowed per prompt on average. A prompt is one message from the
// person; the steps after it, as the assistant uses tools, share its budget.
export const STEPS_PER_PROMPT = 15;

export type Usage = {
    plan: PlanId;
    prompts: { used: number; limit: number };
    // When the monthly count starts over, in milliseconds since the epoch.
    resetsAt: number;
    // Set for paid plans.
    status?: string | null;
    renewsAt?: number | null;
};
