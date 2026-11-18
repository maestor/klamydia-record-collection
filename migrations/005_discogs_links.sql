CREATE TABLE post_discogs_releases (
  link_id INTEGER PRIMARY KEY,
  post_slug TEXT NOT NULL REFERENCES posts(slug) ON DELETE CASCADE,
  release_id INTEGER NOT NULL CHECK (release_id > 0),
  UNIQUE (post_slug, release_id)
);
