-- Retire empty households without deleting their grocery or dinner records.
ALTER TABLE households ADD COLUMN deleted_at TEXT;
CREATE TRIGGER household_delete_members BEFORE UPDATE OF deleted_at ON households
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Move all members out of this household before deleting it.')
  WHERE EXISTS (SELECT 1 FROM people WHERE household_id=NEW.id AND deleted_at IS NULL);
END;
CREATE TRIGGER person_active_household_insert BEFORE INSERT ON people
WHEN NEW.household_id IS NOT NULL AND NEW.deleted_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'directory: Choose an active household.')
  WHERE NOT EXISTS (SELECT 1 FROM households WHERE id=NEW.household_id AND deleted_at IS NULL);
END;
CREATE TRIGGER person_active_household_update BEFORE UPDATE OF household_id ON people
WHEN NEW.household_id IS NOT NULL AND NEW.deleted_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'directory: Choose an active household.')
  WHERE NOT EXISTS (SELECT 1 FROM households WHERE id=NEW.household_id AND deleted_at IS NULL);
END;
