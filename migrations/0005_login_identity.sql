ALTER TABLE people ADD COLUMN login_email TEXT;
CREATE UNIQUE INDEX idx_people_login_email ON people(lower(trim(login_email))) WHERE login_email IS NOT NULL AND deleted_at IS NULL;
