import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'vite';
import { Miniflare } from 'miniflare';

test('Cloudflare runtime: migrations, shared writes, conflict checks, and persisted reads', async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, lib: { entry: 'worker.js', formats: ['es'], fileName: 'worker' }, minify: false } });
  const output = Array.isArray(result) ? result[0] : result;
  const script = output.output.find(chunk => chunk.type === 'chunk' && chunk.isEntry).code;
  const mf = new Miniflare({ modules: true, script, compatibilityDate: '2026-07-05', bindings: { LOCAL_DEV: 'true' }, d1Databases: ['DB'] });
  try {
    const db = await mf.getD1Database('DB');
    for (const name of ['0001_initial_schema.sql', '0002_household_portal.sql']) {
      const sql = readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8').replace(/--[^\n]*/g, '');
      await db.batch(sql.split(';').map(value => value.trim()).filter(Boolean).map(value => db.prepare(value)));
    }
    async function call(path, method = 'GET', body) {
      const response = await mf.dispatchFetch(`http://localhost/api/${path}`, { method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) });
      return { status: response.status, data: await response.json() };
    }
    assert.equal((await call('me')).status, 200);
    const { data: { item } } = await call('groceries', 'POST', { name: 'Runtime test', quantity: '2' });
    assert.ok(item.id);
    assert.equal((await call('groceries')).data.items[0].name, 'Runtime test');
    assert.equal((await call(`groceries/${item.id}`, 'PATCH', { ...item, done: true })).status, 200);
    assert.equal((await call(`groceries/${item.id}`, 'PATCH', { ...item, done: false })).status, 409);
    const imported = { items: [{ legacy_id: 'old', name: 'Imported' }] };
    assert.equal((await call('groceries/import', 'POST', imported)).status, 200);
    assert.equal((await call('groceries/import', 'POST', imported)).status, 200);
    assert.equal((await call('groceries')).data.items.length, 2);
    assert.equal((await call('news', 'POST', { title: 'Hello', body: 'Shared from the runtime.' })).status, 201);
    assert.equal((await call('events', 'POST', { title: 'Holiday', all_day: true, start_at: '2026-12-25', timezone: 'America/Chicago' })).status, 201);
    assert.equal((await call('news')).data.items.length, 1);
    assert.equal((await call('events')).data.items.length, 1);
    const production = await mf.dispatchFetch('https://family.miszuk.com/api/me');
    assert.equal(production.status, 503);
  } finally { await mf.dispose(); }
});
