CREATE TABLE discogs_folders (
  folder_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE discogs_fields (
  field_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE discogs_releases (
  release_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE discogs_copies (
  instance_id INTEGER PRIMARY KEY,
  release_id INTEGER NOT NULL REFERENCES discogs_releases(release_id),
  folder_id INTEGER NOT NULL REFERENCES discogs_folders(folder_id),
  data TEXT NOT NULL
);
CREATE INDEX discogs_copies_release ON discogs_copies(release_id);
CREATE INDEX discogs_copies_folder ON discogs_copies(folder_id);
