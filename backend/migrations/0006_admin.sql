-- People who can open the admin page, and what they may do there. Superusers
-- also come from the SUPERUSER_EMAILS secret, so the owner can't be locked out.
CREATE TABLE admins (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    added_by TEXT,
    added_at INTEGER NOT NULL
);

-- Everything done on the admin page, newest first.
CREATE TABLE admin_log (
    id TEXT PRIMARY KEY,
    at INTEGER NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT
);
CREATE INDEX admin_log_at ON admin_log(at DESC);

ALTER TABLE feedback ADD COLUMN read_at INTEGER;
