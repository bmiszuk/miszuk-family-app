import {bodyJson,HttpError} from './errors.js';
import {jsonResponse,isUuid} from './utils.js';
function publicRecord(record) {
  if (!record) return null;
  const result = { ...record };
  delete result.import_key;
  delete result.deleted_at;
  if ('done' in result) result.done = Boolean(result.done);
  if ('home_notice' in result) result.home_notice = Boolean(result.home_notice);
  if ('all_day' in result) result.all_day = Boolean(result.all_day);
  return result;
}

// Internal persistence plumbing only. Feature modules own validation, scope and policy.
export async function handleRecords(request,env,member,id,config) {
 const {table,order,fields,householdId}=config;
 const scope=householdId?' AND household_id=?':'';
 const scopeArgs=householdId?[householdId]:[];
  if (id && !isUuid(id)) throw new HttpError(404, 'Not found.');
  if (request.method === 'GET' && !id) {
    const { results } = await env.DB.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL${scope} ORDER BY ${order}`).bind(...scopeArgs).all();
    return jsonResponse({ items: results.map(publicRecord) });
  }
  if (request.method === 'POST' && !id) {
    const body = await bodyJson(request);
    await config.authorizeWrite?.(body);
    const values = [...await config.values(body)];
    const now = new Date().toISOString();
    const recordId = crypto.randomUUID();
    const names = ['id', ...fields, 'created_by', 'created_at', 'updated_at'];
    const args = [recordId, ...values, member.id, now, now];
    if (householdId) {names.push('household_id');args.push(householdId);}
    if (config.authorName) { names.push('author_name'); args.push(member.name); }
    const record = await env.DB.prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')}) RETURNING *`).bind(...args).first();
    return jsonResponse({ item: publicRecord(record) }, 201);
  }
  if (id && ['PATCH', 'DELETE'].includes(request.method)) {
    const body = await bodyJson(request);
    if (!Number.isSafeInteger(body.version) || body.version < 1) throw new HttpError(400, 'A record version is required.');
    const now = new Date().toISOString();
    let record;
    await config.authorizeWrite?.(body, id);
    if (request.method === 'DELETE') {
      record = await env.DB.prepare(`UPDATE ${table} SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ? AND deleted_at IS NULL${scope} RETURNING *`)
        .bind(now, now, id, body.version,...scopeArgs).first();
    } else {
      const current = await env.DB.prepare(`SELECT * FROM ${table} WHERE id=? AND deleted_at IS NULL${scope}`).bind(id,...scopeArgs).first();
      if (!current || current.version !== body.version) throw new HttpError(409, 'Someone changed this item. Refresh and try again.');
      const merged = { ...current, ...body };
      config.normalizeUpdate?.(merged, current, body);
      const values = [...await config.values(merged, current)];
      record = await env.DB.prepare(`UPDATE ${table} SET ${fields.map(field => `${field} = ?`).join(', ')}, updated_at = ?, version = version + 1 WHERE id = ? AND version = ? AND deleted_at IS NULL${scope} RETURNING *`)
        .bind(...values, now, id, body.version,...scopeArgs).first();
    }
    if (!record) throw new HttpError(409, 'Someone changed this item. Refresh the list and try again.');
    return jsonResponse(request.method === 'DELETE' ? { ok: true } : { item: publicRecord(record) });
  }
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}
