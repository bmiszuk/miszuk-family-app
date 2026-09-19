import {HttpError} from './errors.js';
import {isUuid} from './utils.js';
export function boolField(value, label) {
  if (typeof value !== 'boolean') throw new HttpError(400, `${label} must be true or false.`);
  return Number(value);
}

export async function personReference(env, personId, previous) {
 if (personId && personId !== previous && (!isUuid(personId) || !await env.DB.prepare('SELECT id FROM people WHERE id=? AND deleted_at IS NULL').bind(personId).first())) throw new HttpError(400,'Choose a current directory person.');
 return personId || null;
}
