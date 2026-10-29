// Secrets are not in wrangler.jsonc, so `wrangler types` doesn't see them.
// Set with `wrangler secret put ANTHROPIC_API_KEY`, or in .dev.vars locally.
interface Env {
    ANTHROPIC_API_KEY?: string;
}
