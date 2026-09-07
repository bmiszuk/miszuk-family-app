-- Extend the existing directory tables; household feature tables are untouched.
ALTER TABLE people ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE people ADD COLUMN deleted_at TEXT;
ALTER TABLE relationships ADD COLUMN anniversary_date TEXT;
ALTER TABLE relationships ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE relationships ADD COLUMN deleted_at TEXT;

INSERT INTO families(id, name)
SELECT '7c18b30e-6fc3-439f-8235-599724b250bb', 'Miszuk Family'
WHERE NOT EXISTS (SELECT 1 FROM families);

CREATE TRIGGER directory_relationship_insert BEFORE INSERT ON relationships
WHEN NEW.deleted_at IS NULL AND NEW.relationship_type IN ('spouse', 'parent')
BEGIN
  SELECT RAISE(ABORT, 'directory: Choose two active people in the same family.')
  WHERE NEW.person1_id = NEW.person2_id OR
    (SELECT count(*) FROM people WHERE id IN (NEW.person1_id, NEW.person2_id)
      AND family_id = NEW.family_id AND deleted_at IS NULL) <> 2;
  SELECT RAISE(ABORT, 'directory: A spouse is already assigned. Remove that marriage first.')
  WHERE NEW.relationship_type = 'spouse' AND EXISTS (
    SELECT 1 FROM relationships WHERE relationship_type = 'spouse' AND deleted_at IS NULL
    AND (person1_id IN (NEW.person1_id, NEW.person2_id) OR person2_id IN (NEW.person1_id, NEW.person2_id)));
  SELECT RAISE(ABORT, 'directory: This parent and child are already linked.')
  WHERE NEW.relationship_type = 'parent' AND EXISTS (
    SELECT 1 FROM relationships WHERE relationship_type = 'parent' AND deleted_at IS NULL
    AND person1_id = NEW.person1_id AND person2_id = NEW.person2_id);
  SELECT RAISE(ABORT, 'directory: This parent link would create a circular relationship.')
  WHERE NEW.relationship_type = 'parent' AND EXISTS (
    WITH RECURSIVE descendants(id) AS (
      SELECT NEW.person2_id UNION
      SELECT r.person2_id FROM relationships r JOIN descendants d ON r.person1_id = d.id
      WHERE r.relationship_type = 'parent' AND r.deleted_at IS NULL
    ) SELECT 1 FROM descendants WHERE id = NEW.person1_id);
END;

CREATE TRIGGER directory_person_delete BEFORE UPDATE OF deleted_at ON people
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'directory: Remove this person''s relationships before deleting them.')
  WHERE EXISTS (SELECT 1 FROM relationships WHERE deleted_at IS NULL
    AND (person1_id = NEW.id OR person2_id = NEW.id));
END;
