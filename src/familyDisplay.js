export function displayNames(people) {
  const first = p => p.first_name.trim().split(/\s+/)[0];
  const same = (a,b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
  return new Map(people.map(p => {
    const peers = people.filter(other => same(first(other), first(p)));
    let name = first(p);
    if (peers.length > 1) {
      name = `${name} ${p.last_name || ''}`.trim();
      if (peers.filter(other => same(other.last_name || '', p.last_name || '')).length > 1) name = `${p.first_name} ${p.last_name || ''}`.trim();
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
