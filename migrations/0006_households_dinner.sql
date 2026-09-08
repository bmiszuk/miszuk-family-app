CREATE TABLE households (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100)
);
INSERT INTO households(id,name) VALUES('d47ed638-465c-4f19-a7ab-04bb18a30538','Default household');
ALTER TABLE people ADD COLUMN household_id TEXT REFERENCES households(id);
ALTER TABLE grocery_items ADD COLUMN household_id TEXT NOT NULL DEFAULT 'd47ed638-465c-4f19-a7ab-04bb18a30538';
CREATE INDEX idx_grocery_household ON grocery_items(household_id,deleted_at,done,created_at);
CREATE TABLE dinner_signups (
  household_id TEXT NOT NULL REFERENCES households(id),
  day TEXT NOT NULL,
  person_id TEXT REFERENCES people(id),
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(household_id,day)
);
