-- Phase 1A: additive notification storage; no subscriptions or preferences seeded.
CREATE TABLE push_subscriptions (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 endpoint TEXT NOT NULL UNIQUE CHECK(length(endpoint) BETWEEN 1 AND 2048),
 p256dh TEXT NOT NULL CHECK(length(p256dh)=87),
 auth TEXT NOT NULL CHECK(length(auth)=22),
 vapid_key_id TEXT NOT NULL CHECK(length(vapid_key_id) BETWEEN 1 AND 80),
 device_label TEXT NOT NULL DEFAULT '' CHECK(length(device_label)<=80),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 expiration_time INTEGER,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_success_at TEXT,
 failure_count INTEGER NOT NULL DEFAULT 0 CHECK(failure_count BETWEEN 0 AND 1000),
 last_result TEXT CHECK(last_result IN ('accepted','expired','configuration','temporary','rejected')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(typeof(version)='integer' AND version>=1)
);
CREATE INDEX idx_push_subscriptions_user_enabled ON push_subscriptions(user_id,enabled);
CREATE TABLE notification_preferences (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 categories TEXT NOT NULL DEFAULT '{}' CHECK(length(categories)<=512 AND CASE WHEN json_valid(categories) THEN json_type(categories)='object' ELSE 0 END),
 last_test_at INTEGER,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 version INTEGER NOT NULL DEFAULT 1 CHECK(typeof(version)='integer' AND version>=1)
);
-- Replacing an approved identity must not revive enrollments on the old devices.
-- Binding an unbound approved identity for the first time does not invalidate it.
CREATE TRIGGER notification_identity_replaced AFTER UPDATE OF login_email,issuer,provider,subject ON user_identities
WHEN NEW.login_email<>OLD.login_email OR NEW.issuer<>OLD.issuer OR NEW.provider<>OLD.provider
 OR (OLD.subject IS NOT NULL AND NEW.subject IS NOT OLD.subject)
BEGIN
 UPDATE push_subscriptions SET enabled=0,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=NEW.user_id;
END;
