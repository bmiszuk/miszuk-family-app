import {householdIdentity} from './households.js';
import { bodyJson, HttpError, stringField } from './errors.js';
import { jsonResponse, isUuid } from './utils.js';

function boolField(value, label) {
  if (typeof value !== 'boolean') throw new HttpError(400, `${label} must be true or false.`);
  return Number(value);
}

function calendarValue(value, allDay, label) {
  if (typeof value !== 'string') throw new HttpError(400, `${label} is required.`);
  const pattern = allDay ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const parsed = new Date(allDay ? `${value}T00:00:00.000Z` : value);
  if (!pattern.test(value) || !Number.isFinite(parsed.getTime()) || (allDay ? parsed.toISOString().slice(0, 10) : parsed.toISOString()) !== value) {
    throw new HttpError(400, `${label} must be a valid ${allDay ? 'date' : 'UTC date and time'}.`);
  }
  return value;
}

const resources = {
  groceries: {
    table: 'grocery_items', order: 'done ASC, created_at ASC, id ASC',
    fields: ['name', 'quantity', 'done'],
    validate(body) {
      return [stringField(body.name, 'Item', 160), stringField(body.quantity, 'Quantity', 80, false), boolField(body.done ?? false, 'Done')];
    },
  },
  news: {
    table: 'news_posts', order: 'created_at DESC, id DESC', fields: ['title', 'body'],
    validate(body) { return [stringField(body.title ?? 'Chat message', 'Title', 160), stringField(body.body, 'News', 5000)]; },
  },
  events: {
    table: 'household_events', order: 'start_at ASC, id ASC',
    fields: ['title', 'start_at', 'end_at', 'all_day', 'timezone', 'location', 'notes'],
    validate(body) {
      const allDay = boolField(body.all_day, 'All day');
      const start = calendarValue(body.start_at, allDay, 'Start');
      const end = body.end_at ? calendarValue(body.end_at, allDay, 'End') : null;
      if (end && (end < start || (!allDay && end === start))) throw new HttpError(400, 'End must be after the start.');
      const timezone = stringField(body.timezone, 'Time zone', 100);
      try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); }
      catch { throw new HttpError(400, 'Choose a valid time zone.'); }
      return [stringField(body.title, 'Title', 160), start, end, allDay, timezone,
        stringField(body.location, 'Location', 240, false), stringField(body.notes, 'Notes', 5000, false)];
    },
  },
};

async function extraValues(env, resource, body, current = {}) {
  const field = resource === 'groceries' ? 'requester_person_id' : resource === 'news' ? 'sender_person_id' : null;
  if (!field) return [];
  const personId = body[field] || null;
  if (personId && personId !== current[field]) {
    if (!isUuid(personId) || !await env.DB.prepare('SELECT id FROM people WHERE id=? AND deleted_at IS NULL').bind(personId).first()) throw new HttpError(400, 'Choose a current directory person.');
  }
  return [personId, ...(resource === 'news' ? [boolField(body.home_notice ?? false, 'Post to Home screen')] : [])];
}

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

export async function handleHousehold(request, env, member, resource, id) {
  const config = resources[resource];
  if (!config) throw new HttpError(404, 'Not found.');
  const { table, order } = config;
  const fields = [...config.fields];
  if (resource === 'groceries') fields.push('requester_person_id');
  if (resource === 'news') fields.push('sender_person_id', 'home_notice'); // Only hard-coded SQL identifiers, never user input.
  const householdId=resource==='groceries' ? (await householdIdentity(env,member)).household.id : null;
  const scope=resource==='groceries' ? ' AND household_id=?' : '';
  const scopeArgs=householdId ? [householdId] : [];
  if (resource === 'groceries' && id === 'import') return importGroceries(request, env, member,householdId);
  if (id && !isUuid(id)) throw new HttpError(404, 'Not found.');
  if (request.method === 'GET' && !id) {
    const { results } = await env.DB.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL${scope} ORDER BY ${order}`).bind(...scopeArgs).all();
    return jsonResponse({ items: results.map(publicRecord) });
  }
  if (request.method === 'POST' && !id) {
    const body = await bodyJson(request);
    const values = [...config.validate(body), ...await extraValues(env, resource, body)];
    const now = new Date().toISOString();
    const recordId = crypto.randomUUID();
    const names = ['id', ...fields, 'created_by', 'created_at', 'updated_at'];
    const args = [recordId, ...values, member.id, now, now];
    if (householdId) {names.push('household_id');args.push(householdId);}
    if (resource !== 'groceries') { names.push('author_name'); args.push(member.name); }
    const record = await env.DB.prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')}) RETURNING *`).bind(...args).first();
    return jsonResponse({ item: publicRecord(record) }, 201);
  }
  if (id && ['PATCH', 'DELETE'].includes(request.method)) {
    const body = await bodyJson(request);
    if (!Number.isSafeInteger(body.version) || body.version < 1) throw new HttpError(400, 'A record version is required.');
    const now = new Date().toISOString();
    let record;
    if (request.method === 'DELETE') {
      record = await env.DB.prepare(`UPDATE ${table} SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ? AND deleted_at IS NULL${scope} RETURNING *`)
        .bind(now, now, id, body.version,...scopeArgs).first();
    } else {
      const current = await env.DB.prepare(`SELECT * FROM ${table} WHERE id=? AND deleted_at IS NULL${scope}`).bind(id,...scopeArgs).first();
      if (!current || current.version !== body.version) throw new HttpError(409, 'Someone changed this item. Refresh and try again.');
      const merged = { ...current, ...body };
      if (resource === 'groceries' && !Object.hasOwn(body, 'done')) merged.done = Boolean(current.done);
      if (resource === 'events' && !Object.hasOwn(body, 'all_day')) merged.all_day = Boolean(current.all_day);
      if (resource === 'news') merged.home_notice = Boolean(current.home_notice);
      if (Object.hasOwn(body, 'home_notice')) merged.home_notice = body.home_notice;
      const values = [...config.validate(merged), ...await extraValues(env, resource, merged, current)];
      record = await env.DB.prepare(`UPDATE ${table} SET ${fields.map(field => `${field} = ?`).join(', ')}, updated_at = ?, version = version + 1 WHERE id = ? AND version = ? AND deleted_at IS NULL${scope} RETURNING *`)
        .bind(...values, now, id, body.version,...scopeArgs).first();
    }
    if (!record) throw new HttpError(409, 'Someone changed this item. Refresh the list and try again.');
    return jsonResponse(request.method === 'DELETE' ? { ok: true } : { item: publicRecord(record) });
  }
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}

async function importGroceries(request, env, member, householdId) {
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
  const body = await bodyJson(request);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) throw new HttpError(400, 'Import 1–100 items at a time.');
  const now = new Date().toISOString();
  const statements = body.items.map(item => {
    if (!item || typeof item !== 'object') throw new HttpError(400, 'Invalid imported item.');
    const legacyId = stringField(String(item.legacy_id ?? ''), 'Old item ID', 100);
    const values = resources.groceries.validate(item);
    return env.DB.prepare('INSERT INTO grocery_items (id, name, quantity, done, created_by, created_at, updated_at, import_key, household_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(import_key) DO NOTHING')
      .bind(crypto.randomUUID(), ...values, member.id, now, now, JSON.stringify([member.id, legacyId]),householdId);
  });
  // D1 batch is transactional. Retries cannot duplicate or resurrect imported records.
  await env.DB.batch(statements);
  return jsonResponse({ ok: true });
}
