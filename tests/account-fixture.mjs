export const localIssuer='https://test.cloudflareaccess.com';
export const defaultHousehold='d47ed638-465c-4f19-a7ab-04bb18a30538';
export const localPerson='00000000-0000-4000-8000-000000000001';
export const accountSeed=`
INSERT INTO people(id,family_id,first_name,household_id) SELECT '${localPerson}',id,'Local','${defaultHousehold}' FROM families LIMIT 1;
INSERT INTO app_users(id,person_id,status,role) VALUES('local-account','${localPerson}','active','member');
INSERT INTO user_identities(id,user_id,provider,issuer,login_email,subject,bound_at) VALUES('local-identity','local-account','cloudflare_access','${localIssuer}','family@localhost','local-development',CURRENT_TIMESTAMP);
`;
export function identify(db,person) { db.prepare("UPDATE app_users SET person_id=? WHERE id='local-account'").run(person.id); }
