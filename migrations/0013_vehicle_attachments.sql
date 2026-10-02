-- Private binary contents live in R2. Metadata reserves a slot before upload.
CREATE TABLE vehicle_attachments (
 id TEXT PRIMARY KEY NOT NULL,
 vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
 maintenance_id TEXT REFERENCES vehicle_maintenance(id) ON DELETE RESTRICT,
 object_key TEXT NOT NULL UNIQUE,
 filename TEXT NOT NULL CHECK(length(filename) BETWEEN 1 AND 180),
 content_type TEXT NOT NULL CHECK(content_type IN ('application/pdf','image/jpeg','image/png','image/heic','image/heif')),
 byte_size INTEGER NOT NULL CHECK(typeof(byte_size)='integer' AND byte_size BETWEEN 1 AND 10000000),
 state TEXT NOT NULL DEFAULT 'uploading' CHECK(state IN ('uploading','ready')),
 upload_expires_at TEXT NOT NULL,
 created_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_vehicle_attachments_parent ON vehicle_attachments(vehicle_id,maintenance_id);
CREATE INDEX idx_vehicle_attachments_pending ON vehicle_attachments(state,upload_expires_at);

-- A durable deletion job survives request crashes, unavailable R2 and D1 errors.
CREATE TABLE vehicle_attachment_cleanup (
 object_key TEXT PRIMARY KEY NOT NULL,
 queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0)
);
CREATE TABLE vehicle_attachment_scan (
 id INTEGER PRIMARY KEY CHECK(id=1),
 cursor TEXT
);
INSERT INTO vehicle_attachment_scan(id,cursor) VALUES(1,NULL);

CREATE TRIGGER vehicle_attachment_parent BEFORE INSERT ON vehicle_attachments
BEGIN
 SELECT RAISE(ABORT,'vehicles: Invalid attachment parent.') WHERE NEW.maintenance_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM vehicle_maintenance WHERE id=NEW.maintenance_id AND vehicle_id=NEW.vehicle_id AND deleted_at IS NULL);
 SELECT RAISE(ABORT,'vehicles: Maximum 5 attachments per record.')
 WHERE (SELECT count(*) FROM vehicle_attachments WHERE vehicle_id=NEW.vehicle_id AND maintenance_id IS NEW.maintenance_id)>=5;
END;
CREATE TRIGGER vehicle_attachment_immutable BEFORE UPDATE ON vehicle_attachments
WHEN NEW.id<>OLD.id OR NEW.vehicle_id<>OLD.vehicle_id OR NEW.maintenance_id IS NOT OLD.maintenance_id
 OR NEW.object_key<>OLD.object_key OR NEW.filename<>OLD.filename OR NEW.content_type<>OLD.content_type
 OR NEW.byte_size<>OLD.byte_size OR NEW.upload_expires_at<>OLD.upload_expires_at
 OR NEW.created_by_user_id<>OLD.created_by_user_id OR NEW.created_at<>OLD.created_at
 OR (OLD.state='ready' AND NEW.state<>'ready')
BEGIN
 SELECT RAISE(ABORT,'vehicles: Attachments cannot be replaced or moved.');
END;
CREATE TRIGGER vehicle_attachment_queue AFTER DELETE ON vehicle_attachments
BEGIN
 INSERT OR IGNORE INTO vehicle_attachment_cleanup(object_key) VALUES(OLD.object_key);
END;
CREATE TRIGGER vehicle_maintenance_attachment_cleanup AFTER UPDATE OF deleted_at ON vehicle_maintenance
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
 DELETE FROM vehicle_attachments WHERE maintenance_id=NEW.id;
END;
