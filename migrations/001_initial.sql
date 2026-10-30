CREATE TABLE IF NOT EXISTS posts (slug TEXT PRIMARY KEY, title TEXT NOT NULL, published_at TEXT NOT NULL, description TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS images (post_slug TEXT NOT NULL REFERENCES posts(slug), position INTEGER NOT NULL, url TEXT NOT NULL, alt TEXT NOT NULL, PRIMARY KEY (post_slug, position));
