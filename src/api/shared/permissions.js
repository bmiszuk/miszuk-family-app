import {HttpError} from './errors.js';
import {canEditDirectoryPerson} from '../../domain/directoryPermissions.js';
// The Worker supplies an active account. Administrator overrides are explicitly named.
// Actions remain feature-specific: Directory relationships grant no rights in other modules.
export function can(user, action, resource = {}, context = {}) {
 if (!user) return false;
 switch (action) {
  case 'directory.profile.edit':
  case 'person.edit': return canEditDirectoryPerson(user.person?.id,resource.id,context.relationships || []);
  case 'account.role.change':
  case 'account.identity.replace':
  case 'account.provision':
  case 'account.disable':
  case 'account.enable':
  case 'account.read':
  case 'securityAudit.read':
  case 'directory.profile.editAny':
  case 'directory.anniversary.editAny':
  case 'directory.household.assign':
  case 'directory.relationship.manage':
  case 'household.create':
  case 'household.rename':
  case 'household.retire': return user.account?.role === 'administrator';
  case 'directory.anniversary.edit':
  case 'relationship.edit': return resource.relationship_type === 'parent'
   ? can(user,'person.edit',{id:resource.person2_id},context)
   : can(user,'person.edit',{id:resource.person1_id},context) || can(user,'person.edit',{id:resource.person2_id},context);
  case 'chat.post': return Boolean(user.person);
  case 'chat.edit': return Boolean(user.person && resource.sender_person_id === user.person.id);
  case 'dinner.access': return Boolean(user.household && resource.household_id === user.household.id);
  case 'grocery.access': return Boolean(user.household && resource.household_id === user.household.id);
  case 'dinner.assign': return Boolean(user.person?.household_id);
  case 'household.read': return true;
  default: return false;
 }
}
// Scope must remain in SQL, including writes and bulk operations, not only UI checks.
export function householdScope(user, feature) {
 if (feature !== 'groceries' && feature !== 'dinner') throw new Error('Unknown household feature');
 const id=user?.household?.id;
 if (!id) throw new HttpError(403,'No household assigned. Contact Bob.','HOUSEHOLD_REQUIRED');
 const action=feature==='groceries'?'grocery.access':'dinner.access';
 if (!can(user,action,{household_id:id})) throw new HttpError(403,'Not allowed.');
 return id;
}
