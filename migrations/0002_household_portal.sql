-- Add household features without changing or deleting the original schema/data.
CREATE TABLE grocery_items (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  quantity TEXT NOT NULL DEFAULT '' CHECK(length(quantity) <= 80),
  done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  import_key TEXT UNIQUE,
  deleted_at TEXT
);
CREATE INDEX idx_grocery_active ON grocery_items(deleted_at, done, created_at);

CREATE TABLE news_posts (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 5000),
  author_name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE INDEX idx_news_active ON news_posts(deleted_at, created_at);

-- Separate from the older person-linked events table; no historical data is rewritten.
-- All-day dates remain YYYY-MM-DD; timed values are UTC ISO timestamps.
CREATE TABLE household_events (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  start_at TEXT NOT NULL,
  end_at TEXT,
  all_day INTEGER NOT NULL DEFAULT 0 CHECK(all_day IN (0, 1)),
  timezone TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '' CHECK(length(location) <= 240),
  notes TEXT NOT NULL DEFAULT '' CHECK(length(notes) <= 5000),
  author_name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE INDEX idx_household_events_active ON household_events(deleted_at, start_at);
