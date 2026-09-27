-- Phase 1 only: unused account storage. No seeding or changes to existing tables.
-- Activation, soft-delete/last-administrator guards and authorization come at cutover.
CREATE TABLE app_users (
  id TEXT PRIMARY KEY NOT NULL,
  person_id TEXT NOT NULL UNIQUE REFERENCES people(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'disabled')),
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member', 'administrator')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1 CHECK(typeof(version) = 'integer' AND version >= 1)
);
CREATE INDEX idx_app_users_status_role ON app_users(status, role);

CREATE TABLE user_identities (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK(length(trim(provider)) > 0),
  issuer TEXT NOT NULL CHECK(length(trim(issuer)) > 0 AND issuer = trim(issuer)),
  login_email TEXT NOT NULL CHECK(
    login_email = lower(trim(login_email)) AND length(login_email) BETWEEN 3 AND 254
    AND instr(login_email, '@') > 1
  ),
  subject TEXT CHECK(subject IS NULL OR length(trim(subject)) > 0),
  bound_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((subject IS NULL AND bound_at IS NULL) OR
        (subject IS NOT NULL AND bound_at IS NOT NULL AND length(trim(bound_at)) > 0))
);
CREATE UNIQUE INDEX idx_user_identities_email ON user_identities(issuer, lower(trim(login_email)));
CREATE UNIQUE INDEX idx_user_identities_subject ON user_identities(issuer, subject) WHERE subject IS NOT NULL;

-- Targets are polymorphic identifiers, not cascading references to mutable records.
-- Details must contain only limited, non-secret structured metadata; writers own redaction.
CREATE TABLE security_audit (
  id TEXT PRIMARY KEY NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('user', 'operator', 'bootstrap')),
  actor_user_id TEXT REFERENCES app_users(id) ON DELETE RESTRICT,
  actor_label TEXT,
  action TEXT NOT NULL CHECK(length(trim(action)) > 0),
  target_type TEXT NOT NULL CHECK(length(trim(target_type)) > 0),
  target_id TEXT NOT NULL CHECK(length(trim(target_id)) > 0),
  details TEXT NOT NULL DEFAULT '{}' CHECK(
    length(details) <= 8192 AND CASE WHEN json_valid(details) THEN json_type(details) = 'object' ELSE 0 END
  ),
  CHECK((actor_type = 'user' AND actor_user_id IS NOT NULL AND actor_label IS NULL) OR
        (actor_type IN ('operator', 'bootstrap') AND actor_user_id IS NULL
         AND actor_label IS NOT NULL AND length(trim(actor_label)) > 0))
);
CREATE INDEX idx_security_audit_time ON security_audit(occurred_at, id);
CREATE INDEX idx_security_audit_actor ON security_audit(actor_user_id, occurred_at);
CREATE INDEX idx_security_audit_target ON security_audit(target_type, target_id, occurred_at);
