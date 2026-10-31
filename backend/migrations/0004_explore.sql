-- Published scenes can also be listed in the public Explore gallery. That's a
-- separate choice from sharing a link, so it's off unless the owner turns it on.
ALTER TABLE scenes ADD COLUMN listed INTEGER NOT NULL DEFAULT 0;
CREATE INDEX scenes_listed ON scenes(published_at DESC) WHERE listed = 1 AND public_slug IS NOT NULL;
