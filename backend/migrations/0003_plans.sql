-- Plans and billing. Stripe is the source of truth for subscriptions; these
-- columns mirror it from webhooks so every request doesn't have to ask.
ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN plan_status TEXT;
ALTER TABLE users ADD COLUMN plan_renews_at INTEGER;
CREATE UNIQUE INDEX users_stripe_customer ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Assistant use per person (or per hashed network address when signed out)
-- per calendar month.
CREATE TABLE usage (
    subject TEXT NOT NULL,
    period TEXT NOT NULL,
    prompts INTEGER NOT NULL DEFAULT 0,
    steps INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (subject, period)
);
