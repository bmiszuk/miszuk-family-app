export const DEFAULT_HOUSEHOLD = 'd47ed638-465c-4f19-a7ab-04bb18a30538';
export async function householdIdentity(env,member) {
  const person=await env.DB.prepare('SELECT id,first_name,last_name,household_id FROM people WHERE lower(trim(login_email))=? AND deleted_at IS NULL').bind(member.email.trim().toLowerCase()).first();
  const household=await env.DB.prepare('SELECT * FROM households WHERE id=?').bind(person?.household_id || DEFAULT_HOUSEHOLD).first();
  return {...member,person:person || null,household};
}
