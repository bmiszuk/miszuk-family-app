export const categories=['birthdays','chat','polls','dinner','calendar','family_dates','vehicles'];
export function effectivePreferences(stored={}) {
 return Object.fromEntries(categories.map(key=>[key,Object.hasOwn(stored,key)?stored[key]===true:['birthdays','chat'].includes(key)]));
}
// Only these two internal constants may be used to construct preference SQL.
export function preferenceCondition(category) {
 if(!['birthdays','chat'].includes(category))throw new Error('Unsupported notification category');
 return `coalesce((SELECT json_extract(categories,'$.${category}') FROM notification_preferences WHERE user_id=?),1)=1`;
}
