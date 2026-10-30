CREATE TABLE IF NOT EXISTS instagram_posts (
  media_id TEXT PRIMARY KEY,
  post_slug TEXT NOT NULL UNIQUE REFERENCES posts(slug),
  permalink TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  media_type TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
