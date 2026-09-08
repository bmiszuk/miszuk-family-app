export default function PersonSelect({label, people, value, onChange, disabled}) {
  return <label>{label}<select value={value || ''} onChange={event => onChange(event.target.value)} disabled={disabled}>
    <option value="">Not specified</option>
    {value && !people.some(person => person.id === value) && <option value={value}>Previously selected person</option>}
    {people.map(person => <option value={person.id} key={person.id}>{person.first_name} {person.last_name}</option>)}
  </select></label>;
}
