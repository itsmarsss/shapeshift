// Secrets are not in wrangler.jsonc, so `wrangler types` doesn't see them.
// Set with `wrangler secret put ANTHROPIC_API_KEY`, or in .dev.vars locally.
interface Env {
    ANTHROPIC_API_KEY?: string;
    // Amazon SES for sign-in codes, with keys that may only send as the app's
    // domain. Without them, sign-in only works on localhost.
    AWS_SES_ACCESS_KEY_ID?: string;
    AWS_SES_SECRET_ACCESS_KEY?: string;
    AWS_SES_REGION?: string;
    EMAIL_FROM?: string;
    // Billing. Without these, everyone stays on the free plan and the pricing
    // page says Pro isn't available yet.
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    STRIPE_PRICE_MONTHLY?: string;
    STRIPE_PRICE_YEARLY?: string;
}
