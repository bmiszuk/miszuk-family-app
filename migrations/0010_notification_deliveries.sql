-- One claim per event/account, before sending to its currently enrolled devices.
-- Retain claims when devices are removed; re-enrollment must not replay events.
CREATE TABLE notification_deliveries (
 event_key TEXT NOT NULL CHECK(length(event_key) BETWEEN 1 AND 180),
 user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 category TEXT NOT NULL CHECK(category IN ('birthdays','chat')),
 claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TEXT,
 accepted_count INTEGER NOT NULL DEFAULT 0 CHECK(accepted_count BETWEEN 0 AND 10),
 failed_count INTEGER NOT NULL DEFAULT 0 CHECK(failed_count BETWEEN 0 AND 10),
 PRIMARY KEY(event_key,user_id)
);
