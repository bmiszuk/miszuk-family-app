-- Add household polls; preserve existing data and notification claims.
CREATE TABLE polls (
 id TEXT PRIMARY KEY NOT NULL,
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
 creator_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 question TEXT NOT NULL CHECK(length(trim(question)) BETWEEN 1 AND 240),
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 closed_at TEXT,
 updated_at TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 CHECK(expires_at>created_at)
);
CREATE INDEX idx_polls_household ON polls(household_id,created_at,id);
CREATE INDEX idx_polls_creator ON polls(creator_user_id,created_at);
CREATE TABLE poll_options (
 poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE RESTRICT,
 id TEXT NOT NULL,
 label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 100),
 position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 7),
 PRIMARY KEY(poll_id,id), UNIQUE(poll_id,position)
);
CREATE TABLE poll_recipients (
 poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE RESTRICT,
 user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 PRIMARY KEY(poll_id,user_id)
);
CREATE INDEX idx_poll_recipients_user ON poll_recipients(user_id,poll_id);
CREATE TABLE poll_responses (
 poll_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 option_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 PRIMARY KEY(poll_id,user_id),
 FOREIGN KEY(poll_id,user_id) REFERENCES poll_recipients(poll_id,user_id) ON DELETE RESTRICT,
 FOREIGN KEY(poll_id,option_id) REFERENCES poll_options(poll_id,id) ON DELETE RESTRICT
);
CREATE TABLE notification_deliveries_next (
 event_key TEXT NOT NULL CHECK(length(event_key) BETWEEN 1 AND 180),
 user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 category TEXT NOT NULL CHECK(category IN ('birthdays','chat','polls')),
 claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TEXT,
 accepted_count INTEGER NOT NULL DEFAULT 0 CHECK(accepted_count BETWEEN 0 AND 10),
 failed_count INTEGER NOT NULL DEFAULT 0 CHECK(failed_count BETWEEN 0 AND 10),
 PRIMARY KEY(event_key,user_id)
);
INSERT INTO notification_deliveries_next SELECT * FROM notification_deliveries;
DROP TABLE notification_deliveries;
ALTER TABLE notification_deliveries_next RENAME TO notification_deliveries;
