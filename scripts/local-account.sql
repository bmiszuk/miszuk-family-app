-- Synthetic localhost account only. Never execute remotely.

INSERT OR IGNORE INTO people(id,family_id,first_name,household_id) SELECT '00000000-0000-4000-8000-000000000001',id,'Local','d47ed638-465c-4f19-a7ab-04bb18a30538' FROM families LIMIT 1;
INSERT OR IGNORE INTO app_users(id,person_id,status,role) VALUES('local-account','00000000-0000-4000-8000-000000000001','active','member');
INSERT OR IGNORE INTO user_identities(id,user_id,provider,issuer,login_email,subject,bound_at) VALUES('local-identity','local-account','cloudflare_access','https://test.cloudflareaccess.com','family@localhost','local-development',CURRENT_TIMESTAMP);
