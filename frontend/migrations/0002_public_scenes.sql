-- A scene can be published to a read-only link. The slug is random so links
-- can't be guessed, and unpublishing clears it.
ALTER TABLE scenes ADD COLUMN public_slug TEXT;
ALTER TABLE scenes ADD COLUMN published_at INTEGER;
CREATE UNIQUE INDEX scenes_public_slug ON scenes(public_slug) WHERE public_slug IS NOT NULL;
