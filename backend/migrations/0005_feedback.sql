-- Messages from the in-app feedback box. A picture of the scene, when sent,
-- is kept in R2 under feedback/<id>.jpg.
CREATE TABLE feedback (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    user_id TEXT,
    email TEXT,
    page TEXT,
    message TEXT NOT NULL,
    has_picture INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX feedback_created ON feedback(created_at DESC);
