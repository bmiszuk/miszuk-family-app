import { resolveAccount, compareAccount } from './accounts.js';
import { householdIdentity } from './identity.js';

// Only finite result codes reach server logs: no names, IDs, email, JWT, URL,
// database errors, or account objects. Never expose comparison data to clients.
export async function observeAccountComparison(env, member, report = code => console.info('account-comparison-v1', code)) {
  let outcome;
  try {
    const resolved = await resolveAccount(env, member);
    outcome = resolved.status === 'resolved'
      ? compareAccount(await householdIdentity(env, member), resolved)
      : resolved.status;
  } catch {
    outcome = 'unavailable';
  }
  try { report(outcome); } catch { /* Diagnostics must never affect requests. */ }
  return outcome;
}
