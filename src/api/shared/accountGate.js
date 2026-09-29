import { resolveAccount } from './accounts.js';
import { HttpError } from './errors.js';

// This is the only production API account boundary. Never fall back to Directory email.
export async function requireAccount(env, authenticated) {
  let result;
  try { result = await resolveAccount(env, authenticated); }
  catch { result = { status: 'unavailable' }; }
  console.info('account-gate-v1', result.diagnostic || result.status);
  if (result.status === 'unavailable') throw new HttpError(503,
    'Application access is temporarily unavailable. Please try again.', 'APPLICATION_ACCESS_UNAVAILABLE');
  if (result.status !== 'resolved') throw new HttpError(403,
    'Your sign-in succeeded, but application access is unavailable. Contact Bob.', 'APPLICATION_ACCESS_DENIED');
  // Keep the verified subject internal for existing record attribution/import keys.
  return { ...authenticated, account: result.account, person: result.person, household: result.household };
}

export function publicMember(member) {
  return { account: { id: member.account.id, role: member.account.role },
    person: { id: member.person.id, first_name: member.person.first_name,
      last_name: member.person.last_name, household_id: member.person.household_id },
    household: member.household ? { id: member.household.id, name: member.household.name } : null,
    local: member.local === true };
}
