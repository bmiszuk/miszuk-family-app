// Comparison-only resolver. Callers must supply the identity verified by authenticate().
// Never substitutes for legacy identity, grants permissions, or binds an identity.
export async function resolveAccount(env, member) {
  const domain = env.ACCESS_TEAM_DOMAIN;
  if (!domain || !member.id || !member.email) return { status: 'unavailable' };
  const issuer = `https://${domain}`;
  const email = member.email.trim().toLowerCase();
  const { results } = await env.DB.prepare(`
    SELECT i.user_id, i.provider, i.issuer, i.subject, i.login_email, i.bound_at,
           u.status AS account_status, u.role, u.person_id,
           p.id AS linked_person_id, p.first_name, p.last_name, p.deleted_at AS person_deleted,
           p.household_id, h.id AS active_household_id, h.name AS household_name
    FROM user_identities i
    LEFT JOIN app_users u ON u.id=i.user_id
    LEFT JOIN people p ON p.id=u.person_id
    LEFT JOIN households h ON h.id=p.household_id AND h.deleted_at IS NULL
    WHERE i.issuer=? AND (i.subject=? OR lower(trim(i.login_email))=?)
    LIMIT 3`).bind(issuer, member.id, email).all();
  if (!results.length) return { status: 'unprovisioned' };
  if (results.length !== 1) return { status: 'conflict' };
  const row = results[0];
  if (row.provider !== 'cloudflare_access' || row.subject !== member.id || !row.bound_at || row.login_email !== email) {
    return { status: 'identity_mismatch' };
  }
  if (!['pending', 'active', 'disabled'].includes(row.account_status) || !['member', 'administrator'].includes(row.role)) return { status: 'conflict' };
  if (row.account_status !== 'active') return { status: row.account_status };
  if (!row.linked_person_id || row.person_deleted) return { status: 'person_inactive' };
  if (row.household_id && !row.active_household_id) return { status: 'household_inactive' };
  return {
    status: 'resolved',
    account: { id: row.user_id, role: row.role },
    person: { id: row.linked_person_id, first_name: row.first_name, last_name: row.last_name, household_id: row.household_id },
    household: row.active_household_id ? { id: row.active_household_id, name: row.household_name } : null,
  };
}

export function compareAccount(legacy, resolved) {
  if (resolved.status !== 'resolved') return resolved.status;
  if (legacy.person?.id !== resolved.person.id) return 'person_mismatch';
  if ((legacy.household?.id ?? null) !== (resolved.household?.id ?? null)) return 'household_mismatch';
  return resolved.account.role === 'administrator' ? 'administrator_match' : 'member_match';
}
