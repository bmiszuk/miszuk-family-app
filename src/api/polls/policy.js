// Parameter order: user ID, household ID. Recheck mutable account/person/household state in SQL.
export const householdActor=`EXISTS(SELECT 1 FROM app_users actor JOIN people person ON person.id=actor.person_id
 JOIN households household ON household.id=person.household_id WHERE actor.id=? AND actor.status='active'
 AND person.deleted_at IS NULL AND household.deleted_at IS NULL AND household.id=?)`;
// Internal notification filter, never supplied by a client. Parameter order: poll ID, user ID.
export const pollSendEligible=`EXISTS(SELECT 1 FROM polls q JOIN poll_recipients r ON r.poll_id=q.id
 JOIN app_users u ON u.id=r.user_id JOIN people p ON p.id=u.person_id JOIN households h ON h.id=q.household_id
 WHERE q.id=? AND r.user_id=? AND u.status='active' AND p.deleted_at IS NULL AND h.deleted_at IS NULL
 AND p.household_id=q.household_id AND q.closed_at IS NULL AND q.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
 AND NOT EXISTS(SELECT 1 FROM poll_responses a WHERE a.poll_id=q.id AND a.user_id=r.user_id))`;
