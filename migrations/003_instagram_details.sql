CREATE TABLE IF NOT EXISTS instagram_images (
  post_slug TEXT NOT NULL REFERENCES posts(slug),
  position INTEGER NOT NULL,
  media_id TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  format TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  preview_url TEXT NOT NULL,
  PRIMARY KEY (post_slug, position)
);
CREATE TABLE IF NOT EXISTS tags (normalized TEXT PRIMARY KEY, display TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS post_tags (
  post_slug TEXT NOT NULL REFERENCES posts(slug),
  tag_normalized TEXT NOT NULL REFERENCES tags(normalized),
  PRIMARY KEY (post_slug, tag_normalized)
);
CREATE TABLE IF NOT EXISTS import_runs (
  id INTEGER PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  summary TEXT NOT NULL
);
