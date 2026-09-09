import {HttpError} from './errors.js';
import {isUuid} from './utils.js';
export async function saveDirectoryPerson({db,id,body,values,now,dateField,requireRelationship}) {
  const personId=id || crypto.randomUUID();
  const current=id ? await db.prepare('SELECT * FROM people WHERE id=? AND deleted_at IS NULL').bind(id).first() : null;
  if(id && (!current || current.version!==body.version))throw new HttpError(409,'Someone changed this record. Refresh and reopen it.');
  const family=current || await db.prepare('SELECT id AS family_id FROM families ORDER BY created_at,id LIMIT 1').first();
  if(!family)throw new HttpError(409,'The family record is missing.');
  const existing=id ? (await db.prepare('SELECT * FROM relationships WHERE deleted_at IS NULL AND (person1_id=? OR person2_id=?) ORDER BY id').bind(id,id).all()).results : [];
  if(id && Object.hasOwn(body,'relationships')) {
    const expected=body.relationship_versions;
    if(!Array.isArray(expected)||JSON.stringify([...expected].sort())!==JSON.stringify(existing.map(r=>r.id+':'+r.version).sort()))throw new HttpError(409,'Relationships changed. Refresh and reopen this person.');
  }
  const statements=[];
  if(!id) statements.push(db.prepare('INSERT INTO people(id,family_id,first_name,last_name,birth_date,login_email,household_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(personId,family.family_id,...values,now,now));
  else {
    // A failing NOT NULL guard rolls back all staged changes in the D1 batch.
    const signature=existing.map(r=>r.id+':'+r.version).join(',');
    statements.push(db.prepare("UPDATE people SET first_name=?,last_name=?,birth_date=?,login_email=?,household_id=?,updated_at=?,version=CASE WHEN version=? AND COALESCE((SELECT group_concat(token,',') FROM (SELECT id||':'||version AS token FROM relationships WHERE deleted_at IS NULL AND (person1_id=? OR person2_id=?) ORDER BY id)),'')=? THEN version+1 ELSE NULL END WHERE id=? AND deleted_at IS NULL").bind(...values,now,body.version,id,id,signature,id));
  }
  if(Object.hasOwn(body,'relationships')) {
    if(!Array.isArray(body.relationships)||body.relationships.length>200)throw new HttpError(400,'Invalid relationships.');
    const desired=body.relationships.map(r=>({...r,person1_id:r.person1_id==='self'?personId:r.person1_id,person2_id:r.person2_id==='self'?personId:r.person2_id}));
    const retained=new Set();
    for(const r of desired) {
      if(!['parent','spouse'].includes(r.relationship_type)||!isUuid(r.person1_id)||!isUuid(r.person2_id)||r.person1_id===r.person2_id||![r.person1_id,r.person2_id].includes(personId))throw new HttpError(400,'Choose valid relationships for this person.');
      if(!id && r.relationship_type==='parent' && r.person2_id!==personId)throw new HttpError(400,'Choose parents of the new person.');
      const old=r.id && existing.find(item=>item.id===r.id);
      if(r.id && (!old||old.version!==r.version||old.person1_id!==r.person1_id||old.person2_id!==r.person2_id||old.relationship_type!==r.relationship_type))throw new HttpError(409,'Relationships changed. Refresh and reopen this person.');
      const anniversary=r.relationship_type==='spouse'?dateField(r.anniversary_date,false):null;
      if(old) {
        if(retained.has(old.id))throw new HttpError(400,'A relationship was included twice.');
        retained.add(old.id);
        if(anniversary!==old.anniversary_date) {
          await requireRelationship(old);
          statements.push(db.prepare('UPDATE relationships SET anniversary_date=?,updated_at=?,version=version+1 WHERE id=?').bind(anniversary,now,old.id));
        }
      } else {
        if(id)await requireRelationship(r);
        const pair=r.relationship_type==='spouse'?[r.person1_id,r.person2_id].sort():[r.person1_id,r.person2_id];
        statements.push(db.prepare('INSERT INTO relationships(id,family_id,person1_id,person2_id,relationship_type,anniversary_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),family.family_id,...pair,r.relationship_type,anniversary,now,now));
      }
    }
    const removals=[];
    for(const old of existing.filter(r=>['parent','spouse'].includes(r.relationship_type)&&!retained.has(r.id))) {
      await requireRelationship(old);
      removals.push(db.prepare('UPDATE relationships SET deleted_at=?,updated_at=?,version=version+1 WHERE id=?').bind(now,now,old.id));
    }
    statements.splice(1,0,...removals);
  }
  await db.batch(statements);
  return db.prepare('SELECT * FROM people WHERE id=?').bind(personId).first();
}
