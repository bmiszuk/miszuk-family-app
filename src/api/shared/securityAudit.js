// The audit guard and mutation must execute in the same D1 batch.
export function privilegedAudit(db,user,action,targetType,targetId,details={},condition={sql:'1',args:[]}) {
 return db.prepare(`INSERT INTO security_audit(id,actor_type,actor_user_id,action,target_type,target_id,details)
 VALUES(CASE WHEN EXISTS(SELECT 1 FROM app_users u JOIN people p ON p.id=u.person_id
 JOIN user_identities i ON i.user_id=u.id WHERE u.id=? AND u.status='active'
 AND u.role='administrator' AND p.deleted_at IS NULL AND i.subject=? AND i.bound_at IS NOT NULL)
 AND (${condition.sql}) THEN ? ELSE NULL END,'user',?,?,?,?,?)`)
 .bind(user.account.id,user.id,...condition.args,crypto.randomUUID(),user.account.id,action,targetType,targetId,JSON.stringify(details));
}
