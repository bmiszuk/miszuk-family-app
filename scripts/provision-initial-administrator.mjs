// Operator-only maintenance helper, never imported by the Worker or run automatically.
// Input must come from a reviewed authenticated /api/me response and the verified
// Access issuer configuration. No JWT, credential, or production identity in Git.
export async function provisionInitialAdministrator(db, verified) {
  const { personId, subject, email, issuer, userId, identityId, auditId } = verified;
  if (![personId, subject, email, issuer, userId, identityId, auditId].every(v => typeof v === 'string' && v.trim()) || email !== email.trim().toLowerCase() || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)) throw new Error('Invalid verified provisioning input');
  const person = await db.prepare('SELECT id,login_email,deleted_at FROM people WHERE id=?').bind(personId).first();
  if (!person || person.deleted_at || person.login_email?.trim().toLowerCase() !== email) throw new Error('Directory identity mismatch');
  const users = (await db.prepare('SELECT * FROM app_users').all()).results;
  const identities = (await db.prepare('SELECT * FROM user_identities').all()).results;
  const audit = (await db.prepare('SELECT * FROM security_audit').all()).results;
  if (users.length || identities.length || audit.length) {
    const u = users[0], i = identities[0], a = audit[0];
    if (users.length !== 1 || identities.length !== 1 || audit.length !== 1 ||
        u.id !== userId || u.person_id !== personId || u.status !== 'active' || u.role !== 'administrator' ||
        i.id !== identityId || i.user_id !== userId || i.provider !== 'cloudflare_access' || i.issuer !== issuer || i.subject !== subject || i.login_email !== email || !i.bound_at ||
        a.id !== auditId || a.actor_type !== 'bootstrap' || a.action !== 'account.bootstrap' || a.target_type !== 'app_user' || a.target_id !== userId) throw new Error('Provisioning state conflict; operator review required');
    return 'already_provisioned';
  }
  // D1 batch is atomic. Recheck the empty-account and reviewed-person preconditions
  // inside the write transaction; a competing execution fails the NOT NULL guard.
  await db.batch([
    db.prepare(`INSERT INTO app_users(id,person_id,status,role)
      VALUES(?, CASE WHEN NOT EXISTS(SELECT 1 FROM app_users)
        AND NOT EXISTS(SELECT 1 FROM user_identities) AND NOT EXISTS(SELECT 1 FROM security_audit)
        AND EXISTS(SELECT 1 FROM people WHERE id=? AND deleted_at IS NULL AND lower(trim(login_email))=?)
        THEN ? ELSE NULL END, 'active', 'administrator')`).bind(userId, personId, email, personId),
    db.prepare(`INSERT INTO user_identities(id,user_id,provider,issuer,login_email,subject,bound_at)
      VALUES(?,?,'cloudflare_access',?,?,?,CURRENT_TIMESTAMP)`).bind(identityId, userId, issuer, email, subject),
    db.prepare(`INSERT INTO security_audit(id,actor_type,actor_label,action,target_type,target_id,details)
      VALUES(?,'bootstrap','Controlled operator provisioning','account.bootstrap','app_user',?,'{"role":"administrator","source":"verified_access_identity"}')`).bind(auditId, userId),
  ]);
  return 'provisioned';
}
