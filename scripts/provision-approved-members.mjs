// Controlled operator helper; never imported by the Worker. Inputs are an explicitly
// approved roster, not a discovery query. Keep production roster files outside Git.
export async function provisionApprovedMembers(db, administratorId, roster) {
  if (!Array.isArray(roster) || !roster.length || roster.length > 20) throw new Error('Invalid roster');
  const admin = await db.prepare("SELECT id FROM app_users WHERE id=? AND status='active' AND role='administrator'").bind(administratorId).first();
  if (!admin) throw new Error('Active approving Administrator required');
  const seen = new Set(), statements = [];
  for (const entry of roster) {
    const {personId,email,householdId,householdName,issuer,userId,identityId,auditId} = entry;
    if (![personId,email,householdId,householdName,issuer,userId,identityId,auditId].every(v=>typeof v==='string'&&v.trim()) || email!==email.trim().toLowerCase() || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) || seen.has(personId) || seen.has(email)) throw new Error('Invalid or duplicate roster entry');
    seen.add(personId);seen.add(email);
    const person=await db.prepare(`SELECT p.id FROM people p JOIN households h ON h.id=p.household_id
      WHERE p.id=? AND p.login_email=? AND p.deleted_at IS NULL AND h.id=? AND h.name=? AND h.deleted_at IS NULL`).bind(personId,email,householdId,householdName).first();
    if (!person) throw new Error('Approved Directory record changed; stop');
    const existing=await db.prepare('SELECT * FROM app_users WHERE person_id=? OR id=?').bind(personId,userId).all();
    if (existing.results.length) {
      const u=existing.results[0];
      const i=await db.prepare('SELECT * FROM user_identities WHERE user_id=?').bind(u.id).first();
      const a=await db.prepare("SELECT id FROM security_audit WHERE id=? AND actor_user_id=? AND action='account.provision' AND target_id=?").bind(auditId,administratorId,userId).first();
      if(existing.results.length!==1 || u.id!==userId || u.person_id!==personId || u.status!=='active' || u.role!=='member' || !i || i.id!==identityId || i.provider!=='cloudflare_access' || i.issuer!==issuer || i.login_email!==email || !a) throw new Error('Existing account conflict; stop');
      continue; // Exact repeated operation preserves any subsequent subject binding.
    }
    statements.push(
      db.prepare(`INSERT INTO app_users(id,person_id,status,role) VALUES(?,CASE WHEN
        EXISTS(SELECT 1 FROM people p JOIN households h ON h.id=p.household_id WHERE p.id=? AND p.login_email=? AND p.deleted_at IS NULL AND h.id=? AND h.name=? AND h.deleted_at IS NULL)
        AND EXISTS(SELECT 1 FROM app_users WHERE id=? AND status='active' AND role='administrator')
        THEN ? ELSE NULL END,'active','member')`).bind(userId,personId,email,householdId,householdName,administratorId,personId),
      db.prepare("INSERT INTO user_identities(id,user_id,provider,issuer,login_email) VALUES(?,?,'cloudflare_access',?,?)").bind(identityId,userId,issuer,email),
      db.prepare(`INSERT INTO security_audit(id,actor_type,actor_user_id,action,target_type,target_id,details)
        VALUES(?,'user',?,'account.provision','app_user',?,'{"role":"member","binding":"approved_unbound"}')`).bind(auditId,administratorId,userId),
    );
  }
  if(statements.length) await db.batch(statements);
  return {created:statements.length/3,alreadyProvisioned:roster.length-statements.length/3};
}
