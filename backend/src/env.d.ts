// Secrets are not in wrangler.jsonc, so `wrangler types` doesn't see them.
// Set with `wrangler secret put ANTHROPIC_API_KEY`, or in .dev.vars locally.
interface Env {
    ANTHROPIC_API_KEY?: string;
    // Email for sign-in codes. Without it, sign-in only works on localhost.
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    // Billing. Without these, everyone stays on the free plan and the pricing
    // page says Pro isn't available yet.
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    STRIPE_PRICE_MONTHLY?: string;
    STRIPE_PRICE_YEARLY?: string;
}
