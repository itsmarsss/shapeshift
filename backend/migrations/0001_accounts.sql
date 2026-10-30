-- Accounts use one-time email codes, so there are no passwords to store.
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at INTEGER NOT NULL
);

-- Session tokens are stored as SHA-256 hashes; the raw token only lives in the cookie.
CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- One pending code per email. Codes are hashed and limited to a few tries.
CREATE TABLE login_codes (
    email TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    sent_at INTEGER NOT NULL
);

CREATE TABLE waitlist (
    email TEXT PRIMARY KEY,
    source TEXT,
    created_at INTEGER NOT NULL
);

-- Scene files live in R2; this is the index of who owns what.
CREATE TABLE scenes (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX scenes_owner ON scenes(owner_id, updated_at DESC);
