export function displayNames(people) {
  const first = p => String(p.first_name || '').trim().split(/\s+/)[0];
  const same = (a,b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
  const initial = p => String(p.last_name || '').trim().slice(0,1).toUpperCase();
  return new Map(people.map(p => {
    const peers = people.filter(other => same(first(other), first(p)));
    let name = first(p);
    if (peers.length > 1) {
      const initials = peers.filter(other => same(initial(other), initial(p)));
      name = initials.length === 1 ? name + ' ' + (initial(p) || '·') + '.' : (name + ' ' + (p.last_name || '')).trim();
      if (initials.length > 1) {
        name = [name, p.middle_name || ''].filter(Boolean).join(' ');
        if (initials.filter(other => same(other.last_name || '', p.last_name || '') && same(other.middle_name || '', p.middle_name || '')).length > 1) name += ' · ' + String(p.id).slice(0,6);
      }
    }
    return [p.id, name];
  }));
}

export function chronologicalMessages(posts) {
  return [...posts].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
export function activeNotices(posts) { return chronologicalMessages(posts).filter(post => post.home_notice); }
export function senderName(post, people) {
  return displayNames(people).get(post.sender_person_id) || post.author_name;
}
export const postedTime = value => new Date(value).toLocaleString('en-US', {timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});

// Undefined means use the mapped default; an explicit empty selection stays cleared.
export function selectedPerson(selection, record, field, currentPersonId) {
  return selection ?? (record ? record[field] || '' : currentPersonId || '');
}

export function householdTitle(name, feature) {
  const household = (name || '').replace(/\bhousehold\b/gi, '').replace(/\s+/g, ' ').trim();
  return household ? household + ' ' + feature : feature;
}

