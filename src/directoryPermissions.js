export function canEditDirectoryPerson(actorId, personId, relationships) {
  if (!actorId || !personId) return false;
  return actorId === personId || relationships.some(r => !r.deleted_at && (
    (r.relationship_type === 'parent' && r.person1_id === actorId && r.person2_id === personId) ||
    (r.relationship_type === 'spouse' && ((r.person1_id === actorId && r.person2_id === personId) || (r.person2_id === actorId && r.person1_id === personId)))
  ));
}
