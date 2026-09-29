// Callers must supply only the identity verified by authenticate().
export async function resolveAccount(env, member, { allowBinding = true } = {}) {
  const domain = env.ACCESS_TEAM_DOMAIN;
  if (!domain || !member.id || !member.email) return { status: 'unavailable' };
  const issuer = `https://${domain}`;
  const email = member.email.trim().toLowerCase();
  const { results } = await env.DB.prepare(`
    SELECT i.id AS identity_id, i.user_id, i.provider, i.issuer, i.subject, i.login_email, i.bound_at,
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
  if (row.provider !== 'cloudflare_access' || row.login_email !== email) return { status: 'identity_mismatch' };
  if (!['pending', 'active', 'disabled'].includes(row.account_status) || !['member', 'administrator'].includes(row.role)) return { status: 'conflict' };
  if (row.account_status === 'disabled') return { status: 'disabled' };
  if (!row.linked_person_id || row.person_deleted) return { status: 'person_inactive' };
  if (row.subject === null && row.bound_at === null && allowBinding && member.local === false) {
    // Only an existing approved identity can bind; no account creation or Directory
    // email lookup. Active-but-unbound roster entries and pending accounts are eligible.
    await bindApprovedIdentity(env.DB, row, issuer, email, member.id);
    return resolveAccount(env, member, { allowBinding: false });
  }
  if (row.subject !== member.id || !row.bound_at) return { status: 'identity_mismatch' };
  if (row.account_status !== 'active') return { status: row.account_status };

  return {
    status: 'resolved',
    diagnostic: row.household_id && !row.active_household_id ? 'household_inactive' : undefined,
    account: { id: row.user_id, role: row.role },
    person: { id: row.linked_person_id, first_name: row.first_name, last_name: row.last_name, household_id: row.active_household_id || null },
    household: row.active_household_id ? { id: row.active_household_id, name: row.household_name } : null,
  };
}

async function bindApprovedIdentity(db, row, issuer, email, subject) {
  const eligible = `id=? AND user_id=? AND provider='cloudflare_access' AND issuer=? AND login_email=?
    AND subject IS NULL AND bound_at IS NULL
    AND EXISTS(SELECT 1 FROM app_users u JOIN people p ON p.id=u.person_id
      WHERE u.id=user_id AND u.status IN ('pending','active')
      AND u.role IN ('member','administrator') AND p.deleted_at IS NULL)`;
  const args = [row.identity_id, row.user_id, issuer, email];
  // Audit and binding share one D1 transaction. A subject uniqueness conflict rolls
  // back the audit too. Concurrent/repeated requests see no eligible unbound row.
  await db.batch([
    db.prepare(`INSERT INTO security_audit(id,actor_type,actor_user_id,action,target_type,target_id,details)
      SELECT ?,'user',user_id,'identity.bind','user_identity',id,'{"source":"verified_access_identity"}'
      FROM user_identities WHERE ${eligible}`).bind(crypto.randomUUID(), ...args),
    db.prepare(`UPDATE user_identities SET subject=?,bound_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE ${eligible}`).bind(subject, ...args),
    db.prepare(`UPDATE app_users SET status='active',updated_at=CURRENT_TIMESTAMP,version=version+1
      WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM user_identities
        WHERE id=? AND user_id=app_users.id AND issuer=? AND login_email=? AND subject=? AND bound_at IS NOT NULL)
      AND EXISTS(SELECT 1 FROM people WHERE id=app_users.person_id AND deleted_at IS NULL)`)
      .bind(row.user_id, row.identity_id, issuer, email, subject),
  ]);
}

export function compareAccount(legacy, resolved) {
  if (resolved.status !== 'resolved') return resolved.status;
  if (legacy.person?.id !== resolved.person.id) return 'person_mismatch';
  if ((legacy.household?.id ?? null) !== (resolved.household?.id ?? null)) return 'household_mismatch';
  return resolved.account.role === 'administrator' ? 'administrator_match' : 'member_match';
}
