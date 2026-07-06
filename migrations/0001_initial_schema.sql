PRAGMA foreign_keys = ON;

CREATE TABLE families (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_families_name ON families(name);

CREATE TABLE people (
  id TEXT PRIMARY KEY NOT NULL,
  family_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT,
  nickname TEXT,
  birth_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX idx_people_family_id ON people(family_id);
CREATE INDEX idx_people_last_name ON people(last_name);

CREATE TABLE relationships (
  id TEXT PRIMARY KEY NOT NULL,
  family_id TEXT NOT NULL,
  person1_id TEXT NOT NULL,
  person2_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (person1_id) REFERENCES people(id) ON DELETE CASCADE,
  FOREIGN KEY (person2_id) REFERENCES people(id) ON DELETE CASCADE,
  CHECK (person1_id <> person2_id)
);

CREATE INDEX idx_relationships_family_id ON relationships(family_id);
CREATE INDEX idx_relationships_person1_id ON relationships(person1_id);
CREATE INDEX idx_relationships_person2_id ON relationships(person2_id);
CREATE INDEX idx_relationships_type ON relationships(relationship_type);

CREATE TABLE events (
  id TEXT PRIMARY KEY NOT NULL,
  family_id TEXT NOT NULL,
  person_id TEXT,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_type TEXT,
  description TEXT,
  location TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
);

CREATE INDEX idx_events_family_id ON events(family_id);
CREATE INDEX idx_events_person_id ON events(person_id);
CREATE INDEX idx_events_event_date ON events(event_date);
