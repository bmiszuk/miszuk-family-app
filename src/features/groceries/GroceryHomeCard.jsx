import {useState} from 'react';
import {api} from '../../shared/client.js';
import {useCollection,useAction} from '../../shared/useCollection.js';
import {householdTitle} from '../../domain/familyDisplay.js';
import {ErrorMessage} from '../../shared/ui/Shared.jsx';
import Icon from '../../shared/ui/Icon.jsx';
export default function GroceryHomeCard({member}) {
 const groceries=useCollection('groceries');
  const [name,setName]=useState('');
  const action=useAction(groceries.refresh, 1800);
  async function quickAdd(event) {
    event.preventDefault();
    if(await action.run(()=>api('groceries',{method:'POST',body:{name:name.trim(),requester_person_id:member.person?.id||null}}),'Item added.')) setName('');
  }
  const count = (groceries.items || []).filter(item => !item.done).length;

 return <article className="card summary-card"><Icon name="groceries" /><h3>{householdTitle(member.household?.name, 'Groceries')}</h3>
        <ErrorMessage error={groceries.error} />
        {!groceries.error && <p className="summary-value">{groceries.items === null ? 'Loading…' : `${count} ${count === 1 ? 'item' : 'items'} to pick up`}</p>}
        <form className="home-quick-add" onSubmit={quickAdd}><input aria-label="Grocery item name" placeholder="Add an item…" value={name} onChange={event=>setName(event.target.value)} maxLength={160} required disabled={action.busy}/><button type="submit" aria-label="Add grocery item" disabled={action.busy||!name.trim()}>+</button></form>
        <ErrorMessage error={action.error}/><p className="save-status" role="status">{action.notice}</p>
        <a href="#groceries">Open grocery list <span aria-hidden="true">→</span></a>
      </article>;
}
